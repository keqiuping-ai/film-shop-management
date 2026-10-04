/* Retail UI only: never translates customer messages, form values or product codes. */
(() => {
 const languages=['zh','en','es','ja','ko'];
 let lang='en';try{const saved=localStorage.getItem('quad-retail-language');if(languages.includes(saved))lang=saved}catch{}
 const rows=window.RETAIL_TRANSLATIONS||[];
 const dictionaries=Object.fromEntries(languages.map((code,index)=>[code,new Map(rows.map(row=>[row[0],row[index]]))]));
 const sources=new WeakMap(),attributes=new WeakMap();
 const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const regex=new RegExp([...dictionaries.en.keys()].sort((a,b)=>b.length-a.length).map(escaped).join('|'),'g');
 function translate(source,language=lang){return language==='zh'?source:String(source).replace(regex,key=>dictionaries[language].get(key)||key)}
 const skip=node=>node.parentElement?.closest('script,style,textarea,[data-no-i18n],#retailLanguage');
 function apply(){
  observer.disconnect();
  document.documentElement.lang=lang==='zh'?'zh-CN':lang;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for(let n; n=walker.nextNode();){if(skip(n))continue;let record=sources.get(n);if(!record||n.nodeValue!==record.rendered)record={source:n.nodeValue};record.rendered=translate(record.source);if(n.nodeValue!==record.rendered)n.nodeValue=record.rendered;sources.set(n,record)}
  for(const el of document.querySelectorAll('[placeholder],[aria-label],[title],[alt]')){if(el.closest('[data-no-i18n],#retailLanguage'))continue;let records=attributes.get(el)||{};for(const name of ['placeholder','aria-label','title','alt']){if(!el.hasAttribute(name))continue;const value=el.getAttribute(name);let record=records[name];if(!record||value!==record.rendered)record={source:value};record.rendered=translate(record.source);if(value!==record.rendered)el.setAttribute(name,record.rendered);records[name]=record}attributes.set(el,records)}
  document.querySelector('#retailLanguage').value=lang;
  observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title','alt']});
 }
 const observer=new MutationObserver(()=>apply());
 window.RetailI18n={get lang(){return lang},translate,apply};
 document.querySelector('#retailLanguage').addEventListener('change',event=>{lang=event.target.value;try{localStorage.setItem('quad-retail-language',lang)}catch{}apply();window.dispatchEvent(new Event('retail-language-change'))});
 apply();
})();
