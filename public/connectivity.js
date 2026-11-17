(() => {
  const BANNER_ID = 'quadConnectivityBanner';
  const slowTimers = new Set();
  let currentKind = '';

  function ensureStyles() {
    if (document.getElementById('quadConnectivityStyles')) return;
    const style = document.createElement('style');
    style.id = 'quadConnectivityStyles';
    style.textContent = `
      #${BANNER_ID}{position:fixed;z-index:2147483646;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);width:min(760px,calc(100vw - 24px));box-sizing:border-box;padding:13px 16px;border-radius:12px;box-shadow:0 12px 34px rgba(15,23,42,.24);display:flex;align-items:center;gap:12px;font:600 15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #${BANNER_ID}[hidden]{display:none}
      #${BANNER_ID}.slow{background:#fff7d6;color:#744c00;border:1px solid #e9bd45}
      #${BANNER_ID}.error{background:#fff0f0;color:#8f1d1d;border:1px solid #e67474}
      #${BANNER_ID} .quad-connectivity-message{flex:1}
      #${BANNER_ID} button{border:1px solid currentColor;border-radius:8px;background:rgba(255,255,255,.78);color:inherit;padding:7px 11px;font:inherit;cursor:pointer;white-space:nowrap}
      @media(max-width:600px){#${BANNER_ID}{align-items:flex-start;font-size:14px}#${BANNER_ID} button{padding:6px 9px}}
    `;
    document.head.appendChild(style);
  }

  function ensureBanner() {
    ensureStyles();
    let banner = document.getElementById(BANNER_ID);
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.hidden = true;
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.innerHTML = '<span class="quad-connectivity-message"></span><button type="button"></button>';
    banner.querySelector('button').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('quad-connectivity-retry'));
    });
    document.body.appendChild(banner);
    return banner;
  }

  function isChinese(language) {
    return String(language || document.documentElement.lang || '').toLowerCase().startsWith('zh');
  }

  function show(kind, message, language) {
    const banner = ensureBanner();
    currentKind = kind;
    banner.className = kind;
    banner.querySelector('.quad-connectivity-message').textContent = message;
    banner.querySelector('button').textContent = isChinese(language) ? '立即重试' : 'TRY AGAIN';
    banner.hidden = false;
  }

  function clear() {
    slowTimers.forEach(timer => clearTimeout(timer));
    slowTimers.clear();
    currentKind = '';
    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.hidden = true;
  }

  function begin({ language, slowMs = 12000 } = {}) {
    let requestTimer = setTimeout(() => {
      slowTimers.delete(requestTimer);
      requestTimer = null;
      show('slow', isChinese(language)
        ? '服务器响应较慢，正在继续连接。若长时间没有恢复，请切换网络或手机热点。'
        : 'The server is responding slowly. If this continues, switch networks or use a mobile hotspot.', language);
    }, slowMs);
    slowTimers.add(requestTimer);
    const stopTimer = () => {
      if (!requestTimer) return;
      clearTimeout(requestTimer);
      slowTimers.delete(requestTimer);
      requestTimer = null;
    };
    return {
      success() {
        stopTimer();
        if (currentKind) clear();
      },
      failure(message) {
        stopTimer();
        show('error', message, language);
      }
    };
  }

  function networkMessage({ language, timedOut = false } = {}) {
    if (isChinese(language)) {
      return timedOut
        ? '服务器线路响应超时。请切换网络或手机热点后重试；页面不会一直停留在加载状态。'
        : '无法连接服务器，可能是服务器线路或当前网络异常。请切换网络或手机热点后重试。';
    }
    return timedOut
        ? 'The server took too long to respond. Your entries are still on this page; tap TRY AGAIN.'
        : 'Cannot reach the server right now. Your entries are still on this page; tap TRY AGAIN.';
  }

  function serverMessage(language) {
    return isChinese(language)
      ? '服务器线路暂时异常，请稍后重试；已输入的内容不会因为自动刷新而清除。'
      : 'The server route is temporarily unavailable. Please try again shortly.';
  }

  window.QuadConnectivity = { begin, clear, show, networkMessage, serverMessage };
})();
