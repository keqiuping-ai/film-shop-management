const assert=require('node:assert/strict');
const links=require('../public/retail-links');
const original='https://example.test/retail/index.html#invite/abc_DEF-123';
for(const [key,,,route] of links.destinations){
 const url=links.withTarget(original,key);
 assert.deepEqual(links.parseInvite(new URL(url).hash),{token:'abc_DEF-123',route});
 assert.equal(links.parseInvite(new URL(links.withTarget(url,'tint')).hash).token,'abc_DEF-123');
}
assert.equal(links.parseInvite('#invite/old_token').route,'home');
assert.equal(links.parseInvite('#invite/token?target=unknown').route,'home');
assert.equal(links.parseInvite('#invite/token?target=https://evil.test'),null);
console.log('PASS: seven destinations, token preserved on switching, legacy links, invalid targets');
