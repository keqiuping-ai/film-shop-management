#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith('--')) continue;
  const value = process.argv[index + 1];
  if (value && !value.startsWith('--')) { args.set(key.slice(2), value); index += 1; }
  else args.set(key.slice(2), true);
}

const root = path.resolve(import.meta.dirname, '..');
const inputPath = path.resolve(root, String(args.get('input') || ''));
const outputPath = path.resolve(root, String(args.get('output') || 'output/google-maps-discovery.json'));
const market = String(args.get('market') || '').trim();
const gl = String(args.get('gl') || 'us').trim().toLowerCase();
const maxNew = Math.max(1, Math.min(30, Number(args.get('max') || 10)));
if (!market || !fs.existsSync(inputPath)) throw new Error('Provide --market and an existing --input seed');

const seed = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const normalize = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const existingNames = new Set((seed.records || []).map(item => normalize(item.businessName)).filter(Boolean));
const relevantPattern = /window tint|tinting|paint protection|\bppf\b|vehicle wrap|car wrap|vinyl wrap|auto detail|car detail|auto glass|car stereo|sign shop|graphic|ceramic coating|automotive|body shop/i;
const closedPattern = /permanently closed|temporarily closed|已永久停业|暂停营业/i;
const queries = [
  `window tinting service ${market}`,
  `paint protection film ${market}`,
  `vehicle wraps ${market}`,
  `auto detailing ceramic coating ${market}`,
  `commercial window tinting ${market}`
];

async function textOf(locator) {
  try { return String(await locator.first().innerText({ timeout:1200 }) || '').trim(); } catch { return ''; }
}

const browser = await chromium.launch({ headless:true, channel:'chrome' });
const context = await browser.newContext({ locale:'en-US', timezoneId:'America/Los_Angeles' });
const searchPage = await context.newPage();
const placeLinks = new Map();

for (const query of queries) {
  const url = `https://www.google.com/maps/search/?api=1&hl=en&gl=${gl}&query=${encodeURIComponent(query)}`;
  await searchPage.goto(url, { waitUntil:'domcontentloaded', timeout:30000 });
  await searchPage.waitForTimeout(1800);
  const feed = searchPage.locator('[role="feed"]').first();
  for (let step = 0; step < 7; step += 1) {
    await feed.evaluate(node => node.scrollBy(0, Math.max(900, node.clientHeight * 2))).catch(() => {});
    await searchPage.waitForTimeout(650);
  }
  const links = await searchPage.locator('a[href*="/maps/place/"]').evaluateAll(nodes => nodes.map(node => ({ href:node.href, label:node.getAttribute('aria-label') || '' })));
  links.forEach(item => { if (item.href) placeLinks.set(item.href.split('&')[0], item.label); });
}

const candidates = [];
const placePage = await context.newPage();
for (const [href] of placeLinks) {
  if (candidates.length >= maxNew) break;
  await placePage.goto(href, { waitUntil:'domcontentloaded', timeout:30000 }).catch(() => {});
  await placePage.waitForTimeout(1400);
  const main = placePage.locator('[role="main"]').first();
  const mainText = await textOf(main);
  const businessName = await textOf(placePage.locator('h1').first());
  if (!businessName || existingNames.has(normalize(businessName))) continue;
  const address = (await textOf(placePage.locator('[data-item-id="address"]').first())).replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const hours = await textOf(placePage.locator('[data-item-id="oh"]').first()) || (mainText.split('\n').find(line => /Open|Closed|hours/i.test(line)) || '');
  const phoneLines = (await textOf(placePage.locator('[data-item-id^="phone:tel:"]').first())).split('\n').map(item => item.trim()).filter(item => /\d/.test(item));
  const phone = phoneLines.at(-1) || '';
  const website = await placePage.locator('a[data-item-id="authority"]').first().getAttribute('href').catch(() => '') || '';
  const category = await textOf(placePage.locator('button[jsaction*="category"]').first()) || (mainText.split('\n').slice(0, 12).find(line => relevantPattern.test(line)) || '');
  const hasHours = Boolean(hours) && !/Add hours/i.test(hours);
  const hasPhotos = /See photos|View photos|Photos\b/i.test(mainText);
  const storefrontRisk = /\bmobile\b|service[- ]area/i.test(`${businessName} ${category}`);
  const relevant = relevantPattern.test(`${businessName} ${category} ${mainText.slice(0, 500)}`);
  if (!address || !hasHours || !hasPhotos || storefrontRisk || !relevant || closedPattern.test(mainText)) continue;
  const coords = placePage.url().match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const rating = Number(mainText.split('\n').find(line => /^\d(?:\.\d)?$/.test(line)) || 0);
  const reviewsText = mainText.split('\n').find(line => /[\d,]+\s*(reviews?|ratings?)/i.test(line)) || '';
  const reviewCount = Number((reviewsText.match(/[\d,]+/)?.[0] || '0').replace(/,/g, ''));
  candidates.push({
    businessName, address, phone, website, googleMapsUrl:placePage.url(), googleBusinessCategory:category,
    googleBusinessHours:hours, googleHasBusinessHours:true, googleHasBusinessPhotos:true,
    googleRating:rating, googleReviewCount:reviewCount,
    lat:coords ? Number(coords[1]) : null, lng:coords ? Number(coords[2]) : null,
    discoveredAt:new Date().toISOString(), queryMarket:market
  });
  existingNames.add(normalize(businessName));
  process.stdout.write(`${candidates.length}/${maxNew} ${businessName} | ${address}\n`);
}

await searchPage.close();
await placePage.close();
await context.close();
await browser.close();
fs.mkdirSync(path.dirname(outputPath), { recursive:true });
fs.writeFileSync(outputPath, JSON.stringify({ market, input:path.relative(root, inputPath), generatedAt:new Date().toISOString(), candidates }, null, 2) + '\n');
console.log(JSON.stringify({ output:outputPath, candidates:candidates.length }, null, 2));
