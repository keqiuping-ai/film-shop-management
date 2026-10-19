const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const customer = fs.readFileSync(path.join(root, 'public/customer.js'), 'utf8');
const ordering = fs.readFileSync(path.join(root, 'public/customer-ordering.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/customer.html'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'public/customer-i18n.js'), 'utf8');

assert(customer.includes("const customerScreenIds=['landing','login','app','customerMailbox','orderCenter','ppfCatalog','colorWrapCatalog','windowFilmCatalog','dealerCheckout']"));
assert(customer.includes("function showOnlyCustomerScreen(screenId)"));
assert(customer.includes("function showLogin(){if(token&&state)return openCustomerArea('orders');showOnlyCustomerScreen('login')"));
assert(customer.includes("function showHome(){showOnlyCustomerScreen('landing')}"));
assert(customer.includes("function openRequestedCustomerView(){const view=new URLSearchParams(location.search).get('view');if(view==='order')showOrderCenter();else if(view==='login')showLogin()}"), 'QR links need stable direct routes to ordering and dealer login');
assert(customer.includes("if(!result){await sync();openRequestedCustomerView();return}"), 'signed-in dealer QR links must return to the requested destination after bootstrap');
assert(customer.includes("if(token)handleCheckoutReturn();else openRequestedCustomerView();"), 'signed-out QR links must open their requested public destination immediately');
assert(customer.includes("function openProductCategory(category)"), 'homepage categories need a public browsing route');
assert(customer.includes("if(category==='ppf')return window.showPpfCatalog?.()"), 'PPF exploration must open without dealer login');
assert(customer.includes("if(category==='color-wrap')return window.showColorWrapCatalog?.()"), 'color-wrap exploration must open without dealer login');
assert(customer.includes("if(category==='window-film')return window.showWindowFilmCatalog?.()"), 'window-film exploration must open without dealer login');
assert(customer.includes("function openCollection(category){sessionStorage.setItem('quadCustomer.collection',category);showLogin()}"), 'shop/order actions must retain dealer login');
assert(customer.includes("function openCustomerArea(next='orders'){if(!state)return showLogin();tab=next==='account'?'account':'orders';showOnlyCustomerScreen('app')"));
assert(customer.includes("customerMessageSnapshot=customerMessagesSignature();showOnlyCustomerScreen('landing')"), 'bootstrap refresh must also clear stale catalog screens');

for (const screen of ['orderCenter', 'ppfCatalog', 'colorWrapCatalog', 'windowFilmCatalog', 'dealerCheckout']) {
  assert(ordering.includes(`showOnlyCustomerScreen('${screen}')`), `${screen} must use exclusive screen navigation`);
}
assert(!ordering.includes("['landing','login','app','orderCenter','ppfCatalog','colorWrapCatalog','windowFilmCatalog'].forEach"));
assert(ordering.includes('article.addEventListener(\'click\''), 'the complete product-category card must be clickable');
assert(ordering.includes("document.querySelectorAll('#collections .collection-card')"), 'every homepage category card must be clickable');
assert(ordering.includes("card.setAttribute('role','link')"), 'homepage category cards need accessible link semantics');
assert(ordering.includes('function requireDealerForCatalogOrder(category)'), 'ordering actions need a shared dealer-login gate');
assert(ordering.includes("sessionStorage.setItem('quadCustomer.resumeCatalog',category)"), 'login must remember the public catalog the customer was viewing');
assert(ordering.includes("if(!requireDealerForCatalogOrder('ppf'))return"), 'PPF add-to-cart must require dealer login');
assert(ordering.includes("if(!requireDealerForCatalogOrder('color-wrap'))return"), 'color-wrap add-to-cart must require dealer login');
assert(ordering.includes("if(!requireDealerForCatalogOrder('window-film'))return"), 'window-film add-to-cart must require dealer login');
assert(ordering.includes('onchange="syncPpfVariantRow(this)"'), 'PPF model selection must update its single valid size');
assert(ordering.includes('choices.length===1'), 'PPF size auto-selection must be limited to one valid choice');
assert(ordering.includes('<section class="ppf-hero ppf-hero-copy-only">'), 'PPF page intro must not detach the gloss product image from its product card');
assert(ordering.includes('<article><div class="ppf-product-media"><img src="/assets/ppf-gloss-green-hero-v1.png" alt="绿色高端汽车透明亮面 PPF 镜面光泽效果">'), 'Gloss PPF card must contain its complete vehicle image');
assert(!ordering.includes('<section class="ppf-hero">\n        <div><span>01 · 漆面保护膜</span><h1>PPF 产品订购</h1><p>'), 'Legacy split hero markup must not return');

assert(html.includes("onclick=\"openProductCategory('ppf')\""));
assert(html.includes("onclick=\"openProductCategory('color-wrap')\""));
assert(html.includes("onclick=\"openProductCategory('window-film')\""));
assert(html.includes("onclick=\"openProductCategory('yacht-film')\""));
assert(html.includes('/customer.js?v=25'));
assert(html.includes('/customer-ordering.js?v=63'));
assert(ordering.includes("fetch('/retail/wrap-examples.json')"), 'Color-wrap cards must load the vehicle preview library');
assert(ordering.includes('color.vehicleImage'), 'Color-wrap cards must render vehicle previews instead of plain swatch photos');
assert(ordering.includes('function catalogProductName(product)'), 'Live catalog results need locale-aware product names');
assert(ordering.includes("if(catalogLocale()==='zh-CN'||!/[\\u3400-\\u9fff\\uf900-\\ufaff]/.test(name))return name||fallback;"), 'Non-Chinese catalog views must not expose Chinese inventory names');
assert(ordering.includes('esc(catalogProductDetail(product))'), 'Inventory search rows must use localized product details');
assert(html.includes('LIVE DEALER ORDERING'));
assert(!html.includes('Product pricing, payment, and live inventory are not connected yet.'));
assert(i18n.includes('Sign in to use live inventory, dealer pricing, unified checkout, and Stripe secure payment.'));

console.log('Customer ordering navigation tests passed: exclusive screen state, full-card category entry, PPF single-size selection, live status copy, and cache versions.');
