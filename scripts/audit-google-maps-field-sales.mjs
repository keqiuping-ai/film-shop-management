#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith('--')) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith('--')) {
    args.set(key.slice(2), next);
    index += 1;
  } else {
    args.set(key.slice(2), true);
  }
}

const root = path.resolve(import.meta.dirname, '..');
const inputPath = path.resolve(root, args.get('input') || 'migrations/santa-monica-field-sales-2026-10-13.json');
const outputPath = path.resolve(root, args.get('output') || 'output/google-maps-la-audit.json');
const limit = Math.max(0, Number(args.get('limit') || 0));
const start = Math.max(0, Number(args.get('start') || 0));
const concurrency = Math.min(3, Math.max(1, Number(args.get('concurrency') || 2)));
const headless = args.get('headed') !== true;

const seed = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const records = (seed.records || []).slice(start, limit ? start + limit : undefined);
fs.mkdirSync(path.dirname(outputPath), { recursive:true });

let existing = [];
if (fs.existsSync(outputPath)) {
  try { existing = JSON.parse(fs.readFileSync(outputPath, 'utf8')).results || []; } catch {}
}
const resultsById = new Map(existing.map(item => [String(item.publicRecordId), item]));

const normalize = value => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(first level|parking structure|suite|ste|unit|building|floor|fl)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function addressMatches(expected, actual) {
  const a = normalize(expected);
  const b = normalize(actual);
  if (!a || !b) return false;
  const expectedNumber = a.match(/\b\d{2,6}\b/)?.[0] || '';
  const actualNumber = b.match(/\b\d{2,6}\b/)?.[0] || '';
  if (expectedNumber && actualNumber && expectedNumber !== actualNumber) return false;
  const ignored = new Set(['the','of','and','ca','california','united','states','usa','road','rd','street','st','avenue','ave','boulevard','blvd','drive','dr','lane','ln','way','court','ct']);
  const expectedTokens = new Set(a.split(' ').filter(token => token.length > 2 && !ignored.has(token) && token !== expectedNumber));
  const actualTokens = new Set(b.split(' ').filter(token => token.length > 2 && !ignored.has(token) && token !== actualNumber));
  const shared = [...expectedTokens].filter(token => actualTokens.has(token)).length;
  return shared >= Math.min(2, Math.max(1, expectedTokens.size));
}

const relevantPattern = /window tint|tinting|paint protection|\bppf\b|vehicle wrap|car wrap|vinyl wrap|auto detail|car detail|auto glass|car stereo|sign shop|graphic|ceramic coating|automotive|body shop|玻璃膜|贴膜|车身膜|汽车美容/i;
const closedPattern = /permanently closed|temporarily closed|已永久停业|暂停营业/i;

async function textOf(locator) {
  try { return String(await locator.first().innerText({ timeout:1200 }) || '').trim(); } catch { return ''; }
}

async function auditRecord(page, source) {
  const query = `${source.businessName}, ${source.address}`;
  const searchUrl = `https://www.google.com/maps/search/?api=1&hl=en&gl=us&query=${encodeURIComponent(query)}`;
  const startedAt = new Date().toISOString();
  try {
    await page.goto(searchUrl, { waitUntil:'domcontentloaded', timeout:25000 });
    await page.waitForTimeout(1700);
    await page.locator('h1').first().waitFor({ state:'visible', timeout:8000 }).catch(() => {});
    const resolvedUrl = page.url();
    const main = page.locator('[role="main"]').first();
    const mainText = await textOf(main);
    const businessName = await textOf(page.locator('h1').first());
    const address = (await textOf(page.locator('[data-item-id="address"]').first())
      || (mainText.match(/\n(\d{2,6}[^\n]+(?:CA|California)\s+\d{5})\n/i)?.[1] || ''))
      .replace(/^[^\p{L}\p{N}]+/u, '').trim();
    const hoursText = await textOf(page.locator('[data-item-id="oh"]').first())
      || (mainText.split('\n').find(line => /Open|Closed|hours|营业/.test(line)) || '');
    const phone = await textOf(page.locator('[data-item-id^="phone:tel:"]').first());
    const website = await page.locator('a[data-item-id="authority"]').first().getAttribute('href').catch(() => '') || '';
    const category = await textOf(page.locator('button[jsaction*="category"]').first())
      || (mainText.split('\n').slice(0, 12).find(line => relevantPattern.test(line)) || '');
    const ariaLabels = await main.locator('[aria-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label') || '')).catch(() => []);
    const photosText = [...mainText.split('\n'), ...ariaLabels].find(line => /[\d,]+\s*(photos?|张照片)/i.test(line)) || '';
    const photoCount = Number((photosText.match(/[\d,]+/)?.[0] || '0').replace(/,/g, ''));
    const reviewsText = [...mainText.split('\n'), ...ariaLabels].find(line => /[\d,]+\s*(reviews?|条评价)/i.test(line)) || '';
    const reviewCount = Number((reviewsText.match(/[\d,]+/)?.[0] || '0').replace(/,/g, ''));
    const rating = Number(mainText.split('\n').find(line => /^\d(?:\.\d)?$/.test(line)) || 0);
    const resolvedPlace = Boolean(businessName && address);
    const permanentlyClosed = closedPattern.test(mainText);
    const hasHours = Boolean(hoursText) && !/Add hours/i.test(hoursText);
    const hasPhotos = photoCount > 0 || /See photos|View photos|查看照片|Photos\b/i.test(mainText);
    const matchingAddress = addressMatches(source.address, address);
    const relevantBusiness = relevantPattern.test(`${businessName} ${category} ${mainText.slice(0, 500)}`);
    const storefrontRisk = /\bmobile\b|service[- ]area/i.test(`${businessName} ${category}`);
    const status = resolvedPlace && !permanentlyClosed && hasHours && hasPhotos && matchingAddress && relevantBusiness && !storefrontRisk
      ? 'confirmed'
      : permanentlyClosed || (resolvedPlace && (!matchingAddress || !relevantBusiness))
        ? 'rejected'
        : 'needs_review';
    const reasons = [];
    if (!resolvedPlace) reasons.push('Google Maps did not resolve to one business place');
    if (permanentlyClosed) reasons.push('Google marks this business closed');
    if (!matchingAddress) reasons.push('Google address does not match the imported address');
    if (!hasHours) reasons.push('No Google business hours found');
    if (!hasPhotos) reasons.push('No Google business photos found');
    if (!relevantBusiness) reasons.push('Google category does not show a relevant film/automotive business');
    if (storefrontRisk) reasons.push('Mobile/service-area business; storefront not established');
    return {
      publicRecordId:source.publicRecordId,
      importedBusinessName:source.businessName,
      importedAddress:source.address,
      status,
      googleBusinessName:businessName,
      googleAddress:address,
      googleCategory:category,
      googleHoursText:hoursText,
      googlePhone:phone,
      googleWebsite:website,
      googlePhotoCount:photoCount,
      googleReviewCount:reviewCount,
      googleRating:rating,
      googleMapsUrl:resolvedUrl,
      addressMatches:matchingAddress,
      hasBusinessHours:hasHours,
      hasBusinessPhotos:hasPhotos,
      relevantBusiness,
      storefrontRisk,
      permanentlyClosed,
      reasons,
      checkedAt:startedAt
    };
  } catch (error) {
    return {
      publicRecordId:source.publicRecordId,
      importedBusinessName:source.businessName,
      importedAddress:source.address,
      status:'needs_review',
      reasons:[`Google Maps check failed: ${String(error?.message || error).slice(0, 300)}`],
      checkedAt:startedAt
    };
  }
}

function writeProgress() {
  const results = [...resultsById.values()].sort((a, b) => String(a.publicRecordId).localeCompare(String(b.publicRecordId), undefined, { numeric:true }));
  const counts = results.reduce((summary, item) => {
    summary[item.status] = (summary[item.status] || 0) + 1;
    return summary;
  }, {});
  fs.writeFileSync(outputPath, JSON.stringify({
    source:path.relative(root, inputPath),
    generatedAt:new Date().toISOString(),
    totalSeedRecords:(seed.records || []).length,
    auditedRecords:results.length,
    counts,
    results
  }, null, 2) + '\n');
}

const browser = await chromium.launch({ headless, channel:'chrome' });
const context = await browser.newContext({ locale:'en-US', timezoneId:'America/Los_Angeles' });
let cursor = 0;
const workers = Array.from({ length:concurrency }, async (_, workerIndex) => {
  const page = await context.newPage();
  while (cursor < records.length) {
    const index = cursor++;
    const record = records[index];
    if (resultsById.has(String(record.publicRecordId)) && !args.get('force')) continue;
    const result = await auditRecord(page, record);
    resultsById.set(String(record.publicRecordId), result);
    writeProgress();
    process.stdout.write(`${String(start + index + 1).padStart(3, '0')}/${seed.records.length} W${workerIndex + 1} ${record.publicRecordId} ${result.status} ${result.googleBusinessName || ''}\n`);
  }
  await page.close();
});

await Promise.all(workers);
writeProgress();
await context.close();
await browser.close();
const finalAudit = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
console.log(JSON.stringify({ output:outputPath, audited:finalAudit.auditedRecords, counts:finalAudit.counts }, null, 2));
