const crypto = require("crypto");
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
module.exports = function createWebsiteMessages({
  readDb,
  writeDb,
  readBody,
  send,
  notifyDataChanged,
  translateIncoming = null,
  translateReply = null,
}) {
  const rates = new Map();
  const safe = (row, staffView = false) => {
    const { secretHash, ...rest } = row;
    return {
      ...rest,
      messages: (rest.messages || []).map((message) => {
        if (staffView) return { ...message };
        const { translationZh, translationSourceText, ...publicMessage } = message;
        return publicMessage;
      }),
    };
  };
  return async function handle(req, res, url, user) {
    const guest = url.pathname === "/api/website-chat";
    const staff = url.pathname.startsWith("/api/website-messages");
    if (!guest && !staff) return false;
    if (!["GET", "POST"].includes(req.method)) {
      send(res, 405, { error: "Method not allowed" });
      return true;
    }
    if (
      staff &&
      (!user ||
        !(readDb().users || []).some(
          (u) => u.id === user.id && u.active !== false,
        ))
    ) {
      send(res, 403, { error: "Staff access required" });
      return true;
    }
    const body = req.method === "POST" ? await readBody(req) : {};
    // Read after the asynchronous request body, so concurrent writes are preserved.
    const db = readDb();
    const rows = db.websiteMessages || [];
    if (staff && url.pathname === "/api/website-messages/translate-message") {
      if (req.method !== "POST") {
        send(res, 405, { error: "Method not allowed" });
        return true;
      }
      const row = rows.find((item) => item.id === String(body.id || ""));
      const message = row?.messages?.find(
        (item) => item.id === String(body.messageId || "") && item.role === "guest",
      );
      if (!message) {
        send(res, 404, { error: "找不到这条客户留言" });
        return true;
      }
      if (
        message.translationZh &&
        message.translationSourceText === message.text
      ) {
        send(res, 200, { translation: message.translationZh });
        return true;
      }
      if (typeof translateIncoming !== "function") {
        send(res, 503, { error: "客户留言翻译暂不可用" });
        return true;
      }
      try {
        const translated = await translateIncoming(message.text);
        const translation = String(translated?.text || translated || "").trim();
        if (!translation) throw new Error("AI 没有返回中文译文");
        // The AI request is asynchronous. Re-read before writing so a new customer
        // message or staff reply cannot be lost while translation is in flight.
        const latestDb = readDb();
        const latestRow = (latestDb.websiteMessages || []).find(
          (item) => item.id === row.id,
        );
        const latestMessage = latestRow?.messages?.find(
          (item) => item.id === message.id,
        );
        if (!latestMessage || latestMessage.text !== message.text) {
          send(res, 409, { error: "留言已更新，请重新打开后翻译" });
          return true;
        }
        latestMessage.translationZh = translation.slice(0, 8000);
        latestMessage.translationSourceText = latestMessage.text;
        writeDb(latestDb);
        notifyDataChanged("website-message-translation", row.id);
        send(res, 200, { translation: latestMessage.translationZh });
      } catch (error) {
        send(res, 502, { error: error.message || "客户留言翻译失败" });
      }
      return true;
    }
    if (staff && url.pathname === "/api/website-messages/translate-reply") {
      if (req.method !== "POST") {
        send(res, 405, { error: "Method not allowed" });
        return true;
      }
      const row = rows.find((item) => item.id === String(body.id || ""));
      const text = String(body.text || "").trim();
      if (!row) {
        send(res, 404, { error: "找不到客户会话" });
        return true;
      }
      if (!text || text.length > 4000) {
        send(res, 400, { error: "请先输入需要翻译的中文回复" });
        return true;
      }
      if (!/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(text)) {
        send(res, 400, { error: "输入框里没有检测到中文，无需翻译" });
        return true;
      }
      if (typeof translateReply !== "function") {
        send(res, 503, { error: "客户回复翻译暂不可用" });
        return true;
      }
      try {
        const translated = await translateReply(text);
        const englishText = String(
          translated?.englishText || translated?.text || translated || "",
        ).trim();
        if (!englishText) throw new Error("AI 没有返回英文译文");
        send(res, 200, { chineseText: text, englishText });
      } catch (error) {
        send(res, 502, { error: error.message || "客户回复翻译失败" });
      }
      return true;
    }
    if (staff && url.pathname !== "/api/website-messages") return false;
    const secret = String(req.headers["x-website-chat-token"] || "");
    let row = guest
      ? rows.find((r) => secret && r.secretHash === digest(secret))
      : rows.find((r) => r.id === body.id);
    if (guest && req.method === "GET") {
      send(res, secret && !row ? 404 : 200, row ? safe(row) : { messages: [] });
      return true;
    }
    if (staff && req.method === "GET") {
      send(
        res,
        200,
        rows
          .map((item) => safe(item, true))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
      return true;
    }
    const text = String(body.text || "").trim();
    if (!text || text.length > 4000) {
      send(res, 400, {
        error: "Please enter a message (maximum 4000 characters).",
      });
      return true;
    }
    if (
      staff &&
      /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(text)
    ) {
      send(res, 400, {
        error:
          "检测到中文，系统已阻止发送。请先点击“中英AI翻译”，确认输入框已变成英文。",
      });
      return true;
    }
    if (guest) {
      if (secret && !row) {
        send(res, 404, { error: "Conversation not found" });
        return true;
      }
      const ip = row
        ? `conversation:${row.id}`
        : `new:${String(
            req.headers["x-forwarded-for"] ||
              req.socket.remoteAddress ||
              "unknown",
          )
            .split(",")[0]
            .trim()}`;
      const now = Date.now();
      if (rates.size > 10000)
        for (const [key, value] of rates)
          if (now - value.at > 60000) rates.delete(key);
      const rate = rates.get(ip);
      if (rate && now - rate.at < 60000 && rate.count >= 30) {
        send(res, 429, {
          error: "Please wait a minute before sending more messages.",
        });
        return true;
      }
      rates.set(
        ip,
        !rate || now - rate.at >= 60000
          ? { at: now, count: 1 }
          : { ...rate, count: rate.count + 1 },
      );
    }
    let newSecret;
    if (!row) {
      if (staff) {
        send(res, 404, { error: "Conversation not found" });
        return true;
      }
      const name = String(body.name || "")
        .trim()
        .slice(0, 100);
      const contact = String(body.contact || "")
        .trim()
        .slice(0, 200);
      if (!name || !contact) {
        send(res, 400, { error: "Please enter your name and email or phone." });
        return true;
      }
      newSecret = crypto.randomBytes(32).toString("hex");
      row = {
        id: crypto.randomUUID(),
        secretHash: digest(newSecret),
        name,
        contact,
        createdAt: new Date().toISOString(),
        messages: [],
      };
      rows.push(row);
    }
    const requestId = String(body.requestId || "").slice(0, 100);
    if (
      !requestId ||
      !row.messages.some(
        (m) =>
          m.requestId === requestId && m.role === (guest ? "guest" : "staff"),
      )
    ) {
      row.messages.push({
        id: crypto.randomUUID(),
        requestId,
        role: guest ? "guest" : "staff",
        name: guest ? row.name : user.name || "QUAD FILM",
        text,
        createdAt: new Date().toISOString(),
      });
      row.updatedAt = new Date().toISOString();
      db.websiteMessages = rows;
      writeDb(db);
      notifyDataChanged("website-message", row.id);
    }
    send(res, 200, {
      ...safe(row, staff),
      ...(newSecret ? { token: newSecret } : {}),
    });
    return true;
  };
};
