'use strict';

const assert = require('node:assert/strict');
const { INTERVIEW_KITS, INTERVIEW_KIT_MAP } = require('../lib/recruiting-interview-kits');
const { normalizeInterviewScorecard } = require('../lib/recruiting');

const expected = {
  installer_quick_6:6, installer_full_18:18,
  wholesale_quick_6:6, wholesale_full_18:18,
  dealer_quick_8:8, dealer_full_16:16,
  remote_quick_6:6, remote_full_12:12
};

assert.equal(INTERVIEW_KITS.length, 8);
assert.deepEqual(Object.fromEntries(INTERVIEW_KITS.map(kit => [kit.id, kit.questions.length])), expected);
assert.equal(new Set(INTERVIEW_KITS.map(kit => kit.id)).size, INTERVIEW_KITS.length);

for (const kit of INTERVIEW_KITS) {
  assert.equal(INTERVIEW_KIT_MAP.get(kit.id), kit);
  assert.equal(new Set(kit.questions.map(question => question.id)).size, kit.questions.length, `${kit.id}: duplicate question id`);
  for (const question of kit.questions) {
    for (const field of ['id', 'zh', 'en', 'focus', 'strong']) assert.ok(String(question[field] || '').trim(), `${kit.id}.${question.id}.${field}`);
  }
}

for (const role of ['installer', 'wholesale', 'dealer', 'remote']) {
  const quick = INTERVIEW_KITS.find(kit => kit.role === role && kit.size === 'quick');
  const full = INTERVIEW_KITS.find(kit => kit.role === role && kit.size === 'full');
  assert.ok(quick && full);
  const fullIds = new Set(full.questions.map(question => question.id));
  assert.ok(quick.questions.every(question => fullIds.has(question.id)), `${role}: quick questions must be a full-kit subset`);
}

const actor = { id:'synthetic-owner', name:'Synthetic Owner' };
const kit = INTERVIEW_KIT_MAP.get('dealer_quick_8');
const scorecard = normalizeInterviewScorecard({
  templateId:kit.id,
  scores:Object.fromEntries(kit.questions.map((question, index) => [question.id, index === 0 ? 9 : null])),
  notes:{ [kit.questions[0].id]:'Specific synthetic evidence.' },
  overallNote:'Invite to the next round.'
}, actor);
assert.equal(scorecard.templateId, kit.id);
assert.equal(scorecard.scores[kit.questions[0].id], 9);
assert.equal(scorecard.notes[kit.questions[0].id], 'Specific synthetic evidence.');
assert.equal(Object.keys(scorecard.scores).length, 8);
assert.throws(() => normalizeInterviewScorecard({ templateId:'unknown', scores:{}, notes:{}, overallNote:'' }, actor), error => error.code === 'INTERVIEW_KIT_INVALID');
assert.throws(() => normalizeInterviewScorecard({ templateId:kit.id, scores:{ [kit.questions[0].id]:11 }, notes:{}, overallNote:'' }, actor), error => error.code === 'INTERVIEW_SCORE_INVALID');
assert.throws(() => normalizeInterviewScorecard({ templateId:kit.id, scores:{ unknown:8 }, notes:{}, overallNote:'' }, actor), /不支持这些字段/);

console.log('Recruiting interview kits: 8 templates, exact counts, subset integrity and score validation passed.');
