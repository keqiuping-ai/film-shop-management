window.showOrderCenter = function () {
  document.getElementById('landing')?.classList.add('hidden');
  document.getElementById('login')?.classList.add('hidden');
  document.getElementById('app')?.classList.add('hidden');
  document.getElementById('ppfCatalog')?.classList.add('hidden');
  document.getElementById('colorWrapCatalog')?.classList.add('hidden');
  document.getElementById('windowFilmCatalog')?.classList.add('hidden');
  document.getElementById('orderCenter')?.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'auto' });
};

window.previewOrderCategory = function (name) {
  if (name === 'Paint Protection Film' || name === '漆面保护膜 PPF') {
    window.showPpfCatalog();
    return;
  }
  if (name === 'Color Change Wrap' || name === '汽车改色膜') {
    window.showColorWrapCatalog();
    return;
  }
  if (name === 'Window Film' || name === '汽车窗膜') {
    window.showWindowFilmCatalog();
    return;
  }
  const notice = document.getElementById('orderCategoryNotice');
  const title = document.getElementById('orderCategoryNoticeTitle');
  if (!notice || !title) return;
  title.textContent = name;
  notice.classList.remove('hidden');
  notice.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.closeOrderCategoryNotice = function () {
  document.getElementById('orderCategoryNotice')?.classList.add('hidden');
};

document.body.insertAdjacentHTML('beforeend', `
  <section id="ppfCatalog" class="ppf-catalog hidden">
    <header class="order-center-header">
      <button class="order-center-brand" onclick="showOrderCenter()"><img src="/quad-film-icon.png" alt="QUAD FILM"><span><b>QUAD FILM</b><small>PPF 产品订购页</small></span></button>
      <div><button class="order-home-button" onclick="showOrderCenter()">← 返回产品分类</button><button class="order-login-button" onclick="showLogin()">经销商登录</button></div>
    </header>
    <main class="ppf-main">
      <section class="ppf-hero">
        <div><span>01 · 漆面保护膜</span><h1>PPF 产品订购</h1><p>根据表面效果和应用需求选择产品。当前为页面设计预览，型号、价格、库存和下单功能尚未连接。</p></div>
        <img src="/assets/ppf-gloss-green-hero-v1.png" alt="绿色高端汽车透明亮面 PPF 镜面光泽效果">
      </section>
      <section class="ppf-grid">
        <article><div class="ppf-product-media"><img src="/assets/quad-premium-automotive-hero-v1.png" alt="透明亮面 PPF"></div><div class="ppf-product-copy"><span>透明系列</span><h2>高亮透明 PPF</h2><p>突出原车漆光泽，适用于整车及重点部位的日常防护。</p>${ppfOrderControls('高亮透明 PPF')}</div></article>
        <article><div class="ppf-product-media"><img src="/assets/ppf-matte-hero-v1.png" alt="深哑光 PPF 的高雾度低反光效果"></div><div class="ppf-product-copy"><span>高雾度系列</span><h2>深哑光 PPF</h2><p>雾度更高、反光更少，呈现均匀柔和、更加纯粹的深哑光效果。</p>${ppfOrderControls('深哑光 PPF')}</div></article>
        <article><div class="ppf-product-media"><img src="/assets/ppf-satin-hero-v1.png" alt="缎面 PPF 的柔和丝绸光泽效果"></div><div class="ppf-product-copy"><span>轻雾度系列</span><h2>缎面 PPF</h2><p>保留细腻的柔和光泽，比亮面低调、比深哑光更有层次和质感。</p>${ppfOrderControls('缎面 PPF')}</div></article>
        <article><div class="ppf-product-media"><img src="/assets/quad-f1-installation-process.jpg" alt="汽车重点部位 PPF"></div><div class="ppf-product-copy"><span>专项保护系列</span><h2>重点部位保护膜</h2><p>适用于前保险杠、引擎盖、后视镜、门边及其他高风险区域。</p>${ppfOrderControls('重点部位保护膜')}</div></article>
        <article><div class="ppf-product-media"><img src="/assets/yacht-protection-film-ppf.jpg" alt="游艇 PPF"></div><div class="ppf-product-copy"><span>船艇应用系列</span><h2>游艇表面保护膜</h2><p>针对游艇高光漆面、胶衣及高频接触区域的专业保护方案。</p>${ppfOrderControls('游艇表面保护膜')}</div></article>
      </section>
      <section id="ppfSelectedList" class="window-film-selected-list hidden"><header><div><span>当前订单</span><h2>PPF 订购清单</h2></div><b id="ppfSelectedCount">0 项</b></header><div id="ppfSelectedRows"></div><button onclick="showDealerCheckout()">查看购物车并去结账 →</button><p>当前为页面设计预览，不查询实时库存、不扣减库存，也不会生成正式订单。</p></section>
    </main>
  </section>
`);

const colorWrapSamples = [
  ['CW-001','珍珠白','Pearl White','#eeeae0','gloss','亮光'],
  ['CW-002','曜石黑','Obsidian Black','#111315','gloss','亮光'],
  ['CW-003','赛道红','Racing Red','#b91822','gloss','亮光'],
  ['CW-004','迈阿密蓝','Miami Blue','#23aeda','gloss','亮光'],
  ['CW-005','翡翠绿','Emerald Green','#0b654d','gloss','亮光'],
  ['CW-006','日落橙','Sunset Orange','#e45c21','gloss','亮光'],
  ['CW-007','战斗灰','Nardo Gray','#85898a','satin','缎面'],
  ['CW-008','冰川银','Glacier Silver','#bfc3c4','satin','缎面'],
  ['CW-009','午夜蓝','Midnight Blue','#172b50','satin','缎面'],
  ['CW-010','沙漠金','Desert Gold','#b59256','satin','缎面'],
  ['CW-011','哑光黑','Matte Black','#252627','matte','哑光'],
  ['CW-012','军绿色','Military Green','#59624a','matte','哑光'],
  ['CW-013','薰衣草紫','Lavender Purple','#9a83b8','gloss','亮光'],
  ['CW-014','樱花粉','Sakura Pink','#e6a2af','gloss','亮光'],
  ['CW-015','电光黄','Electric Yellow','#e5dd28','gloss','亮光'],
  ['CW-016','香槟金','Champagne Gold','#c9ae79','satin','缎面']
];

const customWrapPatterns = [
  ['烈焰流金','custom-wrap-13-crimson-gold-supercar.png'],
  ['蓝晶赛博','custom-wrap-14-blue-crystal-cyber-pickup.png'],
  ['珊瑚海风','custom-wrap-15-coral-teal-model-y.png'],
  ['翡翠地形','custom-wrap-16-emerald-topographic-suv.png'],
  ['深海电路','custom-wrap-17-midnight-circuit-gt.png'],
  ['铜影锋芒','custom-wrap-18-copper-velocity-supercar.png'],
  ['海洋日轮','custom-wrap-19-ocean-sun-crossover.png'],
  ['赤红墨痕','custom-wrap-20-red-brush-sedan.png'],
  ['紫境星云','custom-wrap-21-purple-galaxy-cyber-pickup.png'],
  ['沙漠群峰','custom-wrap-22-desert-mountain-suv.png'],
  ['极光幻彩','custom-wrap-23-aurora-roadster.png'],
  ['粉黑疾影','custom-wrap-24-pink-shark-model-y.png'],
  ['水墨鎏金','custom-wrap-25-ink-gold-coupe.png'],
  ['荧光战甲','custom-wrap-26-lime-x-cyber-pickup.png'],
  ['紫蓝极光','custom-wrap-27-purple-aurora-gt.png'],
  ['黄黑赛道','custom-wrap-28-yellow-track-supercar.png'],
  ['欢乐涂鸦','custom-wrap-29-pop-art-model-y.png'],
  ['勃艮第流光','custom-wrap-30-burgundy-flow-sedan.png'],
  ['冰川迷彩','custom-wrap-31-glacier-camo-pickup.png'],
  ['经典绿赛','custom-wrap-32-classic-green-coupe.png']
];

document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="/customer-custom-wrap.css?v=1">');

document.body.insertAdjacentHTML('beforeend', `
  <section id="colorWrapCatalog" class="wrap-catalog hidden">
    <header class="order-center-header"><button class="order-center-brand" onclick="showOrderCenter()"><img src="/quad-film-icon.png" alt="QUAD FILM"><span><b>QUAD FILM</b><small>改色膜产品订购页</small></span></button><div><button class="order-home-button" onclick="showOrderCenter()">← 返回产品分类</button><button class="order-login-button" onclick="showLogin()">经销商登录</button></div></header>
    <main class="wrap-main">
      <div class="wrap-heading"><span>02 · 色彩与质感</span><h1>选择改色膜颜色</h1><p>点击色卡查看大色样和订货选项。当前色号为页面演示，正式色号将由 QUaD 库存系统同步。</p></div>
      <div class="wrap-tools"><nav class="wrap-filter"><button class="active" onclick="filterWrapSwatches('all',this)">全部</button><button onclick="filterWrapSwatches('gloss',this)">亮光</button><button onclick="filterWrapSwatches('satin',this)">缎面</button><button onclick="filterWrapSwatches('matte',this)">哑光</button></nav><input id="wrapColorSearch" type="search" placeholder="搜索型号或颜色名称" oninput="searchWrapColors(this.value)"></div>
      <section class="wrap-swatch-grid">${colorWrapSamples.map(([code,zh,en,color,finish,label])=>`<button class="wrap-swatch" data-finish="${finish}" onclick="selectWrapSwatch('${code}','${zh}','${en}','${color}','${label}')"><i style="--swatch:${color}" class="${finish}"></i><b>${zh}</b><small>${code} · ${label}</small></button>`).join('')}</section>
      <section class="wrap-manual"><div><span>新颜色 / 色卡暂未收录</span><h2>2>输入现有库存型号</h2><p>适用于库存中已经建立、但当前色卡目录还没有照片的新颜色。</p></div><div class="wrap-manual-fields"><label>库存型号<input id="manualWrapCode" placeholder="例如：TPUQD106"></label><label>颜色名称<input id="manualWrapName" placeholder="请输入颜色名称"></label><label>规格<select id="manualWrapSize"><option>请选择规格</option><option>60 英寸 × 50 英尺</option></select></label><label>数量<input id="manualWrapQty" type="number" min="1" value="1"></label></div><button onclick="addManualWrapColor()">＋ 加入选色清单</button><small>正式接入后会先查询 QUaD 库存；型号不存在时需要联系工作人员建立产品资料。</small></section>
      <section id="wrapSelection" class="wrap-selection hidden"><div id="wrapLargeSwatch" class="wrap-large-swatch"></div><div class="wrap-selection-copy"><span id="wrapSelectedFinish"></span><h2 id="wrapSelectedName"></h2><small id="wrapSelectedCode"></small><div class="wrap-order-line"><label>卷材规格<select id="wrapSelectedSize"><option>请选择规格</option><option>60 英寸 × 50 英尺</option></select></label><label>数量<input id="wrapSelectedQty" type="number" min="1" value="1"></label></div><button class="ppf-preview-button" onclick="addSelectedWrapColor()">＋ 加入选色清单</button><p>可继续选择其他颜色；当前为页面预览，不会扣减库存。</p></div></section>
      <section id="wrapSelectedList" class="wrap-selected-list hidden"><header><div><span>本次已选</span><h2>选色清单</h2></div><b id="wrapSelectedCount">0 项</b></header><div id="wrapSelectedRows"></div><button class="wrap-continue" onclick="document.querySelector('.wrap-swatch-grid').scrollIntoView({behavior:'smooth'})">＋ 继续添加其他颜色</button><button class="wrap-review-order" onclick="previewWrapCheckout()">下一步：核对订单 →</button><p>正式接入后，提交时会统一检查每个色号、规格和数量的可售库存。</p></section>
      <section class="custom-wrap"><div class="custom-wrap-heading"><span>定制服务</span><h2>定制彩绘膜</h2><p>选择 QUaD 现有图案，或上传自己的参考图片。提交车辆资料后，由设计团队确认画面、尺寸和制作方案。</p></div><div class="custom-wrap-layout"><div><h3>1. 选择现有图案</h3><div class="custom-patterns"><button onclick="selectCustomPattern(this,'灰红渐变')"><i class="gradient-red"></i><b>灰红渐变</b></button><button onclick="selectCustomPattern(this,'赛车拉花')"><i class="racing-stripe"></i><b>赛车拉花</b></button><button onclick="selectCustomPattern(this,'几何切面')"><i class="geometric"></i><b>几何切面</b></button><button onclick="selectCustomPattern(this,'自定义图案')"><i class="custom-art">＋</i><b>自定义图案</b></button></div><input id="customPatternValue" type="hidden"></div><div class="custom-upload"><h3>2. 或上传自己的图片</h3><label class="custom-upload-box"><input type="file" accept="image/*,.pdf" onchange="showCustomWrapFile(this)"><b>＋ 选择图片或设计文件</b><small>支持照片、效果图或设计参考；当前仅显示文件名。</small></label><div id="customWrapFileName" class="custom-file-name">尚未选择文件</div></div></div><div class="custom-vehicle"><h3>3. 填写车辆资料</h3><div><label>年份<input id="customVehicleYear" inputmode="numeric" placeholder="例如：2025"></label><label>品牌<input id="customVehicleMake" placeholder="例如：Tesla"></label><label>车型<input id="customVehicleModel" placeholder="例如：Model Y"></label></div><label>设计要求<textarea id="customWrapNotes" placeholder="请描述颜色、渐变方向、图案位置、文字或其他要求"></textarea></label><button onclick="previewCustomWrapRequest()">提交定制方案（页面预览）</button><p>正式接入后，这里会生成设计需求单，不会直接扣库存或自动收费。</p></div></section>
      <div id="wrapCheckoutPreview" class="wrap-checkout-preview hidden"><b>下一步：核对订单</b><p>正式版本将在这里核对颜色、规格、数量、库存、收货地址、运费和税费，确认无误后才进入信用卡付款。</p><button onclick="this.parentElement.classList.add('hidden')">继续检查本页</button></div>
    </main>
  </section>
`);

const customPatternsContainer = document.querySelector('#colorWrapCatalog .custom-patterns');
if (customPatternsContainer) {
  customPatternsContainer.innerHTML = `${customWrapPatterns.map(([name,file])=>`<button onclick="selectCustomPattern(this,'${name}')"><img src="/assets/custom-wrap-concepts/${file}" alt="${name}" loading="lazy"><b>${name}</b></button>`).join('')}<button onclick="selectCustomPattern(this,'自定义图案')"><i class="custom-art">＋</i><b>自定义图案</b></button>`;
  customPatternsContainer.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
    customPatternsContainer.querySelectorAll('button').forEach(item=>item.classList.toggle('selected',item===button));
    document.getElementById('customPatternValue').value=button.querySelector('b').textContent;
  }));
}

window.selectCustomPattern = function (button,name) {
  document.querySelectorAll('.custom-patterns button').forEach(item=>item.classList.toggle('selected',item===button));
  document.getElementById('customPatternValue').value=name;
};

window.showColorWrapCatalog = function () {
  ['landing','login','app','orderCenter','ppfCatalog','windowFilmCatalog'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
  document.getElementById('colorWrapCatalog').classList.remove('hidden');
  activateWrapColorImages();
  window.scrollTo({top:0,behavior:'auto'});
};

window.filterWrapSwatches = function (finish,button) {
  document.querySelectorAll('.wrap-filter button').forEach(item=>item.classList.toggle('active',item===button));
  document.querySelectorAll('.wrap-swatch').forEach(item=>item.classList.toggle('hidden',finish!=='all'&&item.dataset.finish!==finish));
};

window.selectWrapSwatch = function (code,zh,en,color,finish) {
  document.querySelectorAll('.wrap-swatch').forEach(item=>item.classList.toggle('selected',item.querySelector('small').textContent.startsWith(code)));
  fillQuickWrapOrder({code,name:`${zh} · ${en}`,finish,color});
};

window.addSelectedWrapColor = function () {
  const panel=document.getElementById('wrapSelection');
  if(!panel.dataset.code)return;
  const size=document.getElementById('wrapSelectedSize').value;
  const qty=Math.max(1,Number(document.getElementById('wrapSelectedQty').value||1));
  appendWrapSelection({code:panel.dataset.code,name:panel.dataset.name,color:panel.dataset.color,finish:panel.dataset.finish,size,qty});
  document.getElementById('wrapSelectedQty').value=1;
};

function appendWrapSelection({code,name,color='#888',finish='库存型号',size='请选择规格',qty=1}) {
  const rows=document.getElementById('wrapSelectedRows');
  const row=document.createElement('div');
  row.className='wrap-selected-row';
  row.innerHTML=`<i style="--selected-color:${color}"></i><div><b>${name}</b><small>${code} · ${finish} · ${size}</small></div><strong>× ${qty}</strong><button aria-label="删除此颜色" onclick="removeSelectedWrapColor(this)">×</button>`;
  rows.appendChild(row);
  document.getElementById('wrapSelectedList').classList.remove('hidden');
  document.getElementById('wrapSelectedCount').textContent=`${rows.children.length} 项`;
}

window.addManualWrapColor = function () {
  const code=document.getElementById('manualWrapCode').value.trim().toUpperCase();
  const name=document.getElementById('manualWrapName').value.trim();
  if(!code||!name){alert('请填写库存型号和颜色名称。');return;}
  const quickOrder=document.querySelector('.wrap-manual');
  appendWrapSelection({code,name,color:quickOrder.dataset.color||'#888',finish:quickOrder.dataset.finish||'手工输入',size:document.getElementById('manualWrapSize').value,qty:Math.max(1,Number(document.getElementById('manualWrapQty').value||1))});
  document.getElementById('manualWrapCode').value='';
  document.getElementById('manualWrapName').value='';
  document.getElementById('manualWrapQty').value=1;
  quickOrder.dataset.finish='';
  quickOrder.dataset.color='';
};

window.searchWrapColors = function (query) {
  const value=query.trim().toLowerCase();
  document.querySelectorAll('.wrap-swatch').forEach(item=>item.classList.toggle('hidden',value&&!item.textContent.toLowerCase().includes(value)));
};

let realWrapColors=[];
let wrapColorImageObserver;

function loadWrapColorImage(image) {
  if (!image?.dataset.src || image.src) return;
  image.src=image.dataset.src;
  image.removeAttribute('data-src');
}

function activateWrapColorImages() {
  const images=[...document.querySelectorAll('.wrap-swatch.real-photo img[data-src]')];
  images.slice(0,12).forEach(loadWrapColorImage);
  if (!('IntersectionObserver' in window)) {
    images.slice(12).forEach(loadWrapColorImage);
    return;
  }
  wrapColorImageObserver ||= new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if (!entry.isIntersecting) return;
      loadWrapColorImage(entry.target);
      wrapColorImageObserver.unobserve(entry.target);
    });
  },{rootMargin:'500px 0px'});
  images.slice(12).forEach(image=>wrapColorImageObserver.observe(image));
}

function updateManualWrapSuggestions(query) {
  const menu=document.getElementById('manualWrapSuggestions');
  if(!menu)return;
  const value=query.trim().toLowerCase();
  menu.innerHTML='';
  if(!value){menu.classList.add('hidden');return;}
  const matches=realWrapColors.filter(color=>`${color.code} ${color.name}`.toLowerCase().includes(value)).slice(0,12);
  if(!matches.length){menu.classList.add('hidden');return;}
  matches.forEach(color=>{
    const option=document.createElement('button');
    option.type='button';
    option.className='wrap-model-suggestion';
    option.innerHTML=`<img src="${color.image}" alt=""><span><b>${color.code}</b><small>${color.name}</small></span>`;
    option.addEventListener('click',()=>{
      fillQuickWrapOrder({code:color.code,name:color.name,finish:color.finish,color:'#777'});
      menu.classList.add('hidden');
    });
    menu.appendChild(option);
  });
  menu.classList.remove('hidden');
}

async function loadRealWrapColors() {
  try {
    const colors=await fetch('/assets/wrap-colors/catalog.json').then(response=>response.json());
    realWrapColors=colors;
    const grid=document.querySelector('.wrap-swatch-grid');
    grid.innerHTML='';
    colors.forEach(color=>{
      const button=document.createElement('button');
      button.className='wrap-swatch real-photo';
      button.dataset.finish=color.finish;
      button.innerHTML=`<img data-src="${color.image}" alt="${color.code} ${color.name}" loading="lazy" decoding="async"><b>${color.name}</b><small>${color.code}</small>`;
      button.addEventListener('click',()=>selectRealWrapSwatch(button,color));
      grid.appendChild(button);
    });
  } catch (error) {
    console.warn('Unable to load the photographed wrap color catalog.',error);
  }
}

function selectRealWrapSwatch(button,color) {
  document.querySelectorAll('.wrap-swatch').forEach(item=>item.classList.toggle('selected',item===button));
  fillQuickWrapOrder({code:color.code,name:color.name,finish:color.finish,color:'#777'});
}

function fillQuickWrapOrder({code,name,finish='库存型号',color='#888'}) {
  const quickOrder=document.querySelector('.wrap-manual');
  document.getElementById('manualWrapCode').value=code;
  document.getElementById('manualWrapName').value=name;
  quickOrder.dataset.finish=finish;
  quickOrder.dataset.color=color;
  document.getElementById('manualWrapSuggestions')?.classList.add('hidden');
  if(window.innerWidth<760)quickOrder.scrollIntoView({behavior:'smooth',block:'start'});
}

document.querySelector('.wrap-tools').after(document.querySelector('.wrap-manual'));
document.querySelector('.wrap-manual span').textContent='搜索、选色与下单';
document.querySelector('.wrap-manual h2').textContent='快速选货与下单';
document.querySelector('.wrap-manual p').textContent='输入型号搜索，或点击下方色卡；确认规格和数量后直接加入订单。';
document.querySelector('.wrap-manual>button').textContent='＋ 加入订单';
document.querySelector('.wrap-manual>small').textContent='正式接入后将在这里查询 QUaD 实时库存并继续核对订单。';
document.querySelector('.wrap-manual').after(document.getElementById('wrapSelectedList'));
document.querySelector('.wrap-continue')?.remove();
document.querySelector('#wrapSelectedList header span').textContent='当前订单';
document.querySelector('#wrapSelectedList header h2').textContent='订购清单';
document.getElementById('wrapSelection').remove();
const manualWrapCode=document.getElementById('manualWrapCode');
const manualSuggestionMenu=document.createElement('div');
manualSuggestionMenu.id='manualWrapSuggestions';
manualSuggestionMenu.className='wrap-model-suggestions hidden';
manualWrapCode.closest('label').classList.add('wrap-model-search');
manualWrapCode.insertAdjacentElement('afterend',manualSuggestionMenu);
manualWrapCode.addEventListener('input',event=>updateManualWrapSuggestions(event.target.value));
manualWrapCode.addEventListener('focus',event=>updateManualWrapSuggestions(event.target.value));
document.addEventListener('click',event=>{
  if(!event.target.closest('.wrap-model-search'))manualSuggestionMenu.classList.add('hidden');
});
loadRealWrapColors();

window.removeSelectedWrapColor = function (button) {
  const list=document.getElementById('wrapSelectedList');
  const rows=document.getElementById('wrapSelectedRows');
  button.closest('.wrap-selected-row')?.remove();
  document.getElementById('wrapSelectedCount').textContent=`${rows.children.length} 项`;
  if(!rows.children.length)list.classList.add('hidden');
};

window.previewWrapCheckout = function () {
  const preview=document.getElementById('wrapCheckoutPreview');
  preview.classList.remove('hidden');
  preview.scrollIntoView({behavior:'smooth',block:'center'});
};

window.selectCustomPattern = function (button,name) {
  document.querySelectorAll('.custom-patterns button').forEach(item=>item.classList.toggle('selected',item===button));
  document.getElementById('customPatternValue').value=name;
};

window.showCustomWrapFile = function (input) {
  document.getElementById('customWrapFileName').textContent=input.files?.[0]?.name||'尚未选择文件';
};

window.previewCustomWrapRequest = function () {
  const year=document.getElementById('customVehicleYear').value.trim();
  const make=document.getElementById('customVehicleMake').value.trim();
  const model=document.getElementById('customVehicleModel').value.trim();
  const pattern=document.querySelector('.custom-patterns button.selected b')?.textContent||document.getElementById('customPatternValue').value||'上传/自定义图案';
  alert(`定制彩绘膜需求预览\n${year} ${make} ${model}\n方案：${pattern}\n当前不会提交正式数据。`);
};

function ppfOrderControls(name) {
  const isGlossClear = name === '高亮透明 PPF';
  const isDeepMatte = name === '深哑光 PPF';
  const isSatin = name === '缎面 PPF';
  const isPartialProtection = name === '重点部位保护膜';
  const isYachtProtection = name === '游艇表面保护膜';
  const modelHint = isGlossClear
    ? 'G20PLUS / DS13S / G18'
    : isDeepMatte ? 'GM-PRO'
      : isSatin ? 'G18-Matte-D'
        : isPartialProtection ? 'G30 A+-XM'
          : isYachtProtection ? 'G30 A+' : '未来与库存同步';
  const modelOptions = isGlossClear
    ? '<option>请选择具体型号</option><option>G20PLUS</option><option>DS13S</option><option>G18</option>'
    : isDeepMatte
      ? '<option>请选择具体型号</option><option>GM-PRO</option>'
    : isSatin
      ? '<option>请选择具体型号</option><option>G18-Matte-D</option>'
    : isPartialProtection
      ? '<option>请选择具体型号</option><option>G30 A+-XM</option>'
    : isYachtProtection
      ? '<option>请选择具体型号</option><option>G30 A+</option>'
    : '<option>请选择具体型号</option><option disabled>型号由 QUaD 库存系统提供</option>';
  const sizeOptions = isPartialProtection
    ? '<option>请选择规格</option><option>1.2 米 × 30 米</option>'
    : isGlossClear || isDeepMatte || isSatin || isYachtProtection
    ? '<option>请选择规格</option><option>1.52 米 × 15 米</option>'
    : '<option>请选择规格</option><option>60 英寸 × 50 英尺</option><option>72 英寸 × 50 英尺</option>';

  return `<div class="ppf-variant-list"><div class="ppf-variant-row"><label class="ppf-model-field">具体型号 <small>${modelHint}</small><select>${modelOptions}</select></label><label>规格<select>${sizeOptions}</select></label><label>数量<input type="number" min="1" value="1"></label><button class="ppf-remove-variant hidden" type="button" aria-label="删除这一项" onclick="removePpfVariantRow(this)">×</button></div></div><button class="ppf-add-variant" type="button" onclick="addPpfVariantRow(this)">＋ 添加另一个型号</button><button class="ppf-preview-button" onclick="addPpfProductToCart(this,'${name}')">＋ 加入购物车</button>`;
}

window.addPpfVariantRow = function (button) {
  const list = button.previousElementSibling;
  const row = list.firstElementChild.cloneNode(true);
  row.querySelectorAll('select').forEach(select => { select.selectedIndex = 0; });
  row.querySelector('input').value = 1;
  row.querySelector('.ppf-remove-variant').classList.remove('hidden');
  list.appendChild(row);
};

window.removePpfVariantRow = function (button) {
  const row = button.closest('.ppf-variant-row');
  if (row?.parentElement?.children.length > 1) row.remove();
};

window.showPpfCatalog = function () {
  document.getElementById('landing')?.classList.add('hidden');
  document.getElementById('login')?.classList.add('hidden');
  document.getElementById('app')?.classList.add('hidden');
  document.getElementById('orderCenter')?.classList.add('hidden');
  document.getElementById('colorWrapCatalog')?.classList.add('hidden');
  document.getElementById('windowFilmCatalog')?.classList.add('hidden');
  document.getElementById('ppfCatalog')?.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'auto' });
};

window.addPpfProductToCart = function (button, name) {
  const product = button.closest('.ppf-product-copy');
  const variants = [...product.querySelectorAll('.ppf-variant-row')];
  const selected = variants.map(row => {
    const selects = row.querySelectorAll('select');
    return {
      model: selects[0]?.value || '',
      size: selects[1]?.value || '',
      qty: Math.max(1, Number(row.querySelector('input')?.value || 1))
    };
  });
  if (selected.some(item => !item.model || item.model === '请选择具体型号')) {
    alert('请选择具体型号。');
    return;
  }
  if (selected.some(item => !item.size || item.size === '请选择规格')) {
    alert('请选择规格。');
    return;
  }
  const rows = document.getElementById('ppfSelectedRows');
  selected.forEach(item => {
    const row = document.createElement('div');
    row.innerHTML = `<div><b>${item.model}</b><small>${name} · ${item.size}</small></div><strong>× ${item.qty}</strong><button aria-label="删除这一项" onclick="this.parentElement.remove();updatePpfCartCount()">×</button>`;
    rows.appendChild(row);
  });
  document.getElementById('ppfSelectedList').classList.remove('hidden');
  updatePpfCartCount();
  document.getElementById('ppfSelectedList').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.updatePpfCartCount = function () {
  const rows = document.getElementById('ppfSelectedRows');
  document.getElementById('ppfSelectedCount').textContent = `${rows.children.length} 项`;
  if (!rows.children.length) document.getElementById('ppfSelectedList').classList.add('hidden');
};

const windowFilmSeries = [
  {tier:'01 · 顶级系列',name:'Premium 磁控溅射系列',technology:'双银反射隔热技术',note:'双层银磁控溅射结构，以反射方式阻隔热量。主打高透、高清、低雾度与强隔热。',models:[['SP70','70%','98%','60%'],['SP50','50%','97%','70%'],['SP20','18%','96%','87%'],['SP10','10%','98%','93%']]},
  {tier:'02 · 高性能系列',name:'磁控溅射混合系列',technology:'单银反射＋Nano 吸热',note:'单银磁控溅射与 Nano 陶瓷结合，兼顾清晰视野、隔热表现和施工收缩性能。',models:[['SPV70','70%','93%','53%'],['SP20N','24%','93%','82%'],['SP10N','10%','95%','91%'],['SP05N','7%','95%','93%']]},
  {tier:'03 · 经典系列',name:'Nano 陶瓷系列',technology:'Nano 陶瓷吸热技术',note:'采用吸热型 Nano 陶瓷技术，无信号干扰；提供从高透前挡到深色隐私的多种透光率。',models:[['NA70','72%','95%','55%'],['NA28','30%','96%','80%'],['NA15','15%','95%','89%'],['NA10','10%','95%','92%']]},
  {tier:'04 · 经济型系列',name:'P 基础隔热系列',technology:'高性价比入门窗膜',note:'面向价格敏感型项目的基础窗膜系列，提供常用的深色与中深色透光选择，紫外线阻隔率 99%。',models:[['P10','10%','','30%','99%'],['P20','20%','','28%','99%']]},
  {tier:'05 · 车顶专用系列',name:'TAI 天窗专用膜',technology:'全景天窗高效隔热',note:'专为汽车天窗与全景车顶设计，在保留合适透光率的同时提供高隔热表现，紫外线阻隔率 99%。',models:[['TAI-20','20%','80%','','99%','隔热'],['TAI-10','10%','90%','','99%','隔热']]}
];

function windowFilmSizeOptions(){return '<option value="">选择卷材规格</option><option>20 英寸 × 100 英尺（约 0.51 × 30.5 米）</option><option>36 英寸 × 100 英尺（约 0.91 × 30.5 米）</option><option>40 英寸 × 100 英尺（约 1.02 × 30.5 米）</option><option>60 英寸 × 100 英尺（约 1.52 × 30.5 米）</option>'}
function renderWindowFilmSeries(s){return `<article class="window-film-series"><header><div><span>${s.tier}</span><h2>${s.name}</h2><b>${s.technology}</b></div><p>${s.note}</p></header><div class="window-film-models">${s.models.map(m=>`<button type="button" onclick="selectWindowFilmModel(this,'${s.name}','${m[0]}')"><strong>${m[0]}</strong><small>透光率 ${m[1]}</small><i><span>UV ${m[4]||'99.9%'}</span>${m[2]?`<span>${m[5]||'IR'} ${m[2]}</span>`:''}</i></button>`).join('')}</div></article>`}

document.body.insertAdjacentHTML('beforeend',`<section id="windowFilmCatalog" class="window-film-catalog hidden"><header class="order-center-header"><button class="order-center-brand" onclick="showOrderCenter()"><img src="/quad-film-icon.png" alt="QUAD FILM"><span><b>QUAD FILM</b><small>汽车窗膜产品订购页</small></span></button><div><button class="order-home-button" onclick="showOrderCenter()">← 返回产品分类</button><button class="order-login-button" onclick="showLogin()">经销商登录</button></div></header><main class="window-film-main"><section class="window-film-intro"><span>03 · 汽车隔热膜</span><h1>选择窗膜型号</h1><p>按性能等级、透光率和应用位置选择产品。QUaD 窗膜重点突出高清、高透、低雾度、强隔热和良好的热收缩施工表现。</p><div><b>高清低雾度</b><b>高效隔热</b><b>收缩施工友好</b><b>多种透光率</b></div></section><nav class="window-film-tier-nav"><button onclick="document.getElementById('windowFilmTier1').scrollIntoView({behavior:'smooth'})">顶级双银</button><button onclick="document.getElementById('windowFilmTier2').scrollIntoView({behavior:'smooth'})">SP 混合系列</button><button onclick="document.getElementById('windowFilmTier3').scrollIntoView({behavior:'smooth'})">Nano 陶瓷</button><button onclick="document.getElementById('windowFilmTier4').scrollIntoView({behavior:'smooth'})">P 经济系列</button><button onclick="document.getElementById('windowFilmTier5').scrollIntoView({behavior:'smooth'})">TAI 天窗专用</button></nav><section class="window-film-series-list">${windowFilmSeries.map((s,i)=>`<div id="windowFilmTier${i+1}">${renderWindowFilmSeries(s)}</div>`).join('')}</section><section id="windowFilmQuickOrder" class="window-film-quick-order"><div><span>快速选货与下单</span><h2 id="windowFilmSelectedModel">请先选择上方型号</h2><p id="windowFilmSelectedSeries">型号参数将自动带入这里</p></div><label>卷材规格<select id="windowFilmSize">${windowFilmSizeOptions()}</select></label><label>数量<input id="windowFilmQty" type="number" min="1" value="1"></label><button onclick="addWindowFilmOrder()">＋ 加入订单</button></section><section id="windowFilmSelectedList" class="window-film-selected-list hidden"><header><div><span>当前订单</span><h2>窗膜订购清单</h2></div><b id="windowFilmSelectedCount">0 项</b></header><div id="windowFilmSelectedRows"></div><button onclick="previewWindowFilmCheckout()">下一步：去结账 →</button><p>当前为页面设计预览，不查询实时库存、不扣减库存，也不会生成正式订单。</p></section><div id="windowFilmCheckoutPreview" class="wrap-checkout-preview hidden"><b>下一步：统一结账</b><p>正式版本会把窗膜、PPF、改色膜等产品合并到同一个购物车，再统一核对库存、地址、运费、税费和付款信息。</p><button onclick="this.parentElement.classList.add('hidden')">继续检查本页</button></div></main></section>`);

window.showWindowFilmCatalog=function(){['landing','login','app','orderCenter','ppfCatalog','colorWrapCatalog'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));document.getElementById('windowFilmCatalog')?.classList.remove('hidden');window.scrollTo({top:0,behavior:'auto'})};
window.selectWindowFilmModel=function(button,series,model){document.querySelectorAll('.window-film-models button').forEach(item=>item.classList.toggle('selected',item===button));const quick=document.getElementById('windowFilmQuickOrder');quick.dataset.series=series;quick.dataset.model=model;document.getElementById('windowFilmSelectedModel').textContent=model;document.getElementById('windowFilmSelectedSeries').textContent=series;quick.scrollIntoView({behavior:'smooth',block:'center'})};
window.addWindowFilmOrder=function(){const quick=document.getElementById('windowFilmQuickOrder'),size=document.getElementById('windowFilmSize').value,qty=Math.max(1,Number(document.getElementById('windowFilmQty').value||1));if(!quick.dataset.model){alert('请先选择一个窗膜型号。');return}if(!size){alert('请选择卷材规格。');return}const rows=document.getElementById('windowFilmSelectedRows'),row=document.createElement('div');row.innerHTML=`<div><b>${quick.dataset.model}</b><small>${quick.dataset.series} · ${size}</small></div><strong>× ${qty}</strong><button aria-label="删除这一项" onclick="this.parentElement.remove();updateWindowFilmCount()">×</button>`;rows.appendChild(row);document.getElementById('windowFilmSelectedList').classList.remove('hidden');updateWindowFilmCount()};
window.updateWindowFilmCount=function(){const rows=document.getElementById('windowFilmSelectedRows');document.getElementById('windowFilmSelectedCount').textContent=`${rows.children.length} 项`;if(!rows.children.length)document.getElementById('windowFilmSelectedList').classList.add('hidden')};
window.previewWindowFilmCheckout=function(){const preview=document.getElementById('windowFilmCheckoutPreview');preview.classList.remove('hidden');preview.scrollIntoView({behavior:'smooth',block:'center'})};

// Unified dealer checkout. Card details are collected only by Stripe Checkout.
document.body.insertAdjacentHTML('beforeend',`<section id="dealerCheckout" class="dealer-checkout hidden"><header class="order-center-header"><button class="order-center-brand" onclick="closeDealerCheckout()"><img src="/quad-film-icon.png" alt="QUAD FILM"><span><b>QUAD FILM</b><small>统一结账</small></span></button><div><button class="order-home-button" onclick="closeDealerCheckout()">← 返回继续选货</button><button class="order-login-button" onclick="showLogin()">经销商登录</button></div></header><main class="checkout-main"><section class="checkout-title"><span>QUAD FILM · 经销商采购</span><h1>核对订单并付款</h1><p>不同产品分类的商品集中在这里统一确认。当前为付款页面设计预览，不会产生真实订单或扣款。</p></section><div class="checkout-layout"><div class="checkout-left"><section class="checkout-card"><header><div><span>01</span><h2>订单商品</h2></div><b id="checkoutItemCount">0 项</b></header><div id="checkoutItems"></div><button class="checkout-add-more" onclick="showOrderCenter()">＋ 继续添加产品</button></section><section class="checkout-card"><header><div><span>02</span><h2>收货信息</h2></div></header><div class="checkout-fields"><label class="wide">公司 / 门店名称<input value="Eric · QUaD Dealer" autocomplete="organization"></label><label>收货人<input value="Eric" autocomplete="name"></label><label>联系电话<input type="tel" placeholder="美国手机号码" autocomplete="tel"></label><label class="wide">街道地址<input placeholder="Street address" autocomplete="street-address"></label><label>城市<input placeholder="City" autocomplete="address-level2"></label><label>州<select autocomplete="address-level1"><option>NV · Nevada</option><option>CA · California</option><option>AZ · Arizona</option><option>TX · Texas</option></select></label><label>邮编<input inputmode="numeric" placeholder="ZIP Code" autocomplete="postal-code"></label></div></section><section class="checkout-card"><header><div><span>03</span><h2>配送方式</h2></div></header><label class="checkout-choice selected"><input type="radio" name="shipping" value="delivery" checked onchange="updateCheckoutTotals()"><i></i><span><b>标准商业配送</b><small>预计 3–5 个工作日 · 运费确认后计入</small></span><strong>待确认</strong></label><label class="checkout-choice"><input type="radio" name="shipping" value="pickup-las-vegas" onchange="updateCheckoutTotals()"><i></i><span><b>拉斯维加斯仓库自提</b><small>备货完成后通知取货 · 以拉斯维加斯仓库存为准</small></span><strong>$0</strong></label><label class="checkout-choice"><input type="radio" name="shipping" value="pickup-los-angeles" onchange="updateCheckoutTotals()"><i></i><span><b>洛杉矶仓库自提</b><small>备货完成后通知取货 · 以洛杉矶仓库存为准</small></span><strong>$0</strong></label></section><section class="checkout-card"><header><div><span>04</span><h2>付款方式</h2></div><em>安全支付</em></header><label class="checkout-choice selected"><input type="radio" name="payment" checked><i></i><span><b>信用卡 / 借记卡</b><small>Visa · Mastercard · American Express</small></span></label><div class="checkout-card-fields"><label class="wide">持卡人姓名<input placeholder="Name on card" autocomplete="cc-name"></label><label class="wide">卡号<div class="checkout-fake-input">••••&nbsp; ••••&nbsp; ••••&nbsp; •••• <span>VISA</span></div></label><label>有效期<input placeholder="MM / YY" autocomplete="cc-exp"></label><label>安全码<input placeholder="CVC" autocomplete="cc-csc"></label></div><p class="checkout-security">正式接入 Stripe 后，完整卡号将由支付平台安全处理，QUaD 系统不保存完整信用卡资料。</p></section><label class="checkout-notes">订单备注<textarea placeholder="填写送货要求、PO 编号或其他说明（选填）"></textarea></label></div><aside class="checkout-summary"><span>订单汇总</span><h2>付款明细</h2><dl><div><dt>商品小计</dt><dd id="checkoutSubtotal">登录后显示</dd></div><div><dt>配送费</dt><dd id="checkoutShippingFee">待确认</dd></div><div><dt>销售税</dt><dd>按收货或自提地址计算</dd></div></dl><div class="checkout-total"><span>应付总额</span><b>确认后显示</b></div><button type="button" onclick="previewCheckoutSubmit()">确认订单并付款</button><small>点击后仅查看设计提示，不会扣款。</small><div class="checkout-assurance"><b>✓ 库存确认后付款</b><b>✓ 美国信用卡安全支付</b><b>✓ 订单与物流统一跟踪</b></div></aside></div></main></section>`);

const dealerCheckout=document.getElementById('dealerCheckout');
dealerCheckout.querySelector('.checkout-title p').textContent='After sign-in, the server verifies your dealer pricing and warehouse inventory before opening Stripe Secure Checkout.';
dealerCheckout.querySelector('.checkout-card-fields')?.remove();
dealerCheckout.querySelector('.checkout-security').textContent='Card number, expiration date, CVC, and billing address are entered only on Stripe Secure Checkout. Eligible Apple devices will automatically offer Apple Pay.';
const checkoutAddressFields=dealerCheckout.querySelectorAll('.checkout-fields input,.checkout-fields select');
['checkoutCompany','checkoutRecipient','checkoutPhone','checkoutStreet','checkoutCity','checkoutState','checkoutPostalCode'].forEach((id,index)=>{if(checkoutAddressFields[index])checkoutAddressFields[index].id=id});
const checkoutAddressBox=dealerCheckout.querySelector('.checkout-fields');
checkoutAddressBox?.insertAdjacentHTML('afterend','<p id="checkoutAddressSaveStatus" class="checkout-security">After sign-in, delivery details are saved to your account and filled in automatically next time.</p>');
const deliveryChoice=dealerCheckout.querySelector('input[name="shipping"][value="delivery"]')?.closest('.checkout-choice');
if(deliveryChoice){
  deliveryChoice.querySelector('b').textContent='SHIPMENT (PARCEL / FREIGHT)';
  deliveryChoice.querySelector('small').textContent='Customer service confirms shipping based on address, weight, and service level';
  deliveryChoice.querySelector('strong').textContent='PENDING';
}
dealerCheckout.querySelector('.checkout-summary button').textContent='CONTINUE TO STRIPE SECURE CHECKOUT';
dealerCheckout.querySelector('.checkout-summary>small').textContent='Your payment environment is confirmed automatically after sign-in.';
const checkoutSummaryRows=dealerCheckout.querySelector('.checkout-summary dl');
if(checkoutSummaryRows){
  checkoutSummaryRows.innerHTML=`<div><dt>Wholesale Price</dt><dd id="checkoutListSubtotal">Shown after sign-in</dd></div><div class="checkout-tier-row"><dt>Dealer Level</dt><dd id="checkoutCustomerTier">Identified after sign-in</dd></div><div class="checkout-saving-row"><dt>Your Savings</dt><dd id="checkoutDiscount">Calculated after sign-in</dd></div><div><dt>Discounted Subtotal</dt><dd id="checkoutSubtotal">Shown after sign-in</dd></div><div><dt>Shipping</dt><dd id="checkoutShippingFee">Pending</dd></div><div><dt>Sales Tax</dt><dd>Calculated from the delivery or pickup location</dd></div>`;
}

const checkoutEnglishText=new Map([
  ['统一结账','UNIFIED CHECKOUT'],['← 返回继续选货','← CONTINUE SHOPPING'],['经销商登录','DEALER LOGIN'],
  ['QUAD FILM · 经销商采购','QUAD FILM · DEALER ORDERING'],['核对订单并付款','REVIEW ORDER & PAY'],
  ['订单商品','ORDER ITEMS'],['0 项','0 ITEMS'],['＋ 继续添加产品','＋ ADD MORE PRODUCTS'],['收货信息','DELIVERY INFORMATION'],
  ['公司 / 门店名称','COMPANY / STORE NAME'],['收货人','RECIPIENT'],['联系电话','PHONE'],['街道地址','STREET ADDRESS'],['城市','CITY'],['州','STATE'],['邮编','ZIP CODE'],
  ['配送方式','DELIVERY METHOD'],['拉斯维加斯仓库自提','LAS VEGAS WAREHOUSE PICKUP'],['洛杉矶仓库自提','LOS ANGELES WAREHOUSE PICKUP'],
  ['备货完成后通知取货 · 以拉斯维加斯仓库存为准','Pickup notification after preparation · Subject to Las Vegas inventory'],
  ['备货完成后通知取货 · 以洛杉矶仓库存为准','Pickup notification after preparation · Subject to Los Angeles inventory'],
  ['付款方式','PAYMENT METHOD'],['安全支付','SECURE PAYMENT'],['信用卡 / 借记卡','CREDIT / DEBIT CARD'],['订单备注','ORDER NOTES'],
  ['订单汇总','ORDER SUMMARY'],['付款明细','PAYMENT DETAILS'],['应付总额','TOTAL DUE'],['确认后显示','CONFIRMED AT CHECKOUT'],
  ['✓ 库存确认后付款','✓ PAY AFTER INVENTORY VERIFICATION'],['✓ 美国信用卡安全支付','✓ SECURE U.S. CARD PAYMENT'],['✓ 订单与物流统一跟踪','✓ UNIFIED ORDER & SHIPPING TRACKING']
]);
const checkoutWalker=document.createTreeWalker(dealerCheckout,NodeFilter.SHOW_TEXT);
while(checkoutWalker.nextNode()){const node=checkoutWalker.currentNode,key=node.nodeValue.trim();if(checkoutEnglishText.has(key))node.nodeValue=node.nodeValue.replace(key,checkoutEnglishText.get(key))}
dealerCheckout.querySelector('input[autocomplete="tel"]')?.setAttribute('placeholder','U.S. phone number');
dealerCheckout.querySelector('.checkout-notes textarea')?.setAttribute('placeholder','Delivery instructions, PO number, or other notes (optional)');

function checkoutPreviewItems(){
  const items=[];
  document.querySelectorAll('#ppfSelectedRows>div').forEach(row=>items.push({category:'PPF 漆面保护膜',sku:row.querySelector('b')?.textContent?.trim()||'',name:row.querySelector('b')?.textContent||'PPF',detail:row.querySelector('small')?.textContent||'所选规格',qty:(row.querySelector('strong')?.textContent||'× 1').replace(/[^0-9]/g,'')||'1'}));
  document.querySelectorAll('#wrapSelectedRows .wrap-selected-row').forEach(row=>{const detail=row.querySelector('small')?.textContent||'';items.push({category:'汽车改色膜',sku:detail.split('·')[0].trim(),name:row.querySelector('b')?.textContent||'改色膜',detail:detail||'所选规格',qty:(row.querySelector('strong')?.textContent||'× 1').replace(/[^0-9]/g,'')||'1'})});
  document.querySelectorAll('#windowFilmSelectedRows>div').forEach(row=>items.push({category:'汽车窗膜',sku:row.querySelector('b')?.textContent?.trim()||'',name:row.querySelector('b')?.textContent||'窗膜',detail:row.querySelector('small')?.textContent||'所选规格',qty:(row.querySelector('strong')?.textContent||'× 1').replace(/[^0-9]/g,'')||'1'}));
  return items;
}

function dealerPriceForSku(sku){const key=String(sku||'').trim().toLowerCase();return state?.products?.find(product=>[product.sku,product.model].some(value=>String(value||'').trim().toLowerCase()===key))||null}
function checkoutDeliveryProfile(){return {company:document.getElementById('checkoutCompany')?.value.trim()||'',recipient:document.getElementById('checkoutRecipient')?.value.trim()||'',phone:document.getElementById('checkoutPhone')?.value.trim()||'',street:document.getElementById('checkoutStreet')?.value.trim()||'',city:document.getElementById('checkoutCity')?.value.trim()||'',state:document.getElementById('checkoutState')?.value.split(' · ')[0].trim()||'',postalCode:document.getElementById('checkoutPostalCode')?.value.trim()||'',country:'US'}}
let checkoutAddressSaveTimer=null;
async function saveCheckoutDeliveryProfile(showStatus=true){
  if(!token||!state)return;
  const status=document.getElementById('checkoutAddressSaveStatus');
  try{
    if(showStatus&&status)status.textContent='Saving delivery information…';
    const result=await api('/api/customer/delivery-profile',{method:'POST',body:JSON.stringify(checkoutDeliveryProfile())});
    state.customer.deliveryProfile=result.deliveryProfile;
    if(status)status.textContent='✓ Delivery information saved for your next checkout.';
  }catch(error){if(status)status.textContent=`Delivery information could not be saved: ${error.message}`;throw error}
}
checkoutAddressFields.forEach(field=>field.addEventListener('change',()=>{clearTimeout(checkoutAddressSaveTimer);checkoutAddressSaveTimer=setTimeout(()=>saveCheckoutDeliveryProfile().catch(()=>{}),250)}));
function dealerTierLabel(){const labels={standard:'Wholesale Price',bronze:'Bronze Dealer Price',silver:'Silver Dealer Price',gold:'Gold Dealer Price',strategic:'Strategic Partner Price'};return labels[state?.customer?.priceTier]||state?.customer?.priceTierName||'Dealer Price'}
function updateStripeEnvironmentLabel(){
  const live=state?.paymentEnvironment==='live';
  const note=dealerCheckout.querySelector('.checkout-summary>small');
  const intro=dealerCheckout.querySelector('.checkout-title p');
  if(note)note.textContent=live?'Stripe live mode is active. Confirming payment will create a real charge.':'Stripe test mode is active. No real charge will be made.';
  if(intro)intro.textContent=`After sign-in, the server verifies your dealer pricing and warehouse inventory before opening Stripe ${live?'Live':'Test'} Secure Checkout.`;
}
function dealerPriceHtml(item){
  if(!token||!state)return '<span class="checkout-price pending">Sign in to view your price</span>';
  const product=dealerPriceForSku(item.sku);
  if(!product||product.price===null)return '<span class="checkout-price pending">Server price verification</span>';
  const list=Number(product.listPrice),price=Number(product.price),hasList=Number.isFinite(list)&&list>0;
  const discount=hasList&&price<list?Math.round(price/list*100):100;
  return `<span class="checkout-price">${hasList?`<del>Wholesale $${list.toFixed(2)}</del>`:''}<small>${esc(dealerTierLabel())}${hasList&&price<list?` · ${discount}% of wholesale`:''}</small><b>Your Price $${price.toFixed(2)}</b></span>`;
}

window.showDealerCheckout=function(){
  ['landing','login','app','orderCenter','ppfCatalog','colorWrapCatalog','windowFilmCatalog'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
  const items=checkoutPreviewItems(),container=document.getElementById('checkoutItems');
  container.innerHTML=items.length?items.map((item,index)=>`<article class="checkout-item" data-sku="${esc(item.sku)}"><span>${String(index+1).padStart(2,'0')}</span><div><small>${esc(item.category)}</small><b>${esc(item.name)}</b><em>${esc(item.detail)}</em></div><label>Quantity<input type="number" min="1" value="${item.qty}" onchange="updateCheckoutTotals()"></label>${dealerPriceHtml(item)}<button aria-label="Remove product" onclick="this.closest('article').remove();updateCheckoutTotals()">×</button></article>`).join(''):'<p>Your cart is empty. Return to the product categories to select products.</p>';
  document.getElementById('dealerCheckout').classList.remove('hidden');
  if(state?.customer){
    const saved=state.customer.deliveryProfile||{};
    document.getElementById('checkoutCompany').value=saved.company||state.customer.businessName||'';
    document.getElementById('checkoutRecipient').value=saved.recipient||state.customer.contactName||'';
    document.getElementById('checkoutPhone').value=saved.phone||state.customer.phone||'';
    document.getElementById('checkoutStreet').value=saved.street||'';
    document.getElementById('checkoutCity').value=saved.city||'';
    if(saved.state)document.getElementById('checkoutState').value=[...document.getElementById('checkoutState').options].find(option=>option.value.startsWith(saved.state))?.value||document.getElementById('checkoutState').value;
    document.getElementById('checkoutPostalCode').value=saved.postalCode||'';
  }
  updateDealerIdentity();
  updateStripeEnvironmentLabel();
  updateCheckoutTotals();window.scrollTo({top:0,behavior:'auto'});
};
window.closeDealerCheckout=function(){document.getElementById('dealerCheckout')?.classList.add('hidden');showOrderCenter()};
window.updateCheckoutTotals=function(){
  const rows=[...document.querySelectorAll('#checkoutItems .checkout-item')],count=rows.reduce((sum,row)=>sum+Math.max(1,Number(row.querySelector('input')?.value||1)),0),fulfillment=String(document.querySelector('input[name="shipping"]:checked')?.value||''),pickup=fulfillment.startsWith('pickup-'),button=document.querySelector('#dealerCheckout .checkout-summary button');
  let listSubtotal=0,agreementSubtotal=0,priced=Boolean(token&&state)&&rows.length>0;
  rows.forEach(row=>{const product=dealerPriceForSku(row.dataset.sku),qty=Math.max(1,Number(row.querySelector('input')?.value||1)),list=Number(product?.listPrice),price=Number(product?.price);if(!product||product.price===null||!Number.isFinite(price)){priced=false;return}agreementSubtotal+=price*qty;listSubtotal+=(Number.isFinite(list)&&list>0?list:price)*qty});
  const savings=Math.max(0,listSubtotal-agreementSubtotal),discount=listSubtotal>0?Math.round(agreementSubtotal/listSubtotal*100):100;
  document.getElementById('checkoutItemCount').textContent=`${count} ROLL${count===1?'':'S'}`;
  document.getElementById('checkoutListSubtotal').textContent=priced?`$${listSubtotal.toFixed(2)}`:'Server verification';
  document.getElementById('checkoutCustomerTier').textContent=token&&state?dealerTierLabel():'Please sign in';
  document.getElementById('checkoutDiscount').textContent=priced&&savings>0?`${discount}% of wholesale · Save $${savings.toFixed(2)}`:priced?'Wholesale price':'Calculated by server';
  document.getElementById('checkoutSubtotal').textContent=priced?`$${agreementSubtotal.toFixed(2)}`:'Server verification';
  document.querySelector('#dealerCheckout .checkout-total b').textContent=priced?`$${agreementSubtotal.toFixed(2)} + tax`:'Confirmed by Stripe';
  document.getElementById('checkoutShippingFee').textContent=pickup?'$0':'Pending';
  if(button)button.textContent=pickup?`CONTINUE TO STRIPE ${state?.paymentEnvironment==='live'?'LIVE':'TEST'} CHECKOUT`:'PAY FOR PRODUCTS (SHIPPING CONFIRMED LATER)';
  document.querySelectorAll('input[name="shipping"]').forEach(input=>input.closest('.checkout-choice')?.classList.toggle('selected',input.checked));
};
window.previewCheckoutSubmit=async function(){
  const button=document.querySelector('#dealerCheckout .checkout-summary button');
  try{
    if(!token){window.quadResumeDealerCheckout=true;showLogin();throw new Error('Please sign in with your dealer account. You will return to checkout after sign-in.')}
    const rows=[...document.querySelectorAll('#checkoutItems .checkout-item')];
    if(!rows.length)throw new Error('Your cart is empty. Please select a product first.');
    const grouped=new Map();
    rows.forEach(row=>{const sku=row.dataset.sku?.trim(),qty=Math.max(1,Math.floor(Number(row.querySelector('input')?.value||1)));if(sku)grouped.set(sku,(grouped.get(sku)||0)+qty)});
    if(!grouped.size)throw new Error('No valid purchasable SKU was found. Return to the product page and select a model again.');
    const fulfillment=document.querySelector('input[name="shipping"]:checked')?.value;
    if(!['delivery','pickup-las-vegas','pickup-los-angeles'].includes(fulfillment))throw new Error('Select shipment or warehouse pickup.');
    const shippingAddress=fulfillment==='delivery'?checkoutDeliveryProfile():null;
    if(shippingAddress&&(!shippingAddress.recipient||!shippingAddress.phone||!shippingAddress.street||!shippingAddress.city||!shippingAddress.state||!shippingAddress.postalCode))throw new Error('For shipment, enter the recipient, phone, street, city, state, and ZIP code.');
    await saveCheckoutDeliveryProfile(false);
    button.disabled=true;button.textContent='VERIFYING PRICE AND INVENTORY…';
    const result=await api('/api/customer/checkout-session',{method:'POST',body:JSON.stringify({requestId:`customer-checkout-${Date.now()}`,items:[...grouped].map(([sku,qty])=>({sku,qty})),fulfillment,shippingAddress,notes:document.querySelector('.checkout-notes textarea')?.value||''})});
    if(!result.checkoutUrl)throw new Error('Stripe Checkout did not return a secure payment URL.');
    location.href=result.checkoutUrl;
  }catch(error){alert(error.message);if(button){button.disabled=false;updateCheckoutTotals()}}
};
window.previewWrapCheckout=window.showDealerCheckout;
window.previewWindowFilmCheckout=window.showDealerCheckout;

const customerLoginWithoutResume=login;
login=async function(){
  await customerLoginWithoutResume();
  if(token&&state&&window.quadResumeDealerCheckout){window.quadResumeDealerCheckout=false;window.showDealerCheckout()}
};

const showOrderCenterWithoutCheckout=window.showOrderCenter;
window.showOrderCenter=function(){document.getElementById('dealerCheckout')?.classList.add('hidden');showOrderCenterWithoutCheckout()};
if(new URLSearchParams(location.search).get('preview')==='checkout-cn-v1') setTimeout(()=>showDealerCheckout(),0);

const colorWrapVideo = document.querySelector('#orderCenter video source[src*="quad-color-wrap-loop-web.mp4"]')?.parentElement;
if (colorWrapVideo) {
  colorWrapVideo.poster = '/assets/quad-color-wrap-cover.jpg';
  colorWrapVideo.addEventListener('error', () => {
    const fallback = document.createElement('img');
    fallback.src = '/assets/quad-color-wrap-cover.jpg';
    fallback.alt = 'QUaD 汽车改色膜展示';
    colorWrapVideo.replaceWith(fallback);
  });
}
