#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const seedPath = path.resolve(root, process.argv[2] || 'migrations/santa-monica-field-sales-2026-10-13.json');
const auditPath = path.resolve(root, process.argv[3] || 'output/google-maps-la-audit.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const auditedById = new Map((audit.results || []).map(item => [String(item.publicRecordId), item]));

function cleanPhone(value) {
  const lines = String(value || '').split('\n').map(item => item.trim()).filter(item => /\d/.test(item));
  return lines.at(-1) || '';
}

if (auditedById.size !== (seed.records || []).length) {
  throw new Error(`Expected ${seed.records?.length || 0} audited records, found ${auditedById.size}`);
}

const records = seed.records.map(source => {
  const result = auditedById.get(String(source.publicRecordId));
  if (!result) throw new Error(`Missing Google audit result for ${source.publicRecordId}`);
  const storefrontRisk = result.storefrontRisk === true || /\bmobile\b|service[- ]area/i.test(`${result.googleBusinessName || ''} ${result.googleCategory || ''}`);
  const status = result.status === 'confirmed' && storefrontRisk ? 'needs_review' : result.status;
  const confirmed = status === 'confirmed';
  const reasons = Array.isArray(result.reasons) ? [...result.reasons] : [];
  if (storefrontRisk && !reasons.includes('Mobile/service-area business; storefront not established')) {
    reasons.push('Mobile/service-area business; storefront not established');
  }
  return {
    ...source,
    businessName:confirmed && result.googleBusinessName ? result.googleBusinessName : source.businessName,
    address:confirmed && result.googleAddress ? result.googleAddress : source.address,
    phone:confirmed && cleanPhone(result.googlePhone) ? cleanPhone(result.googlePhone) : source.phone,
    website:confirmed && result.googleWebsite ? result.googleWebsite : source.website,
    googleMapsUrl:result.googleMapsUrl || source.googleMapsUrl,
    googleVerificationStatus:status,
    googleVerifiedAt:result.checkedAt || audit.generatedAt,
    googleBusinessName:result.googleBusinessName || '',
    googleBusinessCategory:result.googleCategory || '',
    googleBusinessHours:result.googleHoursText || '',
    googleBusinessAddress:result.googleAddress || '',
    googlePhotoCount:Number(result.googlePhotoCount || 0),
    googleReviewCount:Number(result.googleReviewCount || 0),
    googleRating:Number(result.googleRating || 0),
    googleHasBusinessHours:result.hasBusinessHours === true,
    googleHasBusinessPhotos:result.hasBusinessPhotos === true,
    googleAddressMatches:result.addressMatches === true,
    googleVerificationReasons:reasons,
    active:confirmed
  };
});

const counts = records.reduce((summary, item) => {
  summary[item.googleVerificationStatus] = (summary[item.googleVerificationStatus] || 0) + 1;
  return summary;
}, {});

const payload = {
  ...seed,
  version:'santa-monica-field-sales-2026-10-16-v3-google-audited',
  googleAuditSource:'Google Maps public business pages',
  googleAuditGeneratedAt:audit.generatedAt,
  googleAuditCounts:counts,
  records
};

fs.writeFileSync(seedPath, JSON.stringify(payload, null, 2) + '\n');
console.log(JSON.stringify({ seed:seedPath, version:payload.version, counts }, null, 2));
