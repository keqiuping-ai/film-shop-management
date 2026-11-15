const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const customerHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'customer.html'), 'utf8');
const robots = fs.readFileSync(path.join(__dirname, '..', 'public', 'robots.txt'), 'utf8');
const sitemap = fs.readFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), 'utf8');

assert.match(serverSource, /PUBLIC_WEBSITE_HOSTS \|\| 'quadfilmus\.com,www\.quadfilmus\.com'/);
assert.match(serverSource, /isPublicWebsiteHost\(req\) && \(url\.pathname === '\/' \|\| url\.pathname === '\/index\.html'\)/);
assert.match(serverSource, /publicWebsiteHome \? '\/customer\.html' : \(url\.pathname === '\/' \? '\/index\.html'/);
assert.match(serverSource, /req\.headers\['x-forwarded-host'\]/);
assert.match(serverSource, /deploymentRevision: process\.env\.RAILWAY_GIT_COMMIT_SHA \|\| process\.env\.GIT_COMMIT_SHA \|\| null/);
assert.match(serverSource, /'Accept-Ranges': 'bytes'/);
assert.match(serverSource, /'Cache-Control': 'public, max-age=604800'/);
assert.match(serverSource, /fs\.createReadStream\(filePath, \{ start, end \}\)\.pipe\(res\)/);
assert.match(customerHtml, /<title>Automotive Window Film, PPF &amp; Color Wrap \| QUAD FILM USA<\/title>/);
assert.match(customerHtml, /<meta name="description"/);
assert.match(customerHtml, /<link rel="canonical" href="https:\/\/quadfilmus\.com\/">/);
assert.match(customerHtml, /<script type="application\/ld\+json">/);
assert.match(customerHtml, /3212 Santa Monica Blvd, Santa Monica, CA 90404/);
assert.match(customerHtml, /3359 W Oquendo Rd, Las Vegas, NV 89118/);
assert.match(robots, /Sitemap: https:\/\/quadfilmus\.com\/sitemap\.xml/);
assert.match(sitemap, /<loc>https:\/\/quadfilmus\.com\/<\/loc>/);
assert.match(serverSource, /headers\['X-Robots-Tag'\] = 'noindex, nofollow'/);

console.log('Public website domain routing source checks passed.');
