'use strict';

// Only fixed, public question-bank wording enters this cache. Candidate voices,
// answers, names, translations and interviewer follow-ups must never enter it.
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const SPEECH_PROFILE = Object.freeze({
  model:'gpt-4o-mini-tts', voice:'onyx', response_format:'mp3',
  instructions:'Use a natural, warm, professional male voice in clear American English as an AI interview assistant. Read the supplied question exactly, without adding questions or promises.'
});
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const DISK_ENTRIES = 256;
const DISK_BYTES = 64 * 1024 * 1024;
const DISK_AGE_MS = 30 * 86400000;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const cacheKeyFor = text => digest(JSON.stringify([SPEECH_PROFILE.model, SPEECH_PROFILE.voice, SPEECH_PROFILE.response_format, SPEECH_PROFILE.instructions, text]));
function invalid() { return Object.assign(new Error('AI 语音缓存数据无效'), { code:'INTERVIEW_VOICE_PROVIDER_INVALID', statusCode:502 }); }
function rateLimit() { return Object.assign(new Error('题库语音正在准备，请稍后再试'), { code:'INTERVIEW_VOICE_RATE_LIMIT', statusCode:429 }); }
function queueTimeout() { return Object.assign(new Error('题库语音准备等待超时，请稍后重试'), { code:'INTERVIEW_VOICE_PROVIDER_TIMEOUT', statusCode:504 }); }
function validateAudio(value) {
  if (value?.mimeType !== 'audio/mpeg' || typeof value.audioBase64 !== 'string' || !value.audioBase64 || value.audioBase64.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4
      || value.audioBase64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.audioBase64)) throw invalid();
  const bytes = Buffer.from(value.audioBase64, 'base64');
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES || bytes.toString('base64') !== value.audioBase64) throw invalid();
  return bytes;
}

function createRecruitingSpeechCache({ cacheDir = '', generate, maxEntries = 128, maxBytes = 16 * 1024 * 1024,
  concurrency = 2, maxQueue = 12, maxGenerationsPerMinute = 30, maxQueueWaitMs = 10000 } = {}) {
  const entries = new Map(), pending = new Map(), queue = [];
  let bytesUsed = 0, running = 0, generations = [], directoryReady, diskWrites = Promise.resolve();
  const directory = typeof cacheDir === 'string' && cacheDir ? path.resolve(cacheDir) : '';
  function remember(key, result) {
    const previous = entries.get(key);
    if (previous) bytesUsed -= previous.audioBase64.length;
    entries.delete(key); entries.set(key, result); bytesUsed += result.audioBase64.length;
    while (entries.size > maxEntries || bytesUsed > maxBytes) {
      const oldest = entries.keys().next().value;
      bytesUsed -= entries.get(oldest).audioBase64.length; entries.delete(oldest);
    }
    return result;
  }
  function resultFor(key, audio) {
    const bytes = validateAudio(audio);
    return Object.freeze({ audioBase64:audio.audioBase64, mimeType:'audio/mpeg', audioKey:`${key}:${digest(bytes)}`, voiceName:SPEECH_PROFILE.voice });
  }
  async function pruneDisk() {
    if (!directory) return;
    const now = Date.now(), files = [];
    for (const name of await fs.readdir(directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const filename = path.join(directory, name);
      try {
        const stat = await fs.lstat(filename);
        if (!stat.isFile()) continue;
        if (now - stat.mtimeMs > DISK_AGE_MS) { await fs.unlink(filename); continue; }
        files.push({ filename, size:stat.size, modified:stat.mtimeMs });
      } catch {}
    }
    files.sort((a, b) => b.modified - a.modified);
    let keptBytes = 0;
    for (let index = 0; index < files.length; index++) {
      keptBytes += files[index].size;
      if (index >= DISK_ENTRIES || keptBytes > DISK_BYTES) { try { await fs.unlink(files[index].filename); } catch {} }
    }
  }
  async function readyDirectory() {
    if (!directory) return false;
    directoryReady ||= fs.mkdir(directory, { recursive:true, mode:0o700 }).then(pruneDisk).then(() => true).catch(() => false);
    return directoryReady;
  }
  async function readDisk(key) {
    if (!(await readyDirectory())) return null;
    try {
      const filename = path.join(directory, `${key}.json`), stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.size > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 1024 || Date.now() - stat.mtimeMs > DISK_AGE_MS) return null;
      const record = JSON.parse(await fs.readFile(filename, 'utf8'));
      if (record.version !== 1 || record.key !== key) return null;
      const result = resultFor(key, record);
      if (record.audioKey !== result.audioKey) return null;
      return result;
    } catch { return null; }
  }
  async function writeDisk(key, result) {
    if (!(await readyDirectory())) return;
    // Serialize small cache writes and cleanup; never touch application db.json.
    diskWrites = diskWrites.then(async () => {
      const filename = path.join(directory, `${key}.json`), temporary = path.join(directory, `${key}.${crypto.randomBytes(8).toString('hex')}.tmp`);
      try {
        await fs.writeFile(temporary, JSON.stringify({ version:1, key, audioKey:result.audioKey, audioBase64:result.audioBase64, mimeType:result.mimeType }), { flag:'wx', mode:0o600 });
        await fs.rename(temporary, filename); await pruneDisk();
      } finally { try { await fs.unlink(temporary); } catch {} }
    }).catch(() => {});
    await diskWrites;
  }
  function runNext() {
    while (running < concurrency && queue.length) {
      const job = queue.shift(); running++;
      clearTimeout(job.timer);
      Promise.resolve().then(job.work).then(job.resolve, job.reject).finally(() => { running--; runNext(); });
    }
  }
  function schedule(work) {
    if (running >= concurrency && queue.length >= maxQueue) return Promise.reject(rateLimit());
    return new Promise((resolve, reject) => {
      const job = { work, resolve, reject };
      job.timer = setTimeout(() => {
        const index = queue.indexOf(job);
        if (index !== -1) { queue.splice(index, 1); reject(queueTimeout()); }
      }, maxQueueWaitMs);
      queue.push(job); runNext();
    });
  }
  async function prepare(text) {
    if (typeof text !== 'string' || !text || text !== text.trim() || text.length > 2000 || /\p{Script=Han}/u.test(text)) throw invalid();
    const key = cacheKeyFor(text), existing = entries.get(key);
    if (existing) return remember(key, existing);
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= concurrency + maxQueue) throw rateLimit();
    const work = (async () => {
      const saved = await readDisk(key);
      if (saved) return remember(key, saved);
      return schedule(async () => {
        const now = Date.now(); generations = generations.filter(time => time > now - 60000);
        if (generations.length >= maxGenerationsPerMinute) throw rateLimit();
        generations.push(now);
        const result = resultFor(key, await generate({ text }));
        remember(key, result); await writeDisk(key, result); return result;
      });
    })();
    pending.set(key, work);
    try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
  }
  return { prepare };
}

module.exports = { createRecruitingSpeechCache, SPEECH_PROFILE, cacheKeyFor };
