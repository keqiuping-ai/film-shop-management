const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const customerHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'customer.html'), 'utf8');
const robots = fs.readFileSync(path.join(__dirname, '..', 'public', 'robots.txt'), 'utf8');
const sitemap = fs.readFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), 'utf8');
const productSlugs = [
  'paint-protection-film',
  'color-wrap-film',
  'automotive-window-film',
  'tesla-panoramic-roof-film',
  'architectural-window-film',
  'interior-surface-film',
  'yacht-protection-film'
];

assert.match(serverSource, /PUBLIC_WEBSITE_HOSTS \|\| 'quadfilmus\.com,www\.quadfilmus\.com'/);
assert.match(serverSource, /isPublicWebsiteHost\(req\) && \(url\.pathname === '\/' \|\| url\.pathname === '\/index\.html'\)/);
assert.match(serverSource, /requestedPathname = publicWebsiteHome \? '\/customer\.html' : \(url\.pathname === '\/' \? '\/index\.html'/);
assert.match(serverSource, /requestedPathname\.endsWith\('\/'\) \? `\$\{requestedPathname\}index\.html`/);
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

for (const slug of productSlugs) {
  const canonical = `https://quadfilmus.com/products/${slug}/`;
  const productHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'products', slug, 'index.html'), 'utf8');
  assert.ok(sitemap.includes(`<loc>${canonical}</loc>`), `${slug} must be listed in the sitemap`);
  assert.ok(customerHtml.includes(`href="/products/${slug}/"`), `${slug} must be linked from the homepage`);
  assert.ok(productHtml.includes(`<link rel="canonical" href="${canonical}">`), `${slug} needs its canonical URL`);
  assert.match(productHtml, /<title>[^<]+ \| QUAD FILM(?: USA)?<\/title>/);
  assert.match(productHtml, /<meta name="description" content="[^" ]/);
  assert.match(productHtml, /<h1>[^<]+<\/h1>/);
  const schemaSource = productHtml.match(/<script type="application\/ld\+json">(.+?)<\/script>/)?.[1];
  assert.ok(schemaSource, `${slug} needs JSON-LD`);
  const schema = JSON.parse(schemaSource);
  const schemaTypes = schema['@graph'].map(item => item['@type']);
  assert.deepEqual(schemaTypes, ['Product', 'BreadcrumbList', 'FAQPage']);
}

console.log('Public website domain routing source checks passed.');
