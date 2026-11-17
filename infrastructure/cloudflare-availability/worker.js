const DEFAULT_PRIMARY = 'https://film-shop-management-production.up.railway.app/api/health';

function htmlPage(state = {}) {
  const healthy = state.primaryHealthy === true;
  const status = healthy ? '主服务器运行正常' : '主服务器线路异常或正在检查';
  const color = healthy ? '#16845b' : '#b45309';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QUAD FILM 备用入口</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef3f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17212b}.card{width:min(620px,calc(100vw - 36px));box-sizing:border-box;background:#fff;padding:34px;border-radius:20px;box-shadow:0 20px 60px #15384826}.brand{display:flex;align-items:center;gap:14px}.logo{width:64px;height:64px;border-radius:12px;display:grid;place-items:center;background:#050505;color:#ffe000;font-size:24px;font-weight:900}h1{margin:0}p{line-height:1.65;color:#52606b}.status{padding:12px 14px;border-radius:10px;background:${color}16;color:${color};font-weight:800}.links{display:grid;gap:10px;margin-top:20px}.links a{text-decoration:none;text-align:center;border-radius:10px;padding:13px 16px;background:#14758a;color:#fff;font-weight:800}.links a.secondary{background:#fff;color:#14758a;border:1px solid #14758a}small{display:block;margin-top:18px;color:#71808b}</style></head><body><main class="card"><div class="brand"><div class="logo">Q</div><div><h1>QUAD FILM 备用入口</h1><p>Independent backup access</p></div></div><div class="status">${status}</div><p>如果主入口长时间无法打开，请先切换手机热点。这里由独立的 Cloudflare 网络提供状态说明，不会与 Railway 页面一起卡在加载状态。</p><div class="links"><a href="https://film-shop-management-production.up.railway.app/">打开管理系统</a><a class="secondary" href="https://quadfilmus.com/">打开 QUAD 官网</a></div><small>最近检查：${state.checkedAt || '尚未检查'}</small></main></body></html>`;
}

async function checkHealth(env) {
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let primaryHealthy = false;
  let detail = '';
  try {
    const response = await fetch(env.PRIMARY_HEALTH_URL || DEFAULT_PRIMARY, {
      signal: controller.signal,
      headers: { 'User-Agent': 'QUAD-External-Health-Monitor/1.0' }
    });
    primaryHealthy = response.ok;
    detail = `HTTP ${response.status}`;
  } catch (error) {
    detail = error?.name === 'AbortError' ? 'timeout' : String(error?.message || error);
  } finally {
    clearTimeout(timer);
  }

  const next = { primaryHealthy, detail, checkedAt };
  const previous = await env.HEALTH_STATE.get('latest', 'json');
  await env.HEALTH_STATE.put('latest', JSON.stringify(next));

  const changed = !previous || previous.primaryHealthy !== primaryHealthy;
  if (changed && env.ALERT_WEBHOOK_URL) {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: primaryHealthy
          ? `QUAD 系统已恢复：${detail}（${checkedAt}）`
          : `QUAD 系统故障通知：主服务器无法访问，${detail}（${checkedAt}）`,
        service: 'quad-film-management',
        status: primaryHealthy ? 'recovered' : 'down',
        checkedAt,
        detail
      })
    });
  }
  return next;
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(checkHealth(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      const state = await env.HEALTH_STATE.get('latest', 'json');
      return Response.json({ monitor: 'ok', ...(state || {}) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const state = await env.HEALTH_STATE.get('latest', 'json');
    return new Response(htmlPage(state || {}), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
};
