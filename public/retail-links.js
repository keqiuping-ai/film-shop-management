/* Shared, allowlisted retail destinations. Tokens remain in the URL fragment. */
(function(root){
 const destinations=[
  ['ppf','PPF 隐形车衣','PPF Paint Protection','product/ppf'],
  ['wrap','改色膜 · 产品介绍','Color Wraps · Overview','product/wrap'],
  ['colors','改色膜 · 直接选颜色','Color Wraps · Choose Colors','product/wrap/colors'],
  ['tint','汽车窗膜','Window Tint','product/tint'],
  ['building','建筑膜','Architectural Film','product/building'],
  ['interior','家居膜','Interior Film','product/home'],
  ['all','全部产品首页','All Products','home']
 ];
 const route=key=>destinations.find(d=>d[0]===key)?.[3]||'home';
 const withTarget=(url,key)=>url.split('?target=')[0]+'?target='+encodeURIComponent(destinations.some(d=>d[0]===key)?key:'all');
 const parseInvite=hash=>{const m=hash.match(/^#invite\/([A-Za-z0-9_-]+)(?:\?target=([A-Za-z0-9_-]+))?$/);return m?{token:m[1],route:route(m[2])}:null};
 const api={destinations,route,withTarget,parseInvite};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RetailLinks=api;
})(typeof window==='object'?window:this);
