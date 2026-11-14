const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

assert.match(serverSource, /PUBLIC_WEBSITE_HOSTS \|\| 'quadfilmus\.com,www\.quadfilmus\.com'/);
assert.match(serverSource, /isPublicWebsiteHost\(req\) && \(url\.pathname === '\/' \|\| url\.pathname === '\/index\.html'\)/);
assert.match(serverSource, /publicWebsiteHome \? '\/customer\.html' : \(url\.pathname === '\/' \? '\/index\.html'/);
assert.match(serverSource, /req\.headers\['x-forwarded-host'\]/);

console.log('Public website domain routing source checks passed.');
