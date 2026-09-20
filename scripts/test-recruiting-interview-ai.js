'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecruitingInterviewAnalyzer, normalize } = require('../lib/recruiting-interview-ai');

const input = () => ({ candidate:{ position:'B2B sales', notes:'Internal recruiter note, not candidate wording.' }, interview:{},
  transcript:[{ id:'answer-1', speaker:'candidate', text:'I called three dealerships and won one trial order.', source:'openai_audio', turnId:'turn-1', questionId:'first-week', questionText:'How did you win your first trial order?' }], mode:'final' });
const config = { apiKey:'synthetic-test-only', model:'gpt-5-mini', baseUrl:'https://provider.example.invalid/v1' };
const response = value => ({ choices:[{ finish_reason:'stop', message:{ content:JSON.stringify(value) } }] });

test('analysis keeps question/answer attribution, full answer and evidence guardrails', async () => {
  const value = input(); value.transcript[0].text += ` ${'detail '.repeat(700)}END_OF_ANSWER`;
  let sent;
  const analyze = createRecruitingInterviewAnalyzer({ getConfig:() => config, requestJson:async (_url, options) => {
    sent = JSON.parse(options.body);
    return response({ summary:'基于回答的分析', scores:{ salesAbility:7 }, questionReviews:[
      { turnId:'turn-1', question:'How did you win your first trial order?', answerSummary:'回答摘要', evidence:['one trial order'], strengths:['试单'], openQuestions:['订单金额待核实'], score:7 },
      { turnId:'invented-turn', score:10 }
    ] });
  } });
  const result = await analyze(value), source = JSON.parse(sent.messages[1].content);
  assert.equal(source.transcript[0].text, value.transcript[0].text);
  assert.equal(source.transcript[0].questionText, value.transcript[0].questionText);
  assert.equal(source.transcript[0].source, 'openai_audio');
  assert.equal(source.transcript[0].turnId, 'turn-1');
  assert.equal(source.notes, value.candidate.notes);
  assert.equal(sent.store, false);
  assert.match(sent.messages[0].content, /questions spoken by AI or an interviewer are not answers/);
  assert.match(sent.messages[0].content, /not fluency or accent/);
  assert.match(sent.messages[0].content, /Simplified Chinese/);
  assert.equal(result.questionReviews.length, 1);
  assert.equal(result.questionReviews[0].turnId, 'turn-1');
  assert.equal(result.scores.technicalSkill, null);
});

test('interviewer and AI question text alone cannot produce a candidate assessment', async () => {
  let calls = 0;
  const analyze = createRecruitingInterviewAnalyzer({ getConfig:() => config, requestJson:async () => { calls++; return response({}); } });
  for (const speaker of ['interviewer','ai','']) {
    await assert.rejects(analyze({ ...input(), transcript:[{ speaker, text:'I have ten years of sales experience.' }] }), { code:'INTERVIEW_TRANSCRIPT_REQUIRED' });
  }
  assert.equal(calls, 0);
});

test('legacy candidate answers remain usable but fabricated per-question reviews are dropped', async () => {
  const analyze = createRecruitingInterviewAnalyzer({ getConfig:() => config, requestJson:async () => response({ summary:'Legacy evidence', questionReviews:[{ turnId:'made-up', score:8 }] }) });
  const result = await analyze({ ...input(), transcript:[{ speaker:'candidate', text:'I sell to dealerships.' }] });
  assert.equal(result.summary, 'Legacy evidence');
  assert.deepEqual(result.questionReviews, []);
});

test('per-question scores are normalized and cannot refer to unknown turn IDs', () => {
  const result = normalize({ questionReviews:[{ turnId:'one', evidence:['a'], strengths:['b'], openQuestions:['c'], score:11 }, { turnId:'two', score:5 }] }, new Set(['one']));
  assert.equal(result.questionReviews.length, 1);
  assert.equal(result.questionReviews[0].score, null);
  assert.deepEqual(result.questionReviews[0].evidence, ['a']);
  assert.equal(result.scores.roleFit, null);
});

test('incomplete, refused and invalid provider analysis is not adopted', async () => {
  for (const result of [
    { choices:[{ finish_reason:'length', message:{ content:'{"summary":"partial"}' } }] },
    { choices:[{ finish_reason:'stop', message:{ refusal:'refused', content:'{}' } }] },
    response(null), response([]), { choices:[{ message:{ content:'invalid json' } }] }
  ]) {
    const analyze = createRecruitingInterviewAnalyzer({ getConfig:() => config, requestJson:async () => result });
    await assert.rejects(analyze(input()), { code:'INTERVIEW_AI_FAILED' });
  }
});

test('provider failure details and credentials do not escape to the browser', async () => {
  const analyze = createRecruitingInterviewAnalyzer({ getConfig:() => config, requestJson:async () => { throw new Error('secret-and-candidate-private-data'); } });
  await assert.rejects(analyze(input()), error => error.code === 'INTERVIEW_AI_FAILED' && !error.message.includes('private-data'));
});

test('later/custom configured text models retain their reasoning defaults', async () => {
  let sent;
  const analyze = createRecruitingInterviewAnalyzer({ getConfig:() => ({ ...config, model:'gpt-5.6' }), requestJson:async (_url, options) => { sent = JSON.parse(options.body); return response({}); } });
  await analyze(input());
  assert.equal(Object.hasOwn(sent, 'reasoning_effort'), false);
});

test('Chinese and mixed-language answers remain original evidence in analysis', async () => {
  let sent;
  const analyze = createRecruitingInterviewAnalyzer({ getConfig:() => config, requestJson:async (_url, options) => {
    sent = JSON.parse(options.body); return response({ summary:'原话分析' });
  } });
  const text = '我第一周拜访了三家 dealerships，并拿到一个试单。';
  await analyze({ ...input(), transcript:[{ speaker:'candidate', text, source:'openai_auto_audio', language:'mixed' }] });
  assert.equal(JSON.parse(sent.messages[1].content).transcript[0].text, text);
  assert.match(sent.messages[0].content, /original language \(Chinese, English or mixed\)/);
  assert.doesNotMatch(sent.messages[0].content, /original English|supporting English text/);
});

test('long interviews retain their earliest evidence rather than taking the last 160 rows', async () => {
  let sent;
  const analyze = createRecruitingInterviewAnalyzer({ getConfig:() => config, requestJson:async (_url, options) => {
    sent = JSON.parse(options.body); return response({});
  } });
  const transcript = Array.from({ length:400 }, (_, index) => ({ id:`answer-${index}`, speaker:'candidate', text:`Original evidence ${index}` }));
  await analyze({ ...input(), transcript });
  const source = JSON.parse(sent.messages[1].content);
  assert.equal(source.transcript.length, 400);
  assert.equal(source.transcript[0].text, 'Original evidence 0');
  assert.equal(source.transcript[399].text, 'Original evidence 399');
});

test('oversized complete evidence fails visibly without silently truncating or calling a provider', async () => {
  let calls = 0;
  const analyze = createRecruitingInterviewAnalyzer({ getConfig:() => config, requestJson:async () => { calls++; return response({}); } });
  await assert.rejects(analyze({ ...input(), transcript:[{ speaker:'candidate', text:'x'.repeat(200001) }] }), { code:'INTERVIEW_ANALYSIS_TOO_LARGE' });
  await assert.rejects(analyze({ ...input(), transcript:Array.from({length:2001}, () => ({ speaker:'candidate', text:'Evidence' })) }), { code:'INTERVIEW_ANALYSIS_TOO_LARGE' });
  assert.equal(calls, 0);
});
