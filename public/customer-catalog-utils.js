(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QuadCatalogUtils = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function normalize(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s\u00a0]+/g, '').replace(/[\u00d7x]/g, '*').replace(/[\uff5c]/g, '|');
  }

  function availableQty(product) {
    return Object.values(product?.stockByWarehouse || {}).reduce((sum, qty) => sum + Math.max(0, Number(qty || 0)), 0);
  }

  function productText(product) {
    return [product?.category, product?.sku, product?.model, product?.name, product?.specification, product?.description].map(value => String(value || '')).join(' ');
  }

  function isKind(product, kind) {
    const category = String(product?.category || '').toLowerCase();
    const text = productText(product).toLowerCase();
    const compact = normalize(text);
    const isEighteenMeter = /(?:1\.52\*)?18m\b/i.test(compact) || /1\.52米\*?18米/i.test(compact);
    if (kind === 'window-film') return /window|tint|\u7a97\u819c|\u9694\u70ed\u819c|\u6c7d\u8f66\u819c|\u592a\u9633\u819c/i.test(text);
    if (kind === 'color-wrap') {
      if (/color\s*chang|\u6539\u8272\u819c|color\s*wrap|vinyl\s*wrap/i.test(text)) return true;
      return /car\s*wrap\s*film/i.test(category) && isEighteenMeter;
    }
    if (kind === 'ppf') {
      if (/tpu\u8f66\u8863|\u8f66\u8863|\u6f06\u9762\u4fdd\u62a4|paint\s*protection|\bppf\b/i.test(text)) return true;
      return /car\s*wrap\s*film/i.test(category) && !isEighteenMeter;
    }
    return false;
  }

  function isAvailable(product, kind) {
    return Boolean(product && product.purchasable !== false && product.price !== null && Number.isFinite(Number(product.price)) && isKind(product, kind) && availableQty(product) > 0);
  }

  function search(products, query, kind, limit = 10) {
    const needle = normalize(query);
    if (!needle) return [];
    return (products || []).filter(product => isAvailable(product, kind) && [product.sku, product.model, product.name, product.specification]
      .some(value => normalize(value).includes(needle))).slice(0, Math.max(1, Number(limit) || 10));
  }

  function findBySku(products, sku, kind) {
    return (products || []).find(product => product.sku === sku && isAvailable(product, kind)) || null;
  }

  return { normalize, availableQty, isKind, isAvailable, search, findBySku };
});
