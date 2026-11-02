const crypto = require("crypto");
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
module.exports = function createWebsiteMessages({
  readDb,
  writeDb,
  readBody,
  send,
  notifyDataChanged,
}) {
  const rates = new Map();
  const safe = (row) => {
    const { secretHash, ...rest } = row;
    return rest;
  };
  return async function handle(req, res, url, user) {
    const guest = url.pathname === "/api/website-chat";
    const staff = url.pathname === "/api/website-messages";
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
        rows.map(safe).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
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
      ...safe(row),
      ...(newSecret ? { token: newSecret } : {}),
    });
    return true;
  };
};
