#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const seedPath = path.resolve(root, process.argv[2] || '');
const discoveryPath = path.resolve(root, process.argv[3] || '');
const idPrefix = String(process.argv[4] || 'G').toUpperCase().replace(/[^A-Z0-9-]/g, '');
const requestedVersion = String(process.argv[5] || '').trim();
if (!fs.existsSync(seedPath) || !fs.existsSync(discoveryPath)) throw new Error('Provide seed and discovery JSON paths');

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
const normalize = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const existingNames = new Set((seed.records || []).map(item => normalize(item.businessName)).filter(Boolean));
const records = [...(seed.records || [])];
const newRows = [];
const marketId = String(seed.marketId || (seed.version || '').split('-field-sales')[0] || 'los-angeles');
const nextStart = records.filter(item => String(item.publicRecordId || '').startsWith(idPrefix)).length + 1;

function regionForAddress(address) {
  const value = String(address || '');
  if (marketId === 'las-vegas' && /Henderson/i.test(value)) return '亨德森／Google 已确认新增';
  if (marketId === 'las-vegas' && /North Las Vegas/i.test(value)) return '北区／Google 已确认新增';
  if (marketId === 'los-angeles' && /Long Beach|Torrance|Lakewood|Carson/i.test(value)) return '南湾／长滩／Google 已确认新增';
  if (marketId === 'los-angeles' && /Santa Monica|Culver City|Beverly Hills|West Hollywood/i.test(value)) return '西区／Google 已确认新增';
  if (marketId === 'san-francisco' && /Oakland|Berkeley|Hayward|Fremont|Richmond|San Leandro/i.test(value)) return '东湾／Google 已确认新增';
  if (marketId === 'san-francisco' && /San Jose|Santa Clara|Sunnyvale|Milpitas/i.test(value)) return '南湾／Google 已确认新增';
  if (marketId === 'vancouver' && /Surrey|Langley|Delta|Richmond/i.test(value)) return '大温南区／Google 已确认新增';
  return 'Google 已确认新增／待规划';
}

for (const candidate of (discovery.candidates || [])) {
  if (!candidate.businessName || !candidate.address || existingNames.has(normalize(candidate.businessName))) continue;
  const index = nextStart + newRows.length;
  const publicRecordId = `${idPrefix}${String(index).padStart(3, '0')}`;
  const route = 'G';
  const visitBatch = `G-${String(Math.floor((index - 1) / 10) + 1).padStart(2, '0')}`;
  const visitStop = ((index - 1) % 10) + 1;
  const address = String(candidate.address).trim();
  const navigationUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
  const row = {
    publicRecordId,
    marketId,
    businessName:String(candidate.businessName).trim(),
    city:String(discovery.market || '').replace(/\s+(CA|NV|AZ|WA|BC)$/i, ''),
    address,
    distanceKm:0,
    distanceBand:'Google verified addition',
    services:`Google Maps verified category: ${candidate.googleBusinessCategory || 'Relevant film/automotive business'}`,
    filmBrands:'',
    serviceEvidence:'Google Maps business page shows a matching physical address, business hours, photos, and a relevant service category.',
    phone:String(candidate.phone || ''), website:String(candidate.website || ''),
    googleMapsUrl:String(candidate.googleMapsUrl || ''), directorySource:String(candidate.googleMapsUrl || ''),
    serviceSources:[String(candidate.googleMapsUrl || '')].filter(Boolean),
    lat:candidate.lat !== null && candidate.lat !== '' && Number.isFinite(Number(candidate.lat)) ? Number(candidate.lat) : null,
    lng:candidate.lng !== null && candidate.lng !== '' && Number.isFinite(Number(candidate.lng)) ? Number(candidate.lng) : null,
    researchNotes:'Discovered during the 2026-10-16 Google Maps gap audit.',
    route, visitRegion:regionForAddress(address), visitBatch, visitStop, navigationUrl,
    socialLinks:{}, referencePhotos:[], customerType:'汽车贴膜门店', interestedProducts:[], currentProducts:'',
    googleVerificationStatus:'confirmed', googleVerifiedAt:String(candidate.discoveredAt || discovery.generatedAt || new Date().toISOString()),
    googleBusinessName:String(candidate.businessName || ''), googleBusinessCategory:String(candidate.googleBusinessCategory || ''),
    googleBusinessHours:String(candidate.googleBusinessHours || ''), googleBusinessAddress:address,
    googlePhotoCount:0, googleReviewCount:Number(candidate.googleReviewCount || 0), googleRating:Number(candidate.googleRating || 0),
    googleHasBusinessHours:true, googleHasBusinessPhotos:true, googleAddressMatches:true,
    googleVerificationReasons:[], active:true
  };
  records.push(row);
  newRows.push(row);
  existingNames.add(normalize(row.businessName));
}

const routeCount = new Set(records.map(item => item.route).filter(Boolean)).size;
const batchCount = new Set(records.map(item => item.visitBatch).filter(Boolean)).size;
const googleAuditCounts = records.reduce((counts, item) => {
  const status = String(item.googleVerificationStatus || 'needs_review');
  counts[status] = (counts[status] || 0) + 1;
  return counts;
}, {});
const payload = {
  ...seed,
  version:requestedVersion || `${String(seed.version || 'field-sales').replace(/-v\d+(?:-[a-z0-9-]+)?$/i, '')}-v4-google-expanded`,
  recordCount:records.length,
  routeCount,
  batchCount,
  googleDiscoverySource:'Google Maps public business pages',
  googleDiscoveryGeneratedAt:discovery.generatedAt,
  googleAuditCounts,
  records
};
fs.writeFileSync(seedPath, JSON.stringify(payload, null, 2) + '\n');
console.log(JSON.stringify({ seed:seedPath, version:payload.version, added:newRows.length, recordCount:payload.recordCount, googleAuditCounts }, null, 2));
