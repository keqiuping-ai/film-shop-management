'use strict';

// Pure in-memory service tests. No credentials, production data, filesystem
// writes, provider requests, or messages are used by this suite.
const assert = require('node:assert/strict');
const { createRecruitingService, normalizeCandidate } = require('../lib/recruiting');
let checks = 0;
function check(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
const actor = { id:'date-test-owner', name:'Test Owner', view:true, edit:true };
const note = 'Indeed application detail, verified September 17, 2026.';
let clock = Date.parse('2026-09-18T02:00:00.000Z'); // September 17, 7 PM in Los Angeles.

function fixture() {
  const db = { users:[actor], recruitingCandidates:[], recruitingInterviews:[], recruitingAudit:[], recruitingQuarantine:[], customerConversations:[], prospects:[], portalCustomers:[], jobs:[] };
  let writes = 0; let smsCalls = 0;
  const service = createRecruitingService({
    readDb:() => db, writeDb:() => { writes++; },
    canAccess:(user, permission) => Boolean(user && user[permission === 'recruitingView' ? 'view' : 'edit']),
    readBody:async req => req.body, send:(res, status, body) => { res.status = status; res.body = body; },
    sendSms:async () => { smsCalls++; throw new Error('Date tests must never send SMS'); },
    smsConfigured:() => false, publicBaseUrl:() => '', dataDir:'/not-accessed-by-date-tests', notify:() => {}
  });
  async function request(method, pathname, body, user = actor) {
    const response = {};
    assert.equal(await service.handle({ method, body }, response, new URL(pathname, 'http://fixture.invalid'), user), true);
    return response;
  }
  return { db, service, request, stats:() => ({ writes, smsCalls }) };
}

async function create(body = {}) {
  const f = fixture();
  const response = await f.request('POST', '/api/recruiting/candidates', { name:'Date Test Applicant', ...body });
  return { ...f, response, candidate:response.body.candidate };
}

async function main() {
  const sourceNow = Date.now;
  Date.now = () => clock;
  try {
    const unknown = await create({ notes:'Applied on September 1 according to an unverified comment.' });
    check(unknown.response.status, 201, 'application date is optional');
    check(unknown.candidate.appliedAt, '', 'unknown date stays empty despite notes');
    check(unknown.candidate.applicationDateNote, '', 'new records have an empty source note');
    check(unknown.candidate.createdAt, new Date(clock).toISOString(), 'createdAt is the server instant, not application date');
    check(unknown.stats(), { writes:1, smsCalls:0 }, 'creating dates never sends messages');

    for (const [value, expected] of [
      ['', ''], ['2026-09-17', '2026-09-17'], ['2024-02-29', '2024-02-29'],
      ['2026-09-18T01:00:00Z', '2026-09-18T01:00:00.000Z'],
      ['2026-09-18T02:00:00.000Z', '2026-09-18T02:00:00.000Z'],
      ['2026-09-17T20:30:15.1Z', '2026-09-17T20:30:15.100Z'],
      ['2026-09-17T20:30:15.12Z', '2026-09-17T20:30:15.120Z'],
      ['2026-09-17T20:30:15.123Z', '2026-09-17T20:30:15.123Z']
    ]) {
      const f = await create({ appliedAt:value, applicationDateNote:note });
      check(f.response.status, 201, `valid application date ${value}`);
      check(f.candidate.appliedAt, expected, 'preserve date-only and canonicalize precise UTC');
      check(f.candidate.applicationDateNote, note, 'source note retained');
    }

    const invalid = [
      null, 20260917, true, [], {}, ' ', '2026-9-17', '09/17/2026',
      '2026-02-29', '2024-02-30', '2026-04-31', '2026-00-12', '2026-13-01',
      '2026-09-00', '2026-09-32', '2026-09-17 ', ' 2026-09-17',
      '2026-09-17T11:00', '2026-09-17T11:00:00', '2026-09-17T11:00:00-07:00',
      '2026-09-17T18:00:00+00:00', '2026-09-17t18:00:00z', '2026-09-17T24:00:00Z',
      '2026-09-17T23:60:00Z', '2026-09-17T23:59:60Z', '2026-02-29T18:00:00Z',
      '2026-09-17T18:00:00.1234Z', '2026-09-17T18:00:00Z ignored'
    ];
    for (const appliedAt of invalid) {
      const f = await create({ appliedAt, applicationDateNote:note });
      check(f.response.status, 400, `invalid date ${JSON.stringify(appliedAt)}`);
      check(f.response.body.code, 'APPLICATION_DATE_INVALID', 'invalid date error code');
      check(f.stats(), { writes:0, smsCalls:0 }, 'invalid dates have no effects');
      check(f.db.recruitingCandidates.length, 0, 'invalid candidate not inserted');
    }

    for (const appliedAt of ['2026-09-18', '2099-01-01', '2026-09-18T02:00:00.001Z', '2026-09-18T03:00:00Z']) {
      const f = await create({ appliedAt, applicationDateNote:note });
      check(f.response.status, 400, 'future LA date or exact instant rejected');
      check(f.response.body.code, 'APPLICATION_DATE_FUTURE', 'future date error code');
      check(f.stats(), { writes:0, smsCalls:0 }, 'future date rejection has no effects');
    }
    for (const applicationDateNote of [undefined, '', '  \n ']) {
      const body = { appliedAt:'2026-09-17' };
      if (applicationDateNote !== undefined) body.applicationDateNote = applicationDateNote;
      const f = await create(body);
      check(f.response.body.code, 'APPLICATION_DATE_SOURCE_REQUIRED', 'verified source is required for nonempty date');
      check(f.stats().writes, 0, 'missing source cannot save');
    }
    for (const applicationDateNote of [null, false, 42, [], {}, 'n'.repeat(1001)]) {
      const f = await create({ appliedAt:'2026-09-17', applicationDateNote });
      check(f.response.status, 400, 'invalid source type or length rejected');
      check(f.stats().writes, 0, 'invalid source cannot save');
    }
    check((await create({ appliedAt:'2026-09-17', applicationDateNote:'n'.repeat(1000) })).response.status, 201, 'source max 1000 accepted');
    check((await create({ appliedAt:'', applicationDateNote:'Source is still being verified.' })).response.status, 201, 'unknown date may retain provenance investigation note');

    const edit = await create({ appliedAt:'2026-09-16T12:34:56.123Z', applicationDateNote:note, phone:'+15005550009', smsConsent:true, smsConsentNote:'Synthetic explicit test consent', resumeText:'Untouched resume', notes:'Original follow-up notes' });
    const id = edit.candidate.id;
    const endpoint = `/api/recruiting/candidates/${id}`;
    const createdAt = edit.candidate.createdAt;
    clock += 60000;
    const unrelated = await edit.request('PATCH', endpoint, { notes:'Updated follow-up notes' });
    check(unrelated.body.candidate.appliedAt, '2026-09-16T12:34:56.123Z', 'omitted date preserves exact instant');
    check(unrelated.body.candidate.applicationDateNote, note, 'omitted source preserved');
    check(unrelated.body.candidate.createdAt, createdAt, 'PATCH does not change original createdAt');
    check(unrelated.body.candidate.updatedAt, new Date(clock).toISOString(), 'PATCH uses server updatedAt');
    const before = JSON.stringify(edit.db);
    const rejectedSource = await edit.request('PATCH', endpoint, { applicationDateNote:'' });
    check(rejectedSource.body.code, 'APPLICATION_DATE_SOURCE_REQUIRED', 'cannot clear provenance while retaining known date');
    check(JSON.stringify(edit.db), before, 'rejected PATCH preserves every field and audit');
    const redate = await edit.request('PATCH', endpoint, { appliedAt:'2026-09-15' });
    check(redate.body.candidate.appliedAt, '2026-09-15', 'date can change while retaining provided source note');
    check(redate.body.candidate.smsConsent, true, 'application date does not change consent');
    check(redate.body.candidate.smsConsentNote, 'Synthetic explicit test consent', 'application date preserves consent evidence');
    check(redate.body.candidate.resumeText, 'Untouched resume', 'date edit preserves source resume');
    check(redate.body.candidate.messages, [], 'date edit creates no messages');
    const cleared = await edit.request('PATCH', endpoint, { appliedAt:'', applicationDateNote:'' });
    check(cleared.body.candidate.appliedAt, '', 'explicit empty date clears verified date');
    check(cleared.body.candidate.applicationDateNote, '', 'source can be cleared together with date');
    check(cleared.body.candidate.createdAt, createdAt, 'clearing date never changes server createdAt');

    for (const auditField of ['createdAt', 'updatedAt', 'createdByUserId']) {
      const bad = await create({ [auditField]:'1999-01-01T00:00:00Z' });
      check(bad.response.status, 400, 'client cannot set audit field on create');
      const beforePatch = JSON.stringify(edit.db);
      check((await edit.request('PATCH', endpoint, { [auditField]:'1999-01-01T00:00:00Z' })).status, 400, 'client cannot set audit field on patch');
      check(JSON.stringify(edit.db), beforePatch, 'rejected audit update preserves stored record');
    }

    const legacy = fixture();
    legacy.db.recruitingCandidates.push({ id:'legacy-date-test', name:'Legacy Applicant', email:'', phone:'', status:'reviewing', scores:{}, smsConsent:false, smsConsentNote:'', messages:[], notes:'Applied September 1 (unverified)', createdAt:'2026-09-10T10:00:00Z', updatedAt:'2026-09-10T10:00:00Z' });
    const legacyBefore = JSON.stringify(legacy.db);
    const snapshot = await legacy.request('GET', '/api/recruiting');
    check(Object.hasOwn(snapshot.body.candidates[0], 'appliedAt'), false, 'legacy GET does not backfill application date');
    check(Object.hasOwn(snapshot.body.candidates[0], 'applicationDateNote'), false, 'legacy GET does not backfill source');
    check(JSON.stringify(legacy.db), legacyBefore, 'legacy snapshot is unchanged');
    const legacyPatch = await legacy.request('PATCH', '/api/recruiting/candidates/legacy-date-test', { notes:'Still checking source' });
    check(Object.hasOwn(legacyPatch.body.candidate, 'appliedAt'), false, 'unrelated legacy patch does not infer date');
    check(Object.hasOwn(legacyPatch.body.candidate, 'applicationDateNote'), false, 'unrelated legacy patch does not add source');
    check(legacyPatch.body.candidate.createdAt, '2026-09-10T10:00:00Z', 'legacy createdAt preserved verbatim');
    const legacyVerified = await legacy.request('PATCH', '/api/recruiting/candidates/legacy-date-test', { appliedAt:'2026-09-01', applicationDateNote:note });
    check(legacyVerified.status, 200, 'legacy date can be explicitly verified later');
    check(legacyVerified.body.candidate.appliedAt, '2026-09-01', 'explicit legacy source is stored');
    check(legacy.stats().smsCalls, 0, 'legacy updates send nothing');

    for (const user of [null, { ...actor, view:false }, { ...actor, edit:false }]) {
      const f = fixture();
      check((await f.request('POST', '/api/recruiting/candidates', { name:'Denied', appliedAt:'2026-09-17', applicationDateNote:note }, user)).status, 403, 'date writes still require recruiting view and edit permissions');
      check(f.stats().writes, 0, 'unauthorized writes are blocked');
    }

    for (const [instant, currentDate, nextDate] of [
      ['2026-01-02T07:59:59Z', '2026-01-01', '2026-01-02'],
      ['2026-01-02T08:00:00Z', '2026-01-02', '2026-01-03'],
      ['2026-07-02T06:59:59Z', '2026-07-01', '2026-07-02'],
      ['2026-07-02T07:00:00Z', '2026-07-02', '2026-07-03']
    ]) {
      clock = Date.parse(instant);
      const db = fixture().db;
      const normalized = normalizeCandidate(db, { name:'Timezone Applicant', appliedAt:currentDate, applicationDateNote:note }, actor);
      check(normalized.appliedAt, currentDate, 'LA current calendar date accepted across PST/PDT midnight');
      assert.throws(() => normalizeCandidate(db, { name:'Timezone Applicant', appliedAt:nextDate, applicationDateNote:note }, actor), error => error.code === 'APPLICATION_DATE_FUTURE'); checks++;
    }
    console.log(`Recruiting application date tests passed: ${checks} checks; in-memory only, no network or formal data.`);
  } finally { Date.now = sourceNow; }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
