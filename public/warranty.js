const form = document.getElementById('lookupForm');
const button = document.getElementById('lookupButton');
const message = document.getElementById('lookupMessage');
const results = document.getElementById('results');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function warrantyYears(start, end) {
  if (!start || !end) return '以电子质保记录为准';
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '以电子质保记录为准';
  const years = Math.max(0, Math.round(((endDate - startDate) / (365.2425 * 24 * 60 * 60 * 1000)) * 10) / 10);
  return Number.isInteger(years) ? `${years}年` : `${years}年`;
}

function warrantyNumber(id) {
  const compact = String(id || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return compact ? `QF-${compact.slice(-10)}` : '以电子质保记录为准';
}

function policyItem(title, text) {
  return `<div class="policy-item"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p></div>`;
}

function numberedList(items) {
  return `<ol class="policy-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
}

function exclusionGroup(title, items) {
  return `<div class="exclusion-group"><h4>${escapeHtml(title)}</h4>${numberedList(items)}</div>`;
}

function scrollWarrantySection(cardId, sectionId) {
  document.getElementById(`${cardId}-${sectionId}`)?.scrollIntoView({ behavior:'smooth', block:'start' });
}

function confirmWarrantyRead(cardId, control) {
  const confirmed = control.getAttribute('aria-pressed') !== 'true';
  control.setAttribute('aria-pressed', String(confirmed));
  control.classList.toggle('confirmed', confirmed);
  control.textContent = confirmed ? '✓ 已阅读并了解质保范围' : '我已阅读并了解质保范围';
  const note = document.getElementById(`${cardId}-read-note`);
  if (note) note.textContent = confirmed ? '阅读确认仅保存在当前页面，不会提交或改变质保状态。' : '';
}

function warrantyCard(item, index) {
  const today = new Date().toISOString().slice(0, 10);
  const expired = Boolean(item.warrantyUntil && item.warrantyUntil < today);
  const cardId = `warranty-${index}-${String(item.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;
  const status = expired ? '已到期' : '有效';
  const startDate = item.installDate || '未登记';
  const endDate = item.warrantyUntil || '以电子质保记录为准';
  const product = item.product || '未登记';
  const vehicle = item.vehicle || '未登记';
  const plate = item.licensePlate || '未登记';
  const photos = Array.isArray(item.photos) ? item.photos : [];

  return `<article class="warranty-detail" id="${cardId}">
    <section class="warranty-summary" id="${cardId}-vehicle">
      <div class="summary-title-row">
        <div><span class="summary-eyebrow">QUAD FILM LIMITED WARRANTY</span><h2>QUAD FILM 漆面保护膜有限质保</h2></div>
        <span class="status-badge ${expired ? 'expired' : ''}">${escapeHtml(status)}</span>
      </div>
      <div class="summary-grid">
        <div><span>质保产品</span><strong>${escapeHtml(product)}</strong></div>
        <div><span>质保期限</span><strong>${escapeHtml(warrantyYears(item.installDate, item.warrantyUntil))}</strong></div>
        <div><span>质保日期</span><strong>${escapeHtml(startDate)} 至 ${escapeHtml(endDate)}</strong></div>
        <div><span>质保单号</span><strong>${escapeHtml(warrantyNumber(item.id))}</strong></div>
        <div><span>车辆VIN</span><strong>未登记</strong></div>
        <div><span>施工门店</span><strong>QUAD FILM</strong></div>
        <div><span>质保状态</span><strong>${escapeHtml(status)}</strong></div>
        <div><span>质保车辆</span><strong>${escapeHtml(vehicle)} · ${escapeHtml(plate)}</strong></div>
      </div>
      <div class="limited-warranty-notice">本质保属于产品材料及制造缺陷有限质保，主要保障异常黄变、膜体开裂、材料性起泡以及分层脱层。本质保不属于车辆事故、剐蹭、石击或其他外力损伤保险。</div>
      <div class="registered-detail"><div><span>登记施工部位</span><p>${escapeHtml(item.areas || '未登记')}</p></div><div><span>电子质保登记说明</span><p>${escapeHtml(item.warrantyContent || '以本页面质保政策为准')}</p></div></div>
      ${photos.length ? `<div class="warranty-photos" id="${cardId}-installation"><h3>质保车辆与施工照片</h3><div>${photos.map(photo => `<a href="${escapeHtml(photo.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name || '车辆施工照片')}" loading="lazy" /></a>`).join('')}</div></div>` : `<div id="${cardId}-installation" class="no-photo-note">当前质保记录没有上传施工照片。</div>`}
      <div class="detail-actions">
        <button type="button" class="primary-action" onclick="scrollWarrantySection('${cardId}','application')">申请质保</button>
        <button type="button" class="secondary-action" onclick="scrollWarrantySection('${cardId}','vehicle')">查看质保车辆</button>
        <button type="button" class="secondary-action" onclick="scrollWarrantySection('${cardId}','installation')">查看施工信息</button>
      </div>
    </section>

    <div class="policy-grid">
      <section class="policy-section" id="${cardId}-coverage"><span class="section-number">01</span><h3>质保范围</h3>
        <p>自产品首次安装并成功激活质保之日起，在质保期限内，产品由专业施工门店按照施工规范完成安装，并在正常汽车用途和正常维护条件下使用。</p>
        <p>如产品因材料或制造缺陷出现以下问题，经审核确认后，可按照本质保政策提供相应处理。</p>
        <div class="policy-items">
          ${policyItem('异常黄变','漆面保护膜在正常使用过程中，出现明显超出产品正常老化范围的异常黄变、颜色变化或透明度异常。')}
          ${policyItem('膜体开裂或龟裂','漆面保护膜在没有发生碰撞、石击、切割、刮擦、化学腐蚀或其他外力损伤的情况下，出现非正常开裂或龟裂。')}
          ${policyItem('材料性起泡或鼓泡','因膜材、胶层或产品复合结构异常导致的起泡或鼓泡。施工残水、膜下灰尘、漆面挥发、后喷漆异常或施工操作不当造成的起泡，不属于产品材料质保。')}
          ${policyItem('分层或脱层','漆面保护膜的表面涂层、膜体基材或胶层之间出现非正常分离、脱层或大面积层间异常。')}
        </div>
      </section>

      <section class="policy-section" id="${cardId}-conditions"><span class="section-number">02</span><h3>质保适用条件</h3><p>申请本质保服务，需要同时满足以下条件：</p>
        ${numberedList([
          '产品为QUAD FILM正品，并具有有效的产品卷号、批次号、防伪码或质保记录。',
          '产品已经在质保系统中完成激活，并绑定正确的车辆VIN、产品型号和施工门店。',
          '产品由专业施工门店按照品牌施工规范完成安装。',
          '发生问题的车辆部位属于原质保单登记的施工范围。',
          '产品处于有效质保期限内。',
          '车辆按照正常汽车用途使用，并按照合理方式进行清洁和维护。',
          '客户能够提供质保单号、车辆信息、施工记录以及能够证明问题情况的照片或视频。',
          '产品未经过未经授权的拆除、更换、切割、维修或重新施工。'
        ])}
      </section>

      <section class="policy-section" id="${cardId}-installation-quality"><span class="section-number">03</span><h3>施工质量问题说明</h3>
        <p>产品材料质保与施工质量质保分别认定。</p><p>以下问题如果经检查确认由施工操作造成，原则上属于施工质量问题，由原施工门店按照其施工质保政策处理：</p>
        ${numberedList(['膜边翘起或包边脱落。','施工残水或施工水包。','膜下存在明显灰尘、毛发或其他施工杂质。','拼接位置、包边方式或裁切方式不符合施工约定。','因施工拉伸不当造成的膜面纹路、胶印或变形。','因施工造成的车漆刀伤。','因施工拆装造成的车辆零部件损坏、异响或安装不到位。','施工后短期内出现的局部起边、收边不牢或漏贴。'])}
        <p class="section-conclusion">如经审核确认问题由膜材、胶层或产品制造缺陷造成，则按照产品材料质保处理。</p>
      </section>

      <section class="policy-section policy-section-wide" id="${cardId}-exclusions"><span class="section-number">04</span><h3>不属于质保范围</h3><p>以下问题通常不属于产品材料或制造缺陷质保范围。</p>
        <div class="exclusion-grid">
          ${exclusionGroup('第一类：事故及外力损伤',['交通事故、碰撞或车辆剐蹭。','石子、道路杂物或其他物体冲击。','钥匙、刀具、树枝或其他锐器造成的划伤、割伤或刺穿。','人为破坏、恶意损坏或动物抓咬。','货物、行李、车门或其他物体摩擦和碰撞造成的损伤。','车辆维修、钣金、喷漆或拆装过程中造成的膜材损伤。'])}
          ${exclusionGroup('第二类：污染及环境损伤',['鸟粪、虫尸、树胶、沥青、油漆、水泥、铁粉或工业污染物长期附着造成的腐蚀或染色。','硬水、地下水、酸雨或矿物质沉积造成的水斑、水渍或腐蚀痕迹。','火灾、洪水、冰雹、极端高温或其他自然灾害造成的损伤。','化学品、燃油、制动液、溶剂或其他腐蚀性物质造成的损伤。'])}
          ${exclusionGroup('第三类：不当清洗和维护',['使用强酸、强碱、强溶剂或不适用于漆面保护膜的清洁剂。','使用硬毛刷、研磨工具、砂纸或其他可能损伤膜面的工具。','高压水枪近距离直接冲洗膜边，导致膜边翘起或进水。','自动洗车设备或机械滚刷造成的膜面损伤。','不适当的抛光、研磨、除胶、镀膜或美容操作。','长时间使用高温蒸汽、热风枪或其他高温设备直接加热膜面。'])}
          ${exclusionGroup('第四类：正常使用损耗',['正常使用产生的轻微划痕、细小石击点或表面磨损。','光泽度、疏水性、自洁性能或表面顺滑度随使用时间逐渐下降。','自修复速度或自修复效果随产品老化逐渐下降。','膜边正常积尘或可通过正常清洁去除的表面污染。','未达到产品异常黄变判定标准的轻微颜色变化。'])}
          ${exclusionGroup('第五类：车辆漆面问题',['非原厂漆、后喷漆、补漆或钣金修复部位。','车漆、清漆层或底漆本身存在附着力不足、开裂、氧化、起泡或粉化。','车漆未完全固化即进行漆面保护膜施工。','拆膜过程中因原车漆或后喷漆质量问题造成的掉漆或带漆。','漆面原有划痕、凹陷、色差、腐蚀或其他施工前已经存在的问题。'])}
          ${exclusionGroup('第六类：未经授权的操作',['产品经过未经授权的拆除、补贴、更换或重新施工。','产品经过未经授权的切割、喷涂、打磨、抛光或化学处理。','第三方维修车辆时对膜材造成损伤。','无法确认原产品型号、批次、施工范围或质保记录。'])}
        </div>
      </section>

      <section class="policy-section" id="${cardId}-resolution"><span class="section-number">05</span><h3>质保处理方式</h3>
        ${numberedList(['客户提交质保申请后，由施工门店或品牌售后人员对问题进行检查。','品牌方有权要求客户补充车辆照片、问题近景照片、视频、施工记录、购买凭证或维修记录。','经审核确认属于产品材料或制造缺陷的，品牌方将根据问题性质提供修复或更换处理。','质保处理原则上以发生问题的具体膜件或对应车辆钣金部位为单位，不自动构成整车膜材更换。','如某一车辆部位出现符合质保条件的问题，原则上更换该部位的漆面保护膜。','如经审核确认属于同一批次或同一卷膜的系统性产品问题，品牌方可以扩大检查或处理范围。','经批准的质保处理，可以包括替换膜材以及对应部位合理的拆膜、除胶和重新施工。','零部件拆装、异地运输、客户往返、车辆停用、代步车辆以及其他附带费用，除产品政策另有明确说明外，不属于默认质保承担范围。','原产品型号停产、缺货或无法继续供应时，可以使用性能和质保等级不低于原产品的同等级产品进行替换。','完成更换后，系统应记录更换部位、更换日期、新产品型号、新卷号、新批次号和处理门店。','更换产品后的质保期限，按照适用法律、本产品质保政策及电子质保记录执行。'])}
      </section>

      <section class="policy-section" id="${cardId}-application"><span class="section-number">06</span><h3>申请质保需要提供的资料</h3><p>申请质保时，请准备以下资料：</p>
        ${numberedList(['电子质保单号。','质保登记手机号码。','车辆VIN或车架号。','产品购买凭证、施工订单或付款记录。','车辆整体照片。','发生问题部位的远景照片。','发生问题部位的清晰近景照片。','能够展示问题情况的视频。','问题首次发现时间及问题说明。','车辆是否发生事故、维修、喷漆或补漆的说明。','产品是否曾在其他门店进行拆除、维修、补贴或重新施工的说明。'])}
        <p class="section-conclusion">品牌方可以根据具体问题要求补充其他合理资料。</p>
        <div class="claim-flow-note"><strong>申请质保</strong><p>请按照现有质保申请流程提交上述资料。本详情页面不会自动创建申请，也不会改变现有质保状态。</p></div>
      </section>
    </div>

    <section class="important-notice"><h3>重要提示</h3>${numberedList(['本质保属于漆面保护膜产品材料及制造缺陷有限质保，不属于车辆保险或意外损伤保险。','事故、碰撞、剐蹭、石击、锐器划伤和其他外力造成的膜材损坏，不属于基础产品质保。','产品具备的自修复、抗污、疏水、防石击或耐磨等性能，不代表质保期内任何划痕、污染或性能下降均可免费更换。','只有本质保政策明确列出的异常黄变、膜体开裂、材料性起泡和分层脱层，才属于基础产品质保项目。','是否属于质保范围，应根据产品情况、现场检查、施工记录、车辆漆面情况及相关证据综合判断。','本质保条款不排除或限制消费者依据适用法律依法享有的权利。'])}
      <button type="button" class="read-confirm" aria-pressed="false" onclick="confirmWarrantyRead('${cardId}',this)">我已阅读并了解质保范围</button><p id="${cardId}-read-note" class="read-note"></p>
    </section>
    <section class="status-copy"><h3>系统状态提示文案</h3><details><summary>申请提交成功提示</summary><p>您的质保申请已提交。售后人员将根据您提交的车辆信息、产品信息和问题资料进行审核，请通过质保系统查看处理进度。</p></details><details><summary>资料不足提示</summary><p>当前资料不足以完成质保判断，请补充问题部位的清晰照片、视频或相关施工记录。</p></details><details><summary>不属于质保提示</summary><p>经审核，当前问题不属于产品材料或制造缺陷质保范围。具体原因请查看审核说明。如对审核结果存在异议，可以补充相关资料后再次提交复核。</p></details><details><summary>质保通过提示</summary><p>经审核，当前问题符合产品质保条件。请按照系统安排前往指定门店完成检查、修复或更换。</p></details></section>
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
