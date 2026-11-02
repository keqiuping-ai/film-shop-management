(() => {
  let rows = [],
    active = "",
    seen = {},
    loading = false;
  const drafts = new Map();
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
  async function request(body) {
    const r = await fetch("/api/website-messages", {
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
            `<p style="padding:12px;border-radius:10px;background:${m.role === "guest" ? "#fff" : "#e4f4f6"};white-space:pre-wrap;overflow-wrap:anywhere"><b>${esc(m.name)} · ${esc(new Date(m.createdAt).toLocaleString())}</b><br>${esc(m.text)}</p>`,
        )
        .join("");
      if (bottom) history.scrollTop = history.scrollHeight;
    }
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
    p.innerHTML = `<header style="display:flex;justify-content:space-between"><strong>网站客户留言 · 所有员工可查看和回复</strong><button class="btn" data-close>关闭 ×</button></header><div style="display:flex;flex:1;min-height:0;gap:12px;margin-top:12px"><div data-list style="width:28%;overflow:auto"></div><div style="flex:1;min-width:0;display:flex;flex-direction:column"><b data-title></b><div data-history style="flex:1;overflow:auto" aria-live="polite"></div><form data-form><textarea data-text maxlength="4000" required rows="3" style="width:100%;box-sizing:border-box;font:inherit" placeholder="回复客户，客户会在官网看到…"></textarea><span data-status role="status"></span><button class="btn primary" type="submit">发送回复</button></form></div></div>`;
    document.body.append(p);
    p.querySelector("[data-close]").onclick = () => p.remove();
    p.querySelector("[data-form]").onsubmit = async (e) => {
      e.preventDefault();
      const input = p.querySelector("[data-text]"),
        button = p.querySelector("[type=submit]"),
        status = p.querySelector("[data-status]");
      if (!active || !input.value.trim()) return;
      const target = active;
      button.disabled = true;
      try {
        await request({
          id: target,
          text: input.value,
          requestId: crypto.randomUUID(),
        });
        drafts.delete(target);
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
