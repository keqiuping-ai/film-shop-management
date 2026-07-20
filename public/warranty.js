const form = document.getElementById('lookupForm');
const button = document.getElementById('lookupButton');
const message = document.getElementById('lookupMessage');
const results = document.getElementById('results');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function warrantyCard(item) {
  const expired = item.warrantyUntil && item.warrantyUntil < new Date().toISOString().slice(0, 10);
  return `<article class="result-card">
    <header class="result-head">
      <div><span class="result-badge ${expired ? 'expired' : ''}">${expired ? '质保已到期 / Expired' : '门店施工质保 / Store Warranty'}</span><h2>${escapeHtml(item.customerName)}</h2><div class="provider">质保门店：QUAD FILM</div></div>
      <div class="install-date">施工日期 / Installation date<strong>${escapeHtml(item.installDate)}</strong></div>
    </header>
    <div class="facts">
      <div class="fact"><span>车辆 / Vehicle</span><strong>${escapeHtml(item.vehicle || '-')}</strong></div>
      <div class="fact"><span>车牌 / License plate</span><strong>${escapeHtml(item.licensePlate || '-')}</strong></div>
      <div class="fact"><span>施工产品 / Installed product</span><strong>${escapeHtml(item.product || '-')}</strong></div>
      <div class="fact"><span>质保期限 / Warranty term</span><strong>${escapeHtml(item.warrantyUntil || '详见质保内容 / See coverage')}</strong></div>
    </div>
    <div class="coverage"><span>贴膜部位 / Installed areas</span><p>${escapeHtml(item.areas || '-')}</p></div>
    <div class="coverage"><span>门店质保内容 / Store warranty coverage</span><p>${escapeHtml(item.warrantyContent || '-')}</p></div>
    ${(item.photos || []).length ? `<div class="photos">${item.photos.map(photo => `<a href="${escapeHtml(photo.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name || '车辆施工照片')}" loading="lazy" /></a>`).join('')}</div>` : ''}
  </article>`;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  message.textContent = '';
  results.hidden = true;
  results.innerHTML = '';
  button.disabled = true;
  button.textContent = '正在查询…';
  try {
    const response = await fetch('/api/warranty/lookup', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({ name:document.getElementById('customerName').value, phone:document.getElementById('phone').value })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || '查询失败，请稍后重试');
    if (!(body.warranties || []).length) {
      message.textContent = '没有找到匹配的质保记录，请核对姓名和手机号，或联系 QUAD FILM 门店。';
      return;
    }
    results.innerHTML = body.warranties.map(warrantyCard).join('');
    results.hidden = false;
    results.scrollIntoView({ behavior:'smooth', block:'start' });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = '查询质保';
  }
});
