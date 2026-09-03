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

const orderCenterChinese = {
  'DEALER ORDERING CENTER': '经销商订货中心',
  '← BRAND HOME': '← 品牌首页',
  'DEALER LOGIN': '经销商登录',
  'QUAD FILM · PROFESSIONAL DEALER PORTAL': 'QUAD FILM · 专业经销商平台',
  'Select a Product Category': '选择产品分类',
  'Choose a category to view its product series, specifications, colors, sizes, and dealer ordering options.': '选择一个产品类别，查看相应的产品系列、规格、颜色、尺寸和订货选项。',
  'ORDERING CENTER PREVIEW': '订货中心页面预览',
  'Product pricing, payment, and live inventory are not connected yet.': '产品价格、付款功能和实时库存暂未连接。',
  '01 · AUTOMOTIVE PROTECTION': '01 · 汽车漆面保护',
  'Paint Protection Film': '漆面保护膜 PPF',
  'Clear, matte, and specialty-effect PPF for premium automotive applications.': '适用于高端汽车的透明、哑光及特殊效果漆面保护膜。',
  'ENTER PPF CATALOG': '进入 PPF 产品目录',
  '02 · COLOR & FINISH': '02 · 色彩与质感',
  'Color Change Wrap': '汽车改色膜',
  'Browse colors, finishes, textures, and product codes for complete vehicle transformations.': '按颜色、表面效果、纹理和产品编号选购整车改色产品。',
  'ENTER COLOR WRAP CATALOG': '进入改色膜产品目录',
  '03 · SOLAR CONTROL': '03 · 隔热与太阳能控制',
  'Window Film & Tesla Roof Film': '汽车窗膜与特斯拉车顶膜',
  'Automotive heat rejection, UV protection, privacy, and panoramic roof solutions.': '提供汽车隔热、防紫外线、隐私保护及全景天幕解决方案。',
  'ENTER WINDOW FILM CATALOG': '进入窗膜产品目录',
  '04 · BUILDING PERFORMANCE': '04 · 建筑性能提升',
  'Architectural Film': '建筑膜',
  'Heat-control, privacy, decorative, safety, and security films for residential and commercial glass.': '适用于住宅和商业玻璃的隔热、隐私、装饰、安全及防爆膜。',
  'ENTER ARCHITECTURAL CATALOG': '进入建筑膜产品目录',
  '05 · INTERIOR RENOVATION': '05 · 室内空间翻新',
  'Interior Surface Film': '家居膜',
  'Decorative and protective finishes for countertops, cabinetry, furniture, and walls.': '适用于台面、橱柜、家具和墙面的装饰与保护贴膜。',
  'ENTER INTERIOR FILM CATALOG': '进入家居膜产品目录',
  '06 · MARINE PROTECTION': '06 · 船艇表面保护',
  'Yacht Protection Film': '游艇膜',
  'Marine-focused PPF for gelcoat, high-gloss paint, exterior surfaces, and yacht interiors.': '适用于胶衣、高光漆面、船体外部及游艇内饰的专业保护膜。',
  'ENTER YACHT FILM CATALOG': '进入游艇膜产品目录',
  'NEXT PAGE': '下一页',
  'This product catalog will be designed after the ordering center homepage is approved.': '订货中心首页确认后，我们将开始设计这个类别的产品目录。',
  'CONTINUE REVIEWING': '继续检查本页'
};

document.querySelectorAll('#orderCenter small, #orderCenter button, #orderCenter span, #orderCenter h1, #orderCenter h2, #orderCenter p, #orderCenter b').forEach(element => {
  const translated = orderCenterChinese[element.textContent.trim()];
  if (translated) element.textContent = translated;
});

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
      <nav class="ppf-filter" aria-label="PPF 产品筛选">
        <button class="active" type="button">全部产品</button><button type="button">透明亮面</button><button type="button">深哑光</button><button type="button">缎面</button><button type="button">专项保护</button>
      </nav>
      <section class="ppf-grid">
        <article><div class="ppf-product-media"><img src="/assets/quad-premium-automotive-hero-v1.png" alt="透明亮面 PPF"></div><div class="ppf-product-copy"><span>透明系列</span><h2>高亮透明 PPF</h2><p>突出原车漆光泽，适用于整车及重点部位的日常防护。</p>${ppfOrderControls('高亮透明 PPF')}</div></article>
        <article><div class="ppf-product-media"><img src="/assets/ppf-matte-hero-v1.png" alt="深哑光 PPF 的高雾度低反光效果"></div><div class="ppf-product-copy"><span>高雾度系列</span><h2>深哑光 PPF</h2><p>雾度更高、反光更少，呈现均匀柔和、更加纯粹的深哑光效果。</p>${ppfOrderControls('深哑光 PPF')}</div></article>
        <article><div class="ppf-product-media"><img src="/assets/ppf-satin-hero-v1.png" alt="缎面 PPF 的柔和丝绸光泽效果"></div><div class="ppf-product-copy"><span>轻雾度系列</span><h2>缎面 PPF</h2><p>保留细腻的柔和光泽，比亮面低调、比深哑光更有层次和质感。</p>${ppfOrderControls('缎面 PPF')}</div></article>
        <article><div class="ppf-product-media"><img src="/assets/quad-f1-installation-process.jpg" alt="汽车重点部位 PPF"></div><div class="ppf-product-copy"><span>专项保护系列</span><h2>重点部位保护膜</h2><p>适用于前保险杠、引擎盖、后视镜、门边及其他高风险区域。</p>${ppfOrderControls('重点部位保护膜')}</div></article>
        <article><div class="ppf-product-media"><img src="/assets/yacht-protection-film-ppf.jpg" alt="游艇 PPF"></div><div class="ppf-product-copy"><span>船艇应用系列</span><h2>游艇表面保护膜</h2><p>针对游艇高光漆面、胶衣及高频接触区域的专业保护方案。</p>${ppfOrderControls('游艇表面保护膜')}</div></article>
      </section>
      <div id="ppfPreviewNotice" class="ppf-preview-notice hidden"><b id="ppfPreviewProduct"></b><p>当前只确认页面设计，尚未加入真实购物车，也不会产生正式订单。</p><button onclick="document.getElementById('ppfPreviewNotice').classList.add('hidden')">继续检查产品</button></div>
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
      button.innerHTML=`<img src="${color.image}" alt="${color.code} ${color.name}" loading="lazy"><b>${color.name}</b><small>${color.code}</small>`;
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
  return `<div class="ppf-variant-list"><div class="ppf-variant-row"><label class="ppf-model-field">具体型号 <small>未来与库存同步</small><select><option>请选择具体型号</option><option disabled>型号由 QUaD 库存系统提供</option></select></label><label>规格<select><option>请选择规格</option><option>60 英寸 × 50 英尺</option><option>72 英寸 × 50 英尺</option></select></label><label>数量<input type="number" min="1" value="1"></label><button class="ppf-remove-variant hidden" type="button" aria-label="删除这一项" onclick="removePpfVariantRow(this)">×</button></div></div><button class="ppf-add-variant" type="button" onclick="addPpfVariantRow(this)">＋ 添加另一个型号</button><button class="ppf-preview-button" onclick="previewPpfProduct('${name}')">选择此产品</button>`;
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

window.previewPpfProduct = function (name) {
  document.getElementById('ppfPreviewProduct').textContent = name;
  document.getElementById('ppfPreviewNotice').classList.remove('hidden');
  document.getElementById('ppfPreviewNotice').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const windowFilmSeries = [
  {tier:'01 · 顶级系列',name:'Premium 磁控溅射系列',technology:'双银反射隔热技术',note:'双层银磁控溅射结构，以反射方式阻隔热量。主打高透、高清、低雾度与强隔热。',models:[['SP70','70%','98%','60%'],['SP50','50%','97%','70%'],['SP20','18%','96%','87%'],['SP10','10%','98%','93%']]},
  {tier:'02 · 高性能系列',name:'磁控溅射混合系列',technology:'单银反射＋Nano 吸热',note:'单银磁控溅射与 Nano 陶瓷结合，兼顾清晰视野、隔热表现和施工收缩性能。',models:[['SPV70','70%','93%','53%'],['SP20N','24%','93%','82%'],['SP10N','10%','95%','91%'],['SP05N','7%','95%','93%']]},
  {tier:'03 · 经典系列',name:'Nano 陶瓷系列',technology:'Nano 陶瓷吸热技术',note:'采用吸热型 Nano 陶瓷技术，无信号干扰；提供从高透前挡到深色隐私的多种透光率。',models:[['NA70','72%','95%','55%'],['NA28','30%','96%','80%'],['NA15','15%','95%','89%'],['NA10','10%','95%','92%']]}
];

function windowFilmSizeOptions(){return '<option value="">选择卷材规格</option><option>20 英寸 × 100 英尺（约 0.51 × 30.5 米）</option><option>36 英寸 × 100 英尺（约 0.91 × 30.5 米）</option><option>40 英寸 × 100 英尺（约 1.02 × 30.5 米）</option><option>60 英寸 × 100 英尺（约 1.52 × 30.5 米）</option>'}
function renderWindowFilmSeries(s){return `<article class="window-film-series"><header><div><span>${s.tier}</span><h2>${s.name}</h2><b>${s.technology}</b></div><p>${s.note}</p></header><div class="window-film-models">${s.models.map(m=>`<button type="button" onclick="selectWindowFilmModel(this,'${s.name}','${m[0]}')"><strong>${m[0]}</strong><small>透光率 ${m[1]}</small><i><span>UV 99.9%</span><span>IR ${m[2]}</span><span>TSER ${m[3]}</span></i></button>`).join('')}</div></article>`}

document.body.insertAdjacentHTML('beforeend',`<section id="windowFilmCatalog" class="window-film-catalog hidden"><header class="order-center-header"><button class="order-center-brand" onclick="showOrderCenter()"><img src="/quad-film-icon.png" alt="QUAD FILM"><span><b>QUAD FILM</b><small>汽车窗膜产品订购页</small></span></button><div><button class="order-home-button" onclick="showOrderCenter()">← 返回产品分类</button><button class="order-login-button" onclick="showLogin()">经销商登录</button></div></header><main class="window-film-main"><section class="window-film-intro"><span>03 · 汽车隔热膜</span><h1>选择窗膜型号</h1><p>按性能等级、透光率和应用位置选择产品。QUaD 窗膜重点突出高清、高透、低雾度、强隔热和良好的热收缩施工表现。</p><div><b>高清低雾度</b><b>高效隔热</b><b>收缩施工友好</b><b>多种透光率</b></div></section><nav class="window-film-tier-nav"><button onclick="document.getElementById('windowFilmTier1').scrollIntoView({behavior:'smooth'})">顶级双银</button><button onclick="document.getElementById('windowFilmTier2').scrollIntoView({behavior:'smooth'})">SP 混合系列</button><button onclick="document.getElementById('windowFilmTier3').scrollIntoView({behavior:'smooth'})">Nano 陶瓷</button></nav><section class="window-film-series-list">${windowFilmSeries.map((s,i)=>`<div id="windowFilmTier${i+1}">${renderWindowFilmSeries(s)}</div>`).join('')}</section><section id="windowFilmQuickOrder" class="window-film-quick-order"><div><span>快速选货与下单</span><h2 id="windowFilmSelectedModel">请先选择上方型号</h2><p id="windowFilmSelectedSeries">型号参数将自动带入这里</p></div><label>卷材规格<select id="windowFilmSize">${windowFilmSizeOptions()}</select></label><label>数量<input id="windowFilmQty" type="number" min="1" value="1"></label><button onclick="addWindowFilmOrder()">＋ 加入订单</button></section><section id="windowFilmSelectedList" class="window-film-selected-list hidden"><header><div><span>当前订单</span><h2>窗膜订购清单</h2></div><b id="windowFilmSelectedCount">0 项</b></header><div id="windowFilmSelectedRows"></div><button onclick="previewWindowFilmCheckout()">下一步：去结账 →</button><p>当前为页面设计预览，不查询实时库存、不扣减库存，也不会生成正式订单。</p></section><div id="windowFilmCheckoutPreview" class="wrap-checkout-preview hidden"><b>下一步：统一结账</b><p>正式版本会把窗膜、PPF、改色膜等产品合并到同一个购物车，再统一核对库存、地址、运费、税费和付款信息。</p><button onclick="this.parentElement.classList.add('hidden')">继续检查本页</button></div></main></section>`);

window.showWindowFilmCatalog=function(){['landing','login','app','orderCenter','ppfCatalog','colorWrapCatalog'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));document.getElementById('windowFilmCatalog')?.classList.remove('hidden');window.scrollTo({top:0,behavior:'auto'})};
window.selectWindowFilmModel=function(button,series,model){document.querySelectorAll('.window-film-models button').forEach(item=>item.classList.toggle('selected',item===button));const quick=document.getElementById('windowFilmQuickOrder');quick.dataset.series=series;quick.dataset.model=model;document.getElementById('windowFilmSelectedModel').textContent=model;document.getElementById('windowFilmSelectedSeries').textContent=series;quick.scrollIntoView({behavior:'smooth',block:'center'})};
window.addWindowFilmOrder=function(){const quick=document.getElementById('windowFilmQuickOrder'),size=document.getElementById('windowFilmSize').value,qty=Math.max(1,Number(document.getElementById('windowFilmQty').value||1));if(!quick.dataset.model){alert('请先选择一个窗膜型号。');return}if(!size){alert('请选择卷材规格。');return}const rows=document.getElementById('windowFilmSelectedRows'),row=document.createElement('div');row.innerHTML=`<div><b>${quick.dataset.model}</b><small>${quick.dataset.series} · ${size}</small></div><strong>× ${qty}</strong><button aria-label="删除这一项" onclick="this.parentElement.remove();updateWindowFilmCount()">×</button>`;rows.appendChild(row);document.getElementById('windowFilmSelectedList').classList.remove('hidden');updateWindowFilmCount()};
window.updateWindowFilmCount=function(){const rows=document.getElementById('windowFilmSelectedRows');document.getElementById('windowFilmSelectedCount').textContent=`${rows.children.length} 项`;if(!rows.children.length)document.getElementById('windowFilmSelectedList').classList.add('hidden')};
window.previewWindowFilmCheckout=function(){const preview=document.getElementById('windowFilmCheckoutPreview');preview.classList.remove('hidden');preview.scrollIntoView({behavior:'smooth',block:'center'})};

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
