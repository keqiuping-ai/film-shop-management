(() => {
  let rows = [],
    active = "",
    seen = {},
    loading = false;
  const drafts = new Map();
  const incomingTranslations = new Map();
  const replyTranslations = new Map();
  let replyTranslationBusy = false;
  const esc = (s) =>
    String(s || "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const auth = () => localStorage.getItem("filmShopCloud.token") || "";
  const storageKey = () => "quad.website-seen." + auth().slice(-20);
  const unread = (r) =>
    r.messages.filter(
      (m) => m.role === "guest" && m.createdAt > (seen[r.id] || ""),
    ).length;
  const containsChinese = (value) =>
    /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/u.test(String(value || ""));
  const incomingTranslationEligible = (message) => {
    if (message?.role !== "guest" || !message?.text) return false;
    const probe = String(message.text).replace(
      /(?:https?:\/\/|www\.)\S+|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gi,
      "",
    );
    return /[^\p{Script=Han}\P{L}]/u.test(probe);
  };
  async function request(body, path = "/api/website-messages") {
    const r = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + auth(),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error || "Unable to load messages");
    return data;
  }
  function translationHtml(message) {
    if (!incomingTranslationEligible(message)) return "";
    const state = incomingTranslations.get(message.id);
    const text = message.translationZh || state?.text || "";
    const status = text
      ? esc(text)
      : state?.error
        ? "翻译暂不可用，稍后会自动重试"
        : "翻译中…";
    return `<div class="website-message-translation" data-website-translation="${esc(message.id)}"><span>AI 中文</span><small>${status}</small></div>`;
  }
  async function translateIncomingMessages(row) {
    if (!row) return;
    for (const message of row.messages || []) {
      if (!incomingTranslationEligible(message) || message.translationZh) continue;
      let state = incomingTranslations.get(message.id);
      if (state?.pending || (state?.error && Date.now() - state.at < 60_000)) continue;
      state = { pending: true };
      incomingTranslations.set(message.id, state);
      try {
        const result = await request(
          { id: row.id, messageId: message.id },
          "/api/website-messages/translate-message",
        );
        state.text = String(result.translation || "");
        message.translationZh = state.text;
        message.translationSourceText = message.text;
      } catch (error) {
        state.error = true;
        state.at = Date.now();
      } finally {
        state.pending = false;
      }
      if (active !== row.id) continue;
      const node = document.querySelector(
        `[data-website-translation="${CSS.escape(message.id)}"] small`,
      );
      if (node)
        node.textContent =
          state.text || (state.error ? "翻译暂不可用，稍后会自动重试" : "");
    }
  }
  function updateComposer() {
    const panel = document.getElementById("websiteStaffPanel");
    if (!panel) return;
    const input = panel.querySelector("[data-text]");
    const sendButton = panel.querySelector("[data-send]");
    const translateButton = panel.querySelector("[data-translate-reply]");
    const warning = panel.querySelector("[data-language-warning]");
    const preview = panel.querySelector("[data-translation-preview]");
    const text = String(input?.value || "");
    const blocked = containsChinese(text);
    if (sendButton) sendButton.disabled = blocked || replyTranslationBusy;
    if (translateButton) {
      translateButton.disabled = replyTranslationBusy || !text.trim();
      translateButton.textContent = replyTranslationBusy
        ? "正在翻译…"
        : "🌐 中英AI翻译";
    }
    if (warning) {
      warning.hidden = !blocked;
      warning.textContent = blocked
        ? "检测到中文：为防止误发，当前不能发送。请先点击“中英AI翻译”，确认输入框已变成英文。"
        : "";
    }
    const translated = replyTranslations.get(active);
    if (preview) {
      const show = translated && translated.englishText === text.trim();
      preview.hidden = !show;
      preview.innerHTML = show
        ? `<div><strong>中文原文</strong><p>${esc(translated.chineseText)}</p></div><div><strong>英文发送内容</strong><p>${esc(translated.englishText)}</p></div>`
        : "";
    }
  }
  function badge() {
    const n = rows.reduce((sum, r) => sum + unread(r), 0);
    document
      .querySelectorAll("[data-website-count]")
      .forEach((e) => (e.textContent = n || ""));
    const b = document.getElementById("websiteStaffLaunch");
    if (b) b.textContent = "🌐 网站客户留言" + (n ? " (" + n + ")" : "");
  }
  function draw() {
    const panel = document.getElementById("websiteStaffPanel");
    if (!panel) return;
    const list = panel.querySelector("[data-list]");
    list.innerHTML =
      rows
        .map(
          (r) =>
            `<button data-id="${esc(r.id)}" style="display:block;width:100%;padding:12px;text-align:left;background:${active === r.id ? "#e4f4f6" : "white"};border:1px solid #dae3e6;color:#17212b">${esc(r.name)} ${unread(r) ? "<b>● " + unread(r) + "</b>" : ""}<small style="display:block">${esc(r.messages.at(-1)?.text.slice(0, 65))}</small></button>`,
        )
        .join("") || "暂无网站客户留言";
    list.querySelectorAll("[data-id]").forEach(
      (b) =>
        (b.onclick = () => {
          const input = panel.querySelector("[data-text]");
          drafts.set(active, input.value);
          active = b.dataset.id;
          input.value = drafts.get(active) || "";
          draw();
        }),
    );
    const r = rows.find((r) => r.id === active);
    panel.querySelector("[data-title]").textContent = r
      ? r.name + " · " + r.contact
      : "请选择客户会话";
    const history = panel.querySelector("[data-history]");
    const signature = JSON.stringify(r?.messages || []);
    if (history.dataset.signature !== signature) {
      history.dataset.signature = signature;
      const bottom =
        history.scrollHeight - history.clientHeight - history.scrollTop < 80;
      history.innerHTML = (r?.messages || [])
        .map(
          (m) =>
            `<article class="website-staff-message ${m.role === "guest" ? "guest" : "staff"}"><b>${esc(m.name)} · ${esc(new Date(m.createdAt).toLocaleString())}</b><p>${esc(m.text)}</p>${translationHtml(m)}</article>`,
        )
        .join("");
      if (bottom) history.scrollTop = history.scrollHeight;
    }
    updateComposer();
    void translateIncomingMessages(r);
    if (r && document.visibilityState === "visible") {
      seen[r.id] = r.updatedAt;
      localStorage.setItem(storageKey(), JSON.stringify(seen));
    }
    badge();
  }
  async function refresh() {
    if (!auth() || loading || document.hidden) return;
    loading = true;
    try {
      seen = JSON.parse(localStorage.getItem(storageKey()) || "{}");
      const before = rows.reduce((n, r) => n + unread(r), 0);
      rows = await request();
      const count = rows.reduce((n, r) => n + unread(r), 0);
      badge();
      draw();
      if (count > before && !document.getElementById("websiteStaffPanel")) {
        const toast = document.getElementById("websiteStaffLaunch");
        toast.style.background = "#ffe17b";
        toast.title = "有新的网站客户留言，点击查看";
        let notice = document.getElementById("websiteStaffNotice");
        if (!notice) {
          notice = document.createElement("button");
          notice.id = "websiteStaffNotice";
          notice.style =
            "position:fixed;top:22px;right:22px;z-index:10030;max-width:320px;padding:18px;background:#fff2bd;color:#17212b;border:1px solid #dab54a;border-radius:12px;box-shadow:0 3px 20px #0003;cursor:pointer";
          notice.onclick = () => {
            notice.remove();
            open();
          };
          document.body.append(notice);
          setTimeout(() => notice.remove(), 12000);
        }
        notice.textContent =
          "新的网站客户留言：" +
          (rows.find((r) => unread(r))?.name || "") +
          " · 点击回复";
      }
    } catch (e) {
      const status = document.querySelector("#websiteStaffPanel [data-status]");
      if (status) status.textContent = e.message;
    } finally {
      loading = false;
    }
  }
  function open() {
    if (document.getElementById("websiteStaffPanel")) return;
    document.getElementById("websiteStaffNotice")?.remove();
    document.getElementById("websiteStaffLaunch").style.background = "#e4f4f6";
    active =
      (
        rows.find((r) => unread(r)) ||
        rows.find((r) => r.id === active) ||
        rows[0]
      )?.id || "";
    const p = document.createElement("section");
    p.id = "websiteStaffPanel";
    p.style =
      "position:fixed;inset:5vh 3vw;z-index:10020;background:#f7fafb;color:#17212b;border:1px solid #cddde2;border-radius:14px;padding:18px;box-shadow:0 5px 30px #0005;display:flex;flex-direction:column;font:16px system-ui";
    p.innerHTML = `<header style="display:flex;justify-content:space-between"><strong>网站客户留言 · 所有员工可查看和回复</strong><button class="btn" data-close>关闭 ×</button></header><div class="website-staff-layout"><div data-list class="website-staff-list"></div><div class="website-staff-conversation"><b data-title></b><div data-history class="website-staff-history" aria-live="polite"></div><form data-form class="website-staff-form"><div data-translation-preview class="website-reply-translation" hidden></div><div class="website-staff-translate-row"><button class="btn" type="button" data-translate-reply>🌐 中英AI翻译</button><span data-status role="status"></span></div><textarea data-text maxlength="4000" required rows="3" placeholder="可以先输入中文，翻译成英文后再发送…"></textarea><div data-language-warning class="website-language-warning" role="alert" hidden></div><button class="btn primary" data-send type="submit">发送回复</button></form></div></div>`;
    document.body.append(p);
    p.querySelector("[data-close]").onclick = () => p.remove();
    const replyInput = p.querySelector("[data-text]");
    replyInput.addEventListener("input", () => {
      drafts.set(active, replyInput.value);
      const translated = replyTranslations.get(active);
      if (translated && translated.englishText !== replyInput.value.trim())
        replyTranslations.delete(active);
      updateComposer();
    });
    p.querySelector("[data-translate-reply]").onclick = async () => {
      const sourceText = String(replyInput.value || "").trim();
      const target = active;
      const status = p.querySelector("[data-status]");
      if (!target || !sourceText) return;
      if (!containsChinese(sourceText)) {
        status.textContent = "输入框里没有检测到中文，无需翻译。";
        return;
      }
      if (replyTranslationBusy) return;
      replyTranslationBusy = true;
      status.textContent = "正在翻译为客户可读的英文…";
      updateComposer();
      try {
        const result = await request(
          { id: target, text: sourceText },
          "/api/website-messages/translate-reply",
        );
        if (active !== target || String(replyInput.value || "").trim() !== sourceText)
          return;
        const translated = {
          chineseText: result.chineseText || sourceText,
          englishText: String(result.englishText || "").trim(),
        };
        replyTranslations.set(target, translated);
        drafts.set(target, translated.englishText);
        replyInput.value = translated.englishText;
        status.textContent = "翻译完成，请确认英文内容后点击“发送回复”。";
      } catch (error) {
        status.textContent = error.message;
      } finally {
        replyTranslationBusy = false;
        updateComposer();
        replyInput.focus();
      }
    };
    p.querySelector("[data-form]").onsubmit = async (e) => {
      e.preventDefault();
      const input = p.querySelector("[data-text]"),
        button = p.querySelector("[type=submit]"),
        status = p.querySelector("[data-status]");
      if (!active || !input.value.trim()) return;
      if (containsChinese(input.value)) {
        status.textContent =
          "检测到中文，系统已锁定发送。请先点击“中英AI翻译”。";
        updateComposer();
        return;
      }
      const target = active;
      button.disabled = true;
      try {
        await request({
          id: target,
          text: input.value,
          requestId: crypto.randomUUID(),
        });
        drafts.delete(target);
        replyTranslations.delete(target);
        if (active === target) input.value = "";
        status.textContent = "";
        await refresh();
      } catch (e) {
        status.textContent = e.message;
      } finally {
        button.disabled = false;
      }
    };
    draw();
    refresh();
  }
  const launch = document.createElement("button");
  launch.id = "websiteStaffLaunch";
  launch.style =
    "position:fixed;bottom:16px;right:18px;z-index:8000;padding:12px;border:1px solid #96c5ce;border-radius:22px;background:#e4f4f6;color:#145363;cursor:pointer";
  launch.textContent = "🌐 网站客户留言";
  launch.hidden = true;
  launch.onclick = open;
  document.body.append(launch);
  window.WebsiteStaff = { open };
  setInterval(() => {
    launch.hidden = !auth();
    refresh();
  }, 3000);
})();
