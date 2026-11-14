const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/customer.html'), 'utf8');
const landing = html.slice(html.indexOf('<section id="landing"'), html.indexOf('<section id="orderCenter"'));
const decode = value => value
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const sources = [...new Set([...landing.matchAll(/>([^<>]+)</g)]
  .map(match => decode(match[1]))
  .filter(text => text && !/^\d+$/.test(text) && text !== '×' && text !== '✉'))];
const languages = { vi: 'vi', 'pt-BR': 'pt', th: 'th', ms: 'ms', hi: 'hi' };

const protect = text => text
  .replace(/QUAD FILM|QUaD Film|QUaD/g, 'QUADFILM')
  .replace(/Paint Protection Film/g, 'PPFPROTECTIONFILM');
const restore = text => text
  .replace(/QUADFILM/g, 'QUAD FILM')
  .replace(/PPFPROTECTIONFILM/g, 'Paint Protection Film');

async function translate(text, target, attempt = 1) {
  const query = new URLSearchParams({ client: 'gtx', sl: 'en', tl: target, dt: 't', q: protect(text) });
  const response = await fetch(`https://translate.googleapis.com/translate_a/single?${query}`);
  if (!response.ok) {
    if (attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, attempt * 750));
      return translate(text, target, attempt + 1);
    }
    throw new Error(`Translation failed (${response.status}) for ${target}: ${text}`);
  }
  const payload = await response.json();
  return restore(payload[0].map(part => part[0]).join(''));
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

(async () => {
  const translations = {};
  for (const [locale, target] of Object.entries(languages)) {
    const values = await mapLimit(sources, 6, source => translate(source, target));
    translations[locale] = Object.fromEntries(sources.map((source, index) => [source, values[index]]));
  }
  const output = `window.QuadHomepageTranslations = ${JSON.stringify(translations, null, 2)};\n`;
  fs.writeFileSync(path.join(root, 'public/customer-i18n-homepage.js'), output);
  console.log(`Generated ${sources.length} homepage strings in ${Object.keys(languages).length} languages.`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
