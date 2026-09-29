const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quad-ai-media-rules-'));
const appPort = 48300 + Math.floor(Math.random() * 200);
const aiPort = appPort + 300;
let templateId = '';
let output = '';

async function waitForServer() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`http://127.0.0.1:${appPort}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(output);
}

async function request(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${appPort}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function run() {
  const fakeAi = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const prompt = String(JSON.parse(raw || '{}')?.messages?.[0]?.content || '');
      const content = prompt.includes('one field: chineseReplyText')
        ? { chineseReplyText: '欢迎来店看 PPF 断面样品。\n\n我们的地址：3359 W Oquendo Rd, Las Vegas, NV 89118' }
        : { englishReplyText: 'You are welcome to see our PPF cross-section samples in person.', disposition:'ready_for_review', riskLevel:'low', note:'', followUpReason:'', replyTemplateIds:[templateId, 'invented-id'], includeBranchAddress:true };
      res.writeHead(200, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ choices:[{ message:{ content:JSON.stringify(content) } }] }));
    });
  });
  await new Promise((resolve, reject) => { fakeAi.once('error', reject); fakeAi.listen(aiPort, '127.0.0.1', resolve); });
  const child = spawn(process.execPath, ['server.js'], { cwd:root, env:{ ...process.env, DATA_DIR:dataDir, PORT:String(appPort), HOST:'127.0.0.1', ENABLE_CLOUD_DAILY_BACKUPS:'false', OPENAI_API_KEY:'test-key', OPENAI_API_BASE_URL:`http://127.0.0.1:${aiPort}` }, stdio:['ignore','pipe','pipe'] });
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  try {
    await waitForServer();
    const login = await request('/api/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ email:'admin@filmshop.local', password:'admin123' }) });
    const headers = { Authorization:`Bearer ${login.body.token}`, 'Content-Type':'application/json' };
    const mediaUrl = `http://127.0.0.1:${appPort}/customer-media/test-ppf.jpg`;
    const createdTemplate = await request('/api/replyTemplates', { method:'POST', headers, body:JSON.stringify({ type:'image', category:'ppf', title:'PPF 断面证明', content:'Show the material cross-section.', attachment:{ name:'ppf.jpg', type:'image/jpeg', size:1234, url:mediaUrl } }) });
    assert.equal(createdTemplate.response.status, 200, JSON.stringify(createdTemplate.body));
    templateId = createdTemplate.body.replyTemplates.find(row => row.title === 'PPF 断面证明')?.id || '';
    assert(templateId, 'approved media must be created');

    const existingRules = await request('/api/customer-ai/rules', { headers });
    const playbook = existingRules.body.playbook.map(rule => rule.trigger === 'first' ? { ...rule, autoSelectMedia:true, includeBranchAddress:true, maxImages:2, mediaCategories:['ppf'], mediaInstruction:'PPF customers may receive cross-section proof.' } : rule);
    const savedRules = await request('/api/customer-ai/rules', { method:'PUT', headers, body:JSON.stringify({ knowledgeEntries:existingRules.body.knowledgeEntries, branches:existingRules.body.branches, playbook }) });
    const savedFirst = savedRules.body.playbook.find(rule => rule.trigger === 'first');
    assert.equal(savedFirst.autoSelectMedia, true);
    assert.deepEqual(savedFirst.mediaCategories, ['ppf']);
    assert.equal(savedFirst.maxImages, 2);

    const createdCustomer = await request('/api/customerConversations', { method:'POST', headers, body:JSON.stringify({ date:new Date().toISOString().slice(0,10), customer:'PPF Media Test', phone:'+17025550155', source:'SMS', branchId:'las-vegas', need:'PPF', conversationMessages:[{ id:'inbound-1', speaker:'customer', direction:'inbound', channel:'sms', text:'Can I see the PPF cross section and visit your shop?', timestamp:new Date().toISOString() }] }) });
    const customerId = createdCustomer.body.customerConversations.find(row => row.customer === 'PPF Media Test')?.id;
    const drafted = await request('/api/customer-ai/reply-draft', { method:'POST', headers, body:JSON.stringify({ collection:'customerConversations', id:customerId, channel:'sms' }) });
    assert.equal(drafted.response.status, 200, JSON.stringify(drafted.body));
    assert.deepEqual(drafted.body.draft.replyTemplateIds, [templateId], 'invented media IDs must be rejected');
    assert.equal(drafted.body.draft.attachments.length, 1);
    assert.equal(drafted.body.draft.attachments[0].attachment.url, mediaUrl);
    assert.match(drafted.body.draft.englishText, /3359 W Oquendo Rd/);
    assert.equal(drafted.body.draft.includeBranchAddress, true);
    console.log('Customer AI media rule tests passed.');
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    await new Promise(resolve => fakeAi.close(resolve));
    fs.rmSync(dataDir, { recursive:true, force:true });
  }
}

run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
