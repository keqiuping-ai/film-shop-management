'use strict';

// In-flight provider calls may still hold an object that was just consolidated.
const detachedRecords = new WeakMap();

// Never compare only the last ten digits of an international number.
function phoneKey(value) {
  const raw = String(value || '').trim();
  if (!raw || /(?:ext\.?|分机|#|\bx\s*\d)/i.test(raw)) return '';
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) digits = digits.slice(2);
  if (/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `1${digits}`;
  if (/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return digits;
  if ((raw.startsWith('+') || raw.startsWith('00')) && /^[2-9]\d{7,14}$/.test(digits)) return digits;
  return '';
}
function identities(item = {}) {
  const externalId = String(item.externalId || '').trim();
  const psid = String(item.metaPsid || item.psid || externalId.match(/^meta-(?:messenger|instagram|psid):(.+)$/i)?.[1] || '').trim();
  const direct = { source: item.source || '', externalId, externalBusinessId: item.externalBusinessId || '', metaPsid: psid,
    metaPlatform: item.metaPlatform || (/instagram/i.test(item.source || externalId) ? 'instagram' : 'facebook') };
  const rows = [...(item.customerChannelIdentities || []), direct].filter(row => row.externalId || row.metaPsid);
  return [...new Map(rows.map(row => [JSON.stringify([row.source, row.externalId, row.externalBusinessId, row.metaPsid, row.metaPlatform]), row])).values()];
}
function yelpIdentity(item) { return identities(item).filter(row => /yelp/i.test(row.source) && row.externalId).at(-1); }
function placeholderName(value) { return !String(value || '').trim() || /^(meta customer|facebook user|instagram user|unknown|未命名客户)$/i.test(String(value).trim()); }
function preserveIdentity(existing, incoming, next) {
  next.id = existing.id || next.id;
  next.customerChannelIdentities = identities({ customerChannelIdentities: [...identities(existing), ...identities(incoming)] });
  if (placeholderName(incoming.customer) && !placeholderName(existing.customer)) next.customer = existing.customer;
  next.customerVehicles = [...new Set([...(existing.customerVehicles?.length ? existing.customerVehicles : [existing.vehicle]), ...(incoming.customerVehicles?.length ? incoming.customerVehicles : [incoming.vehicle])].filter(Boolean))];
  // Keep the current editable vehicle; earlier vehicles remain separately visible.
  if (!incoming.vehicle) next.vehicle = existing.vehicle || ''; 
  // A lead-ad form must never replace the PSID/page needed to reply to a chat.
  const metaRows = next.customerChannelIdentities.filter(row => row.metaPsid);
  const latestMeta = (next.conversationMessages || []).filter(row => /^meta-/.test(row.provider || '')).at(-1);
  const peer = latestMeta?.direction === 'outbound' ? latestMeta.to : latestMeta?.from;
  const page = latestMeta?.direction === 'outbound' ? latestMeta.from : latestMeta?.to;
  const meta = metaRows.find(row => row.metaPsid === peer && row.externalBusinessId === page) || metaRows.at(-1);
  if (meta) Object.assign(next, { source: meta.source, metaPsid: meta.metaPsid, metaPlatform: meta.metaPlatform, externalBusinessId: meta.externalBusinessId, externalId: meta.externalId || `meta-${meta.metaPlatform === 'instagram' ? 'instagram' : 'messenger'}:${meta.metaPsid}` });
  next.deletedCustomerMessageIds = [...new Set([...(existing.deletedCustomerMessageIds || []), ...(incoming.deletedCustomerMessageIds || [])])];
  if (next.conversationMessages) next.conversationMessages = next.conversationMessages.filter(row => !next.deletedCustomerMessageIds.includes(String(row.id)));
  next.customerMessageTranslations = { ...existing.customerMessageTranslations, ...incoming.customerMessageTranslations };
  next.mergedDuplicateIds = [...new Set([...(existing.mergedDuplicateIds || []), ...(incoming.mergedDuplicateIds || [])])];
  for (const field of ['createdAt', 'importedAt']) next[field] = [existing[field], incoming[field]].filter(Boolean).sort()[0] || next[field];
  for (const field of ['callNote', 'note', 'chatContext']) {
    const values = [existing[field], incoming[field]].filter(Boolean);
    next[field] = [...new Set(values)].filter((value, i, all) => !all.some((other, j) => j !== i && other.includes(value))).join('\n\n');
  }
  if (existing.service && incoming.service === 'tint' && existing.service !== 'tint') next.service = existing.service;
  // Import defaults must not reset an appointment, assignment or follow-up.
  for (const field of ['ownerId', 'ownerName', 'branchId', 'appointmentDate', 'appointmentTime', 'followUpDate', 'followUpTime', 'followUpReason', 'convertedJobId', 'promotedProspectId']) {
    if (existing[field]) next[field] = existing[field];
  }
  const progress = ['新意向', '已邀约', '已预约', '已到店', '已转施工单'];
  if (progress.includes(incoming.status) && progress.indexOf(existing.status) > progress.indexOf(incoming.status)) next.status = existing.status;
  return next;
}
function resolveId(db, value) {
  let id = String(value || '');
  const seen = new Set();
  while (db.customerConversationAliases?.[id] && !seen.has(id)) { seen.add(id); id = db.customerConversationAliases[id]; }
  return id;
}
function reconcile(db, { merge, enrich }) {
  for (const source of detachedRecords.get(db) || []) {
    const target = (db.customerConversations || []).find(row => row.id === resolveId(db, source.id));
    if (target && target !== source) target.conversationMessages = merge(target, { conversationMessages: source.conversationMessages }).conversationMessages;
  }
  const groups = new Map();
  for (const item of db.customerConversations || []) {
    if (!item.phone) enrich(db, item);
    const key = phoneKey(item.phone);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  let count = 0;
  const removed = new Set();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Stable earliest ID; prefer a record already tied to an appointment.
    group.sort((a,b) => Number(Boolean(b.promotedProspectId)) - Number(Boolean(a.promotedProspectId)) || String(a.createdAt || a.importedAt || a.id).localeCompare(String(b.createdAt || b.importedAt || b.id)));
    const target = group[0];
    db.customerConversationMergeArchive ||= [];
    db.customerConversationAliases ||= {};
    for (const source of group.slice(1)) {
      const at = new Date().toISOString();
      db.customerConversationMergeArchive.push({ at, targetId: target.id, original: JSON.parse(JSON.stringify(source)), survivorBefore: JSON.parse(JSON.stringify(target)) });
      const next = merge(target, source);
      next.mergedDuplicateIds = [...new Set([...(next.mergedDuplicateIds || []), source.id])];
      Object.assign(target, next);
      db.customerConversationAliases[source.id] = target.id;
      if (db.customerPhoneIdentityVersion) {
        if (!detachedRecords.has(db)) detachedRecords.set(db, []);
        detachedRecords.get(db).push(source);
      }
      removed.add(source.id); count++;
    }
  }
  // Appointment records remain separate business records, but share the customer's messages.
  for (const prospect of db.prospects || []) {
    const parent = (db.customerConversations || []).find(row => row.id === resolveId(db, prospect.promotedFromConversationId));
    if (!parent || removed.has(parent.id)) continue;
    const joined = merge(parent, prospect);
    parent.deletedCustomerMessageIds = joined.deletedCustomerMessageIds;
    prospect.deletedCustomerMessageIds = joined.deletedCustomerMessageIds;
    parent.conversationMessages = joined.conversationMessages;

    parent.customerChannelIdentities = joined.customerChannelIdentities;
    prospect.customerChannelIdentities = joined.customerChannelIdentities;
    if (joined.metaPsid) for (const key of ['metaPsid', 'metaPlatform', 'externalBusinessId', 'externalId', 'source']) {
      parent[key] = joined[key]; prospect[key] = joined[key];
    }
  }
  for (const prospect of db.prospects || []) {
    const parent = (db.customerConversations || []).find(row => row.id === resolveId(db, prospect.promotedFromConversationId));
    if (parent && !removed.has(parent.id)) prospect.conversationMessages = parent.conversationMessages;
  }
  if (!count) return 0;
  db.customerConversations = db.customerConversations.filter(row => !removed.has(row.id));
  // Rewrite explicit customer references, never historical audits or arbitrary strings.
  for (const [collection, rows] of Object.entries(db)) {
    if (!Array.isArray(rows) || /audit|log|archive|backup/i.test(collection)) continue;
    for (const row of rows) {
      for (const field of ['promotedFromConversationId', 'sourceConversationId', 'customerConversationId']) {
        if (removed.has(row[field])) row[field] = resolveId(db, row[field]);
      }
      if (row.collection === 'customerConversations' || row.customerCollection === 'customerConversations') {
        for (const field of ['recordId', 'customerId']) if (removed.has(row[field])) row[field] = resolveId(db, row[field]);
      }
    }
  }
  return count;
}
module.exports = { phoneKey, identities, yelpIdentity, preserveIdentity, resolveId, reconcile };
