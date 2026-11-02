(() => {
  const zh = () => document.documentElement.lang.startsWith("zh");
  const label = (cn, en) => (zh() ? cn : en);
  const key = "quad.website-chat.token";
  let secret = localStorage.getItem(key) || "",
    pending = "",
    busy = false;
  const host = document.createElement("div");
  host.innerHTML = `<style>
  #websiteChatLaunch{position:fixed;bottom:22px;right:22px;z-index:9000;background:#ccff32;color:#111;border:0;border-radius:30px;padding:16px 22px;font-weight:bold;box-shadow:0 3px 18px #0005;cursor:pointer}
  #websiteChatPanel{position:fixed;bottom:85px;right:20px;width:370px;max-width:calc(100vw - 32px);height:560px;max-height:75vh;background:#fff;color:#17212b;z-index:9001;box-shadow:0 5px 30px #0005;border-radius:16px;display:flex;flex-direction:column;padding:18px;box-sizing:border-box;font:15px system-ui}
  #websiteChatPanel[hidden]{display:none} #websiteChatPanel header{display:flex;justify-content:space-between;background:#fff;color:#17212b;padding:0} #websiteChatPanel input,#websiteChatPanel textarea{width:100%;box-sizing:border-box;padding:10px;margin:5px 0;border:1px solid #bbc8cb;border-radius:8px;background:#fff;color:#17212b;font:inherit} #websiteChatHistory{flex:1;overflow:auto;white-space:pre-wrap;margin:10px 0} #websiteChatHistory p{padding:10px;background:#edf5f7;border-radius:8px;overflow-wrap:anywhere} #websiteChatPanel button{cursor:pointer;padding:9px;border-radius:7px} #websiteChatStatus{color:#a22}
  </style><button id="websiteChatLaunch"></button><section id="websiteChatPanel" hidden aria-label="Contact QUAD FILM"><header><strong>QUAD FILM · Customer Service</strong><button id="websiteChatClose" aria-label="Close">×</button></header><small id="websiteChatHint"></small><div id="websiteChatIdentity"><input id="websiteChatName" maxlength="100" autocomplete="name"><input id="websiteChatContact" maxlength="200" autocomplete="email"></div><div id="websiteChatHistory" aria-live="polite"></div><form id="websiteChatForm"><textarea id="websiteChatText" maxlength="4000" rows="3" required></textarea><div id="websiteChatStatus" role="status"></div><button type="submit" id="websiteChatSend"></button></form></section>`;
  document.body.append(host);
  const el = (id) => document.getElementById(id);
  function labels() {
    el("websiteChatLaunch").textContent = label(
      "联系 QUAD · 留言",
      "Message QUAD",
    );
    el("websiteChatHint").textContent = label(
      "无需注册。请保留本浏览器查看回复；离开网页后不会收到推送。",
      "No account needed. Keep this browser to check replies. No notifications after leaving.",
    );
    el("websiteChatName").placeholder = label("您的姓名", "Your name");
    el("websiteChatContact").placeholder = label(
      "电子邮箱或电话",
      "Email or phone",
    );
    el("websiteChatText").placeholder = label(
      "请输入您的问题…",
      "How can we help?",
    );
    el("websiteChatSend").textContent = label("发送留言", "Send message");
  }
  function render(row) {
    const list = el("websiteChatHistory"),
      bottom = list.scrollHeight - list.clientHeight - list.scrollTop < 60;
    const signature = JSON.stringify(row.messages || []);
    if (list.dataset.signature !== signature) {
      list.dataset.signature = signature;
      list.replaceChildren();
      for (const m of row.messages || []) {
        const p = document.createElement("p"),
          b = document.createElement("b");
        b.textContent =
          (m.role === "guest" ? label("您", "You") : "QUAD FILM") +
          " · " +
          new Date(m.createdAt).toLocaleString();
        p.append(
          b,
          document.createElement("br"),
          document.createTextNode(m.text),
        );
        list.append(p);
      }
      if (bottom) list.scrollTop = list.scrollHeight;
    }
    el("websiteChatIdentity").hidden = Boolean(secret);
  }
  async function refresh() {
    if (!secret || el("websiteChatPanel").hidden || busy) return;
    try {
      const r = await fetch("/api/website-chat", {
        headers: { "x-website-chat-token": secret },
        cache: "no-store",
      });
      if (!r.ok)
        throw Error(
          label(
            "暂时无法获取回复，请稍后重试。",
            "Unable to refresh. Please try later.",
          ),
        );
      render(await r.json());
      el("websiteChatStatus").textContent = "";
    } catch (e) {
      el("websiteChatStatus").textContent = e.message;
    }
  }
  el("websiteChatLaunch").onclick = () => {
    labels();
    el("websiteChatPanel").hidden = !el("websiteChatPanel").hidden;
    refresh();
  };
  el("websiteChatClose").onclick = () => (el("websiteChatPanel").hidden = true);
  el("websiteChatForm").onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = el("websiteChatText").value.trim();
    if (!text) return;
    busy = true;
    el("websiteChatSend").disabled = true;
    pending = pending || crypto.randomUUID();
    try {
      const r = await fetch("/api/website-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-website-chat-token": secret,
        },
        body: JSON.stringify({
          text,
          name: el("websiteChatName").value,
          contact: el("websiteChatContact").value,
          requestId: pending,
        }),
      });
      const row = await r.json();
      if (!r.ok) throw Error(row.error || "Unable to send");
      if (row.token) {
        secret = row.token;
        localStorage.setItem(key, secret);
      }
      pending = "";
      el("websiteChatText").value = "";
      el("websiteChatStatus").textContent = "";
      render(row);
      el("websiteChatHistory").scrollTop =
        el("websiteChatHistory").scrollHeight;
    } catch (e) {
      el("websiteChatStatus").textContent = e.message;
    } finally {
      busy = false;
      el("websiteChatSend").disabled = false;
    }
  };
  labels();
  setInterval(refresh, 3000);
})();
