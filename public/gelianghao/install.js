// Installation adds an app shortcut; no offline message cache or service worker.
(()=>{
 'use strict';
 let promptEvent=null,installed=false,prompting=false;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 function updateButtons(){const done=installed||standalone();document.querySelectorAll('[data-install]').forEach(b=>{const label=done?'已安装到桌面':'安装到桌面';if(b.textContent!==label)b.textContent=label;if(b.disabled!==done)b.disabled=done;});}
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;updateButtons();});
 window.addEventListener('appinstalled',()=>{installed=true;promptEvent=null;updateButtons();window.toast?.('已安装，以后可从桌面打开哥俩好');});
 matchMedia('(display-mode: standalone)').addEventListener('change',updateButtons);
 function instructions(){
  const ua=navigator.userAgent,ios=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),android=/Android/i.test(ua),embedded=/MicroMessenger|FBAN|FBAV|Instagram|Line\//i.test(ua),safari=/Safari/.test(ua)&&!/Chrome|Chromium|Edg|CriOS|FxiOS/.test(ua);
  let steps;
  if(ios)steps='<li>用 Safari 浏览器打开哥俩好。</li><li>点浏览器的“分享”按钮（方框向上箭头；部分版本在“更多”菜单里）。</li><li>选择“添加到主屏幕”。如果出现“作为网页 App 打开”，保持开启。</li><li>点“添加”，桌面就会出现哥俩好图标。</li>';
  else if(android)steps='<li>用 Chrome 或 Edge 打开哥俩好。</li><li>打开浏览器右上角“⋮”菜单。</li><li>选择“安装应用”或“添加到主屏幕”，再确认安装。</li>';
  else if(safari)steps='<li>打开 Safari 的“文件”菜单。</li><li>选择“添加到程序坞”，再点“添加”。</li><li>以后可从程序坞打开哥俩好。若没有此选项，可使用 Chrome 或 Edge 安装。</li>';
  else steps='<li>用 Chrome 或 Edge 打开哥俩好。</li><li>点击地址栏右侧的安装图标，或在浏览器菜单中查找“安装哥俩好”／“将网页安装为应用”。</li><li>确认安装，以后就可从桌面或应用列表打开。</li>';
  const url=location.origin+'/gelianghao/';
  modal('安装哥俩好到桌面',`<p>装好后，点桌面图标就能直接打开聊天。</p>${embedded?'<p class="install-tip">当前在应用内浏览器，请先点右上角菜单，选择用系统浏览器打开。</p>':''}<ol class="install-steps">${steps}</ol><label for="installUrl">哥俩好网址</label><input id="installUrl" type="url" readonly value="${url}"><div class="dialog-actions"><button type="button" data-install-copy>复制网址</button><button type="button" class="primary" data-action="close">知道了</button></div><p class="muted">安装不会备份聊天内容，消息仍在 24 小时后删除。</p>`);
 }
 document.addEventListener('click',async e=>{
  if(e.target.closest('[data-install-copy]')){try{await navigator.clipboard.writeText(location.origin+'/gelianghao/');toast('网址已复制');}catch{document.querySelector('#installUrl')?.select();toast('请复制已选中的网址');}return;}
  if(!e.target.closest('[data-install]')||prompting||installed||standalone())return;
  if(!promptEvent){instructions();return;}
  const pending=promptEvent;promptEvent=null;prompting=true;
  try{await pending.prompt();const choice=await pending.userChoice;if(choice.outcome!=='accepted')toast('已取消安装，可随时再点“安装到桌面”');}
  catch{instructions();}finally{prompting=false;updateButtons();}
 });
 new MutationObserver(updateButtons).observe(document.querySelector('#app'),{childList:true,subtree:true});updateButtons();
})();
