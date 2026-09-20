(() => {
  'use strict';
  const NOTICE_VERSION = '2026-09-19-voice-v1'; // Legacy manual consent is never a new automatic-recording grant.
  const MAX_RECORDING_MS = 120_000;
  const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
  const MAX_PREPARED_BYTES = 24 * 1024 * 1024;
  const MAX_PREPARED_ENTRIES = 48;
  const PREPARE_TIMEOUT_MS = 40_000;
  const consentCopy = {
    en:{ title:'Choose how to join', notice:'Optional AI assistance: an AI-generated male voice asks English questions. If you agree, the interviewer may manually record selected microphone answers (up to 120 seconds each) and send them to OpenAI for transcription, Chinese translation and job-related evidence analysis. The resulting text is saved in your recruiting record; this app does not store raw audio. OpenAI processes audio under its service data policies. You can choose video only or revoke consent at any time. No recording starts automatically; a person makes the hiring decision.', join:'Agree & join AI-assisted interview', videoOnly:'Join video only (no AI recording)', enable:'Enable optional AI assistance & answer recording', revoke:'Revoke consent / keep video only', active:'Your AI choice is saved. Reconnecting does not start recording.', inactive:'Your video-only choice is saved. Reconnecting does not enable AI recording.' },
    zh:{ title:'选择加入方式', notice:'可选 AI 辅助：AI 生成的男声用英语提问。同意后，面试官可手动录制选定的麦克风回答（每段最多 120 秒），发送给 OpenAI 转写、翻译为中文并整理岗位相关证据。生成的文字保存至招聘档案，本应用不存储原始音频；OpenAI 按其服务数据政策处理音频。你可选择仅视频通话，也可随时撤回同意。不会自动开始录音，招聘决定由人工作出。', join:'同意并加入 AI 辅助面试', videoOnly:'仅视频通话，不启用 AI 录音', enable:'同意启用 AI 辅助与回答录音', revoke:'撤回同意，保留视频通话', active:'已保留你的 AI 选择，重新连接不会开始录音。', inactive:'已保留仅视频通话的选择，重新连接不会启用 AI 录音。' },
    es:{ title:'Elija cómo entrar', notice:'Asistencia de IA opcional: una voz masculina generada por IA hace preguntas en inglés. Si acepta, el entrevistador puede grabar manualmente respuestas seleccionadas de su micrófono (hasta 120 segundos cada una) y enviarlas a OpenAI para transcripción, traducción al chino y análisis de evidencia laboral. El texto se guarda en su expediente; esta aplicación no guarda el audio original. OpenAI procesa el audio según sus políticas de datos. Puede elegir solo video o retirar su consentimiento en cualquier momento. Ninguna grabación comienza automáticamente; una persona decide la contratación.', join:'Aceptar y entrar con asistencia de IA', videoOnly:'Entrar solo por video (sin grabación de IA)', enable:'Aceptar asistencia de IA y grabación de respuestas', revoke:'Retirar consentimiento / mantener solo video', active:'Su elección de IA está guardada. Reconectar no inicia grabaciones.', inactive:'Su elección de solo video está guardada. Reconectar no activa grabaciones de IA.' },
    pt:{ title:'Escolha como entrar', notice:'Assistência opcional de IA: uma voz masculina gerada por IA faz perguntas em inglês. Se concordar, o entrevistador poderá gravar manualmente respostas selecionadas do seu microfone (até 120 segundos cada) e enviá-las à OpenAI para transcrição, tradução para chinês e análise de evidências profissionais. O texto é salvo no seu registro; este aplicativo não armazena áudio bruto. A OpenAI processa o áudio conforme suas políticas de dados. Você pode escolher apenas vídeo ou retirar o consentimento a qualquer momento. Nenhuma gravação começa automaticamente; uma pessoa decide a contratação.', join:'Concordar e entrar com assistência de IA', videoOnly:'Entrar apenas por vídeo (sem gravação de IA)', enable:'Concordar com IA e gravação de respostas', revoke:'Retirar consentimento / manter apenas vídeo', active:'Sua escolha de IA foi salva. Reconectar não inicia gravações.', inactive:'Sua escolha de apenas vídeo foi salva. Reconectar não ativa gravações de IA.' }
  };
  const consentText = (language, key) => (consentCopy[language] || consentCopy.en)[key] || '';
  const english = text => Boolean(String(text || '').trim()) && !/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(String(text));
  const newId = () => `voice-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const cancelled = () => Object.assign(new Error('Operation cancelled.'), { name:'AbortError' });

  function create(bridge) {
    const $ = bridge.$;
    const ctx = () => bridge.getContext();
    const zh = () => ctx().language === 'zh';
    const text = (en, cn, es, pt) => ({ zh:cn, es:es || en, pt:pt || en })[ctx().language] || en;
    let voice = null, activeRoom = null, generation = 0, requestSequence = 0, appliedSequence = 0;
    let healthy = false, polling = false, timer = null, leaseTimer = null, busy = false;
    let playback = null, capture = null, captureStarting = false, pendingAnswer = null, uploadPromise = null;
    let lastQuestion = null, previewSource = '', previewQuestion = '', previewRevision = 0, followupBusy = false;
    const requests = new Set();
    let statusMessage = '', statusError = false;
    const prepared = new Map(), preparationJobs = new Map(), preparationFailures = new Map();
    let preparationQueue = [], desiredQuestions = [], preparationStopped = false, preparedBytes = 0;
    const preparationWaiters = new Set();

    function audioIdentity(question) { return JSON.stringify([question?.kitId || '', question?.questionId || '', String(question?.text || '').trim()]); }
    function cachedQuestion(question) {
      if (question?.followup) return null;
      const key = audioIdentity(question), item = prepared.get(key);
      if (item) { prepared.delete(key); prepared.set(key, item); }
      return item || null;
    }
    function cacheQuestion(question, data) {
      if (question?.followup || !question?.kitId || !question?.questionId || !data.audioKey || data.voiceName !== 'onyx' || data.mimeType !== 'audio/mpeg' || typeof data.audioBase64 !== 'string' || !data.audioBase64.length || data.audioBase64.length > 8 * 1024 * 1024) return false;
      const key = audioIdentity(question), size = data.audioBase64.length;
      if (prepared.has(key)) preparedBytes -= prepared.get(key).size;
      prepared.delete(key);
      while (prepared.size && (prepared.size >= MAX_PREPARED_ENTRIES || preparedBytes + size > MAX_PREPARED_BYTES)) { const oldest = prepared.keys().next().value; preparedBytes -= prepared.get(oldest).size; prepared.delete(oldest); }
      prepared.set(key, { audioBase64:data.audioBase64, audioKey:data.audioKey, mimeType:data.mimeType, size }); preparedBytes += size;
      return true;
    }
    function renderPreparation() {
      const host = writable(), total = desiredQuestions.length;
      const ready = desiredQuestions.filter(question => prepared.has(audioIdentity(question))).length;
      const failed = desiredQuestions.filter(question => preparationFailures.has(audioIdentity(question))).length;
      const loading = desiredQuestions.some(question => preparationJobs.has(audioIdentity(question))) || preparationQueue.length > 0;
      let status = host && total ? `${text('English male voice', '英语男声', 'Voz masculina en inglés', 'Voz masculina em inglês')} · ${text('Prepared', '已准备', 'Preparadas', 'Preparadas')} ${ready}/${total}` : '';
      if (status && loading) status += text(' · preparing in the background; no playback', ' · 后台准备中，不会自动播音', ' · preparando en segundo plano; sin reproducción', ' · preparando em segundo plano; sem reprodução');
      else if (status && failed) status += text(' · some audio needs retry', ' · 部分语音准备失败，可重试', ' · algunos audios requieren reintento', ' · alguns áudios precisam de nova tentativa');
      for (const id of ['voicePrepareStatus', 'welcomeVoicePrepareStatus']) if ($(id)) $(id).textContent = status;
      if ($('welcomeVoicePrepare')) $('welcomeVoicePrepare').hidden = !host || !total;
      for (const id of ['voicePrepareRetry', 'welcomeVoicePrepareRetry']) if ($(id)) { $(id).hidden = !host || !failed; $(id).disabled = !host || loading; $(id).textContent = text('Retry audio preparation', '重试准备语音', 'Reintentar preparar audio', 'Tentar preparar áudio novamente'); }
    }
    function settlePreparationWaiters() {
      if (preparationQueue.length || preparationJobs.size) return;
      for (const resolve of preparationWaiters) resolve(); preparationWaiters.clear();
    }
    function pumpPreparation() {
      if (preparationStopped || !writable() || !ctx().info?.interviewId) { preparationQueue = []; settlePreparationWaiters(); return; }
      while (preparationJobs.size < 2 && preparationQueue.length) {
        const question = preparationQueue.shift(), key = audioIdentity(question);
        if (prepared.has(key) || preparationJobs.has(key) || preparationFailures.has(key)) continue;
        const controller = new AbortController();
        preparationJobs.set(key, controller);
        const interviewId = ctx().info.interviewId;
        let timeout;
        const deadline = new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error(text('Audio preparation timed out.', '语音准备超时。', 'La preparación de audio agotó el tiempo.', 'O preparo do áudio excedeu o tempo.'))); }, PREPARE_TIMEOUT_MS); });
        void Promise.race([bridge.request(`/api/recruiting/interviews/${encodeURIComponent(interviewId)}/video-speech-prepare`, { method:'POST', auth:true, body:JSON.stringify({ kitId:question.kitId, questionId:question.questionId }), signal:controller.signal }), deadline])
          .then(data => { if (preparationStopped || controller.signal.aborted || ctx().info?.interviewId !== interviewId || !writable()) return; if (!cacheQuestion(question, data)) throw new Error('Prepared audio was not valid.'); preparationFailures.delete(key); })
          .catch(cause => { if (!preparationStopped) preparationFailures.set(key, cause.message || 'Audio preparation failed.'); })
          .finally(() => { clearTimeout(timeout); preparationJobs.delete(key); pumpPreparation(); renderPreparation(); settlePreparationWaiters(); });
      }
      renderPreparation(); settlePreparationWaiters();
    }
    function prepareQuestions() {
      if (preparationStopped || !writable() || !ctx().info?.interviewId) return Promise.resolve();
      const seen = new Set();
      desiredQuestions = (bridge.getSelectedKitQuestions?.() || []).filter(question => { const key = audioIdentity(question); if (!question?.kitId || !question?.questionId || !english(question.text) || seen.has(key)) return false; seen.add(key); return true; }).slice(0, MAX_PREPARED_ENTRIES);
      const selected = audioIdentity(bridge.getSelectedQuestion());
      desiredQuestions.sort((a, b) => Number(audioIdentity(b) === selected) - Number(audioIdentity(a) === selected));
      preparationQueue = desiredQuestions.filter(question => { const key = audioIdentity(question); return !prepared.has(key) && !preparationJobs.has(key) && !preparationFailures.has(key); });
      const complete = new Promise(resolve => preparationWaiters.add(resolve));
      pumpPreparation(); return complete;
    }
    function retryPreparation() { for (const question of desiredQuestions) preparationFailures.delete(audioIdentity(question)); return prepareQuestions(); }
    function dispose() { preparationStopped = true; preparationQueue = []; for (const controller of preparationJobs.values()) controller.abort(); for (const resolve of preparationWaiters) resolve(); preparationWaiters.clear(); prepared.clear(); preparedBytes = 0; void disconnect(); }

    function ownsControl() {
      const c = ctx();
      return Boolean(healthy && activeRoom && c.connected && c.room === activeRoom && voice?.controllerIdentity
        && voice.controllerIdentity === activeRoom.localParticipant.identity && Date.parse(voice.leaseExpiresAt) > Date.now());
    }
    function writable() { const c = ctx(); return Boolean(c.recruiter && c.info?.canWriteTranscript === true); }
    function allowed() { return writable() && ownsControl() && voice?.consent === true && voice?.configured === true && activeRoom.remoteParticipants.has(voice.candidateIdentity); }
    function currentTurn() { return voice?.currentTurn || null; }
    function orphanedTurn() { return ownsControl() && ['preparing', 'ready', 'speaking', 'recording', 'captured', 'transcribing'].includes(currentTurn()?.phase) && !playback && !capture && !captureStarting && !pendingAnswer && !uploadPromise; }
    function isCurrent(capturedRoom, version) { return activeRoom === capturedRoom && ctx().room === capturedRoom && ctx().connected && generation === version; }
    function message(value, failed = false) { statusMessage = value; statusError = failed; render(); }
    function applyState(data, capturedRoom, sequence) {
      if (capturedRoom !== activeRoom || capturedRoom !== ctx().room || !ctx().connected || sequence < appliedSequence) return;
      appliedSequence = sequence;
      const wasOwned = voice?.controllerIdentity === capturedRoom.localParticipant.identity;
      const wasConsented = voice?.consent === true;
      voice = data.voice || voice; healthy = true;
      if ((wasConsented && voice?.consent !== true) || (wasOwned && !ownsControl())) {
        suspend(text('AI activity stopped: consent or control changed. Unsaved audio was discarded.', '同意状态或控制权已变化，AI 活动已停止，未保存录音已丢弃。'), true);
      }
      bridge.onState?.(data);
      render();
    }
    async function api(suffix, body, { publicRoute = false, ignoreGeneration = false } = {}) {
      const c = ctx(), capturedRoom = activeRoom, version = generation, sequence = ++requestSequence;
      if (!capturedRoom || !c.connected || capturedRoom !== c.room) throw cancelled();
      const controller = new AbortController(); requests.add(controller);
      const timeout = setTimeout(() => controller.abort(), suffix === 'video-answer' ? 100_000 : 45_000);
      try {
        const url = publicRoute ? `/api/public/recruiting-video/${suffix}` : `/api/recruiting/interviews/${encodeURIComponent(c.info.interviewId)}/${suffix}`;
        const payload = publicRoute ? { interviewId:c.info.interviewId, sessionSecret:c.sessionSecret, ...body } : { participantSessionId:c.participantSessionId, ...body };
        const data = await bridge.request(url, { method:'POST', auth:!publicRoute, body:JSON.stringify(payload), signal:controller.signal });
        if ((!ignoreGeneration && !isCurrent(capturedRoom, version)) || capturedRoom !== activeRoom || capturedRoom !== ctx().room) throw cancelled();
        applyState(data, capturedRoom, sequence);
        return data;
      } finally { clearTimeout(timeout); requests.delete(controller); }
    }
    function operation(name, extras = {}, options) { return api('video-voice', { operation:name, ...extras }, options); }
    function render() {
      const c = ctx(), host = Boolean(c.recruiter), owner = ownsControl(), ready = allowed();
      $('voiceHostControls').hidden = !host;
      $('voiceCandidateConsent').hidden = host;
      $('voiceDisclosure').textContent = window.QuadInterviewAuto ? text('AI male voice asks only the question you select. Automatic microphone notes have separate consent and pause controls in the video panel.', 'AI 男声只播报你选定的问题；自动麦克风记录在视频区单独显示同意、暂停与状态。', 'La voz masculina de IA lee solo la pregunta elegida. El registro automático tiene controles de consentimiento y pausa en el panel de video.', 'A voz masculina de IA lê apenas a pergunta escolhida. O registro automático tem controles de consentimento e pausa no painel de vídeo.') : text('AI-generated male voice asks English questions in the call. Recording stays optional and manual; preparing question audio does not record anyone.', 'AI 男声在通话中用英语提问。录音始终可选且手动开启；提前准备题目音频不会录制任何人。');
      $('voiceTitle').textContent = text('AI English male voice', 'AI 英语男声', 'Voz masculina de IA en inglés', 'Voz masculina de IA em inglês');
      $('voiceConsentNotice').textContent = consentText(c.language, 'notice');
      $('voiceConsentSave').textContent = consentText(c.language, 'enable');
      $('voiceConsentRevoke').textContent = consentText(c.language, 'revoke');
      $('voiceConsentSave').hidden = voice?.consent === true;
      $('voiceConsentSave').disabled = !c.connected || busy || voice?.consent === true;
      $('voiceConsentRevoke').disabled = !c.connected || busy || voice?.consent !== true;
      $('voiceClaim').textContent = text('Take AI control', '取得 AI 控制权');
      $('voiceRelease').textContent = text('Release control', '释放控制权');
      $('voiceSpeak').textContent = text('Speak selected question in English', '英文播报当前题目');
      $('voiceRepeat').textContent = text('Repeat last question', '重读上一题');
      $('voiceStop').textContent = orphanedTurn() ? text('Reset interrupted AI turn', '清除已中断的 AI 操作') : text('Stop AI voice', '停止 AI 播音');
      $('voiceClaim').disabled = !writable() || !c.connected || !healthy || !voice?.configured || owner || Boolean(voice?.controllerIdentity && Date.parse(voice.leaseExpiresAt) > Date.now()) || busy;
      $('voiceRelease').disabled = !owner || busy;
      const blocked = busy || Boolean(playback || capture || captureStarting || pendingAnswer || uploadPromise);
      $('voiceSpeak').disabled = !ready || blocked || !english(bridge.getSelectedQuestion()?.text);
      if ($('voiceQuestionSpeak')) { $('voiceQuestionSpeak').disabled = $('voiceSpeak').disabled; $('voiceQuestionSpeak').textContent = text('Ask this question aloud in English (AI)', '让 AI 用英语提问'); }
      let blocking = '';
      if (!writable()) blocking = text('Read-only access cannot control AI.', '只读权限不能控制 AI。', 'El acceso de solo lectura no permite controlar la IA.', 'O acesso somente leitura não pode controlar a IA.');
      else if (!c.connected) blocking = text('Join the call to play questions. Audio can prepare beforehand.', '加入通话后可播题，题目音频可提前准备。', 'Entre en la llamada para reproducir preguntas. El audio puede prepararse antes.', 'Entre na chamada para reproduzir perguntas. O áudio pode ser preparado antes.');
      else if (!healthy) blocking = text('Checking room status. If the connection failed, reconnect before continuing.', '正在核实房间状态，连接失败时请重连。', 'Verificando la sala. Si falla la conexión, vuelva a conectarse.', 'Verificando a sala. Se a conexão falhar, reconecte.');
      else if (!voice?.configured) blocking = text('AI voice is not configured.', 'AI 语音尚未配置。', 'La voz de IA no está configurada.', 'A voz de IA não está configurada.');
      else if (!owner) blocking = text('Take AI voice control to speak a question. Automatic notes do not need this control.', '请先取得 AI 播音控制权再播题；自动记录不需要此控制权。', 'Tome el control de voz de IA para leer una pregunta. El registro automático no necesita este control.', 'Assuma o controle de voz de IA para ler uma pergunta. O registro automático não precisa deste controle.');
      else if (!activeRoom?.remoteParticipants.has(voice.candidateIdentity)) blocking = text('Waiting for the candidate to join.', '等待候选人加入通话。', 'Esperando a que entre el candidato.', 'Aguardando a entrada do candidato.');
      else if (voice.consent !== true) blocking = text('Candidate chose video only or has not enabled optional AI. Continue manually, or let the candidate choose Enable AI in their page.', '候选人选择了仅视频，或尚未启用可选 AI。可继续人工面试；候选人也可在其页面自行启用 AI。', 'El candidato eligió solo video o no activó la IA. Continúe manualmente; el candidato puede activar la IA en su página.', 'O candidato escolheu apenas vídeo ou não ativou IA. Continue manualmente; o candidato pode ativar IA na própria página.');
      else if (blocked) blocking = text('Finish or stop the current question / answer first.', '请先完成或停止当前提问／回答。', 'Primero termine o detenga la pregunta / respuesta actual.', 'Primeiro conclua ou pare a pergunta / resposta atual.');
      else if (!english(bridge.getSelectedQuestion()?.text)) blocking = text('Select an English question first.', '请先选择一道英文题目。', 'Seleccione primero una pregunta en inglés.', 'Selecione primeiro uma pergunta em inglês.');
      if ($('voiceBlockingReason')) $('voiceBlockingReason').textContent = host ? blocking : '';
      if ($('voiceQuestionBlockingReason')) $('voiceQuestionBlockingReason').textContent = host ? blocking : '';
      if ($('voiceQuestionSpeak')) $('voiceQuestionSpeak').title = blocking;
      $('voiceRepeat').disabled = !ready || blocked || !lastQuestion;
      $('voiceStop').disabled = !owner || (!playback && !busy && !orphanedTurn());
      $('voiceFollowupLabel').textContent = text('Draft a follow-up (Chinese or English)', '追问草稿（中文或英文）');
      $('voiceFollowupPreviewLabel').textContent = text('Review / edit English preview before speaking', '先核对或编辑英文预览，再确认播报');
      $('voiceTranslateFollowup').textContent = text('Generate English preview', '生成英文预览');
      $('voiceConfirmFollowup').textContent = text('Confirm & speak this English preview', '确认并播报此英文预览');
      $('voiceTranslateFollowup').disabled = !ready || blocked || followupBusy || !$('voiceFollowupDraft').value.trim();
      $('voiceConfirmFollowup').disabled = !ready || blocked || followupBusy || !previewSource || previewSource !== $('voiceFollowupDraft').value || previewQuestion !== questionKey() || !english($('voiceFollowupPreview').value);
      $('voiceRecordStart').textContent = text('Start candidate answer recording', '开始录制候选人回答');
      $('voiceRecordStop').textContent = text('Stop & transcribe answer', '停止并转写回答');
      $('voiceRetryAnswer').textContent = text('Retry saving this answer', '重试保存本段回答');
      $('voiceDiscardAnswer').textContent = text('Discard unsaved audio', '丢弃未保存录音');
      $('voiceRecordStart').disabled = Boolean(window.QuadInterviewAuto) || !ready || blocked || currentTurn()?.phase !== 'waiting' || !candidateMicrophone();
      $('voiceRecordStop').disabled = !capture || Boolean(uploadPromise);
      $('voiceRetryAnswer').hidden = !pendingAnswer || Boolean(uploadPromise) || Boolean(pendingAnswer?.terminalError);
      $('voiceRetryAnswer').disabled = !ready || Boolean(uploadPromise);
      $('voiceDiscardAnswer').hidden = !pendingAnswer;
      $('voiceDiscardAnswer').disabled = Boolean(uploadPromise);
      $('voiceRecordNotice').textContent = text('Manual recording: candidate microphone only, at most 120 seconds. Stop sends the segment for transcription and Chinese translation; it is not a live word-by-word transcript. Do not change questions until this answer is saved or discarded.', '手动录音：仅采集候选人麦克风，每段最多 120 秒。停止后提交转写并生成中文译文，并非实时逐字转写；保存或丢弃本段回答前不要切换问题。');
      const consent = voice?.consent === true ? text('Candidate consent is active.', '候选人已明确同意。') : text('Candidate consent is not active.', '候选人尚未同意或已撤回。');
      const controller = voice?.controllerIdentity ? `${text('Controller', '控制人')}: ${voice.controllerName || voice.controllerIdentity}${owner ? text(' (you)', '（你）') : ''}` : text('No AI controller.', '尚无 AI 控制人。');
      const phaseLabels = { preparing:'正在生成语音', ready:'语音已就绪', speaking:'AI 正在播报', waiting:'等待候选人回答', recording:'正在录音', captured:'录音已停止，待转写', transcribing:'正在转写与翻译', answered:'回答已保存', interrupted:'已停止', error:'处理失败' };
      const phase = capture ? text('RECORDING CANDIDATE ANSWER', '正在录制候选人回答') : playback?.started ? text('AI SPEAKING', 'AI 正在播报') : voice?.recording ? text('CANDIDATE ANSWER RECORDING ACTIVE', '候选人回答录音已启动') : (zh() ? phaseLabels[currentTurn()?.phase] : currentTurn()?.phase) || text('idle', '空闲');
      $('voiceState').textContent = `${!voice?.configured ? text('AI voice unavailable. ', 'AI 语音未配置。') : ''}${consent} ${controller} · ${phase}`;
      $('voiceState').classList.toggle('recording', Boolean(capture || voice?.recording));
      $('voiceCurrentQuestion').textContent = currentTurn()?.questionText ? `${text('Current spoken question', '本次已播问题')}: ${currentTurn().questionText}` : '';
      $('voiceStatus').textContent = statusMessage;
      $('voiceStatus').classList.toggle('error', statusError);
      renderPreparation();
    }
    function questionKey() { const q = bridge.getSelectedQuestion() || {}; return `${q.kitId || ''}:${q.questionId || ''}`; }
    async function poll() {
      if (polling || !activeRoom || !ctx().connected) return;
      polling = true;
      try {
        if (ctx().recruiter) await operation(ownsControl() ? 'heartbeat' : 'status');
        else await api('voice-state', {}, { publicRoute:true });
        sync();
      } catch (cause) {
        if (cause.name !== 'AbortError') suspend(text('AI paused: cannot verify room consent or control. Recheck the connection before continuing.', 'AI 已暂停：无法核实同意状态或控制权。请检查连接后再手动继续。'), false);
      } finally { polling = false; }
    }
    async function connect() {
      await disconnect({ release:false });
      activeRoom = ctx().room; if (!activeRoom || !ctx().connected) return;
      const connectingRoom = activeRoom;
      healthy = false; voice = null; appliedSequence = 0; statusMessage = '';
      await poll();
      if (activeRoom !== connectingRoom || ctx().room !== connectingRoom || !ctx().connected) return;
      timer = setInterval(poll, 5000);
      leaseTimer = setInterval(() => {
        if (voice?.controllerIdentity === activeRoom?.localParticipant.identity && Date.parse(voice.leaseExpiresAt) <= Date.now()) suspend(text('AI control expired. Take control again to continue.', 'AI 控制权已过期，请重新取得控制权后继续。'), true);
        sync();
      }, 1000);
      render();
    }
    async function claim() {
      if (!writable() || !ctx().connected || busy) return;
      busy = true; render();
      try { await operation('claim'); message(window.QuadInterviewAuto ? text('You control AI voice. Click the question to speak; consenting participants are recorded automatically.', '已取得 AI 播音控制权。点题目即可提问；已同意的参与者会自动记录发言。') : text('You control AI voice. Every question and recording still needs a manual click.', '已取得 AI 控制权；每次播题和录音仍需手动点击。')); }
      catch (cause) { message(cause.message, true); }
      finally { busy = false; render(); }
    }
    async function cleanupPlayback(item) {
      if (!item) return;
      item.cancelled = true;
      if (item.source) { item.source.onended = null; try { item.source.stop(); } catch {} try { item.source.disconnect(); } catch {} }
      try { item.monitor?.disconnect(); } catch {}
      try { item.track?.stop(); } catch {}
      for (const track of item.destination?.stream.getTracks() || []) { try { track.stop(); } catch {} }
      if (item.published) { item.published = false; try { await item.room.localParticipant.unpublishTrack(item.track); } catch {} }
      try { await item.context?.close(); } catch {}
    }
    function abortRequests() { for (const controller of requests) controller.abort(); requests.clear(); }
    function discardCapture() {
      const previous = capture; capture = null; captureStarting = false;
      if (!previous) return;
      previous.discarded = true; clearTimeout(previous.timeout);
      try { if (previous.recorder.state !== 'inactive') previous.recorder.stop(); } catch {}
      previous.stream.getTracks().forEach(track => track.stop()); previous.chunks.length = 0;
      previous.finish?.(null);
    }
    function suspend(reason, discardPending = true) {
      generation += 1; healthy = false; busy = false; followupBusy = false; abortRequests();
      const previous = playback; playback = null; void cleanupPlayback(previous);
      discardCapture(); if (discardPending) pendingAnswer = null;
      statusMessage = reason || text('AI activity stopped. Nothing resumes automatically.', 'AI 活动已停止，不会自动恢复。'); statusError = true;
      render();
    }
    async function stop() {
      const hadActivity = Boolean(playback || busy || orphanedTurn());
      const canNotify = ownsControl();
      generation += 1; busy = false; abortRequests();
      const previous = playback; playback = null; await cleanupPlayback(previous);
      if (hadActivity && canNotify && activeRoom === ctx().room && ctx().connected) {
        try { await operation('interrupted', previous?.turnId ? { turnId:previous.turnId } : {}); } catch (cause) { if (cause.name !== 'AbortError') healthy = false; }
      }
      message(text('AI voice stopped. Click a question or Repeat to speak again.', 'AI 播音已停止。需手动点击题目播报或重读后才会继续。'));
    }
    async function release() {
      const canRelease = ownsControl();
      suspend(text('AI control released; unsaved audio discarded.', '已释放 AI 控制权，未保存录音已丢弃。'), true);
      if (canRelease) { try { await operation('release'); } catch (cause) { message(cause.message, true); } }
    }
    async function speak(question) {
      if (!allowed() || busy || playback || capture || captureStarting || pendingAnswer || uploadPromise || !english(question?.text)) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext || !window.LivekitClient?.LocalAudioTrack) return message(text('This browser cannot publish AI audio. No local-only fallback is used.', '此浏览器无法把 AI 音频发布到通话，系统不会退回仅本机播放。'), true);
      const capturedRoom = activeRoom, version = generation;
      const item = { room:capturedRoom, context:null, destination:null, source:null, track:null, published:false, cancelled:false, started:false };
      playback = item; busy = true;
      try {
        // Resume during the user gesture, before waiting for synthesis or publish.
        item.context = new AudioContext(); await item.context.resume();
        if (!isCurrent(capturedRoom, version) || item.cancelled) throw cancelled();
        const cached = cachedQuestion(question);
        message(cached ? text('Prepared male voice: connecting audio to the call…', '男声音频已准备，正在接入通话…', 'Voz masculina preparada: conectando el audio…', 'Voz masculina preparada: conectando o áudio…') : text('Preparing English male voice… first preparation may take longer.', '正在准备英语男声…首次生成可能需要等待。', 'Preparando la voz masculina en inglés… la primera vez puede tardar.', 'Preparando a voz masculina em inglês… a primeira vez pode demorar.'));
        const data = await api('video-speech', { requestId:newId(), text:String(question.text).trim(), questionId:question.questionId || '', kitId:question.kitId || '', ...(question.followup ? { followup:true } : {}), ...(cached ? { preparedAudioKey:cached.audioKey } : {}) });
        const audioBase64 = data.audioPrepared === true && cached?.audioKey === data.audioKey ? cached.audioBase64 : data.audioPrepared ? '' : data.audioBase64;
        if (data.duplicate || !audioBase64) throw new Error(text('This request was already processed or produced no matching audio. Use Repeat for a new playback.', '此请求已处理或未返回匹配音频。如需重新播报，请点击重读。'));
        if (data.audioBase64) cacheQuestion(question, data);
        await operation('status');
        if (!isCurrent(capturedRoom, version) || item.cancelled || !allowed() || currentTurn()?.id !== data.turnId || currentTurn()?.phase !== 'ready') throw cancelled();
        const bytes = Uint8Array.from(atob(audioBase64), char => char.charCodeAt(0));
        const audio = await item.context.decodeAudioData(bytes.buffer);
        if (!isCurrent(capturedRoom, version) || item.cancelled || !allowed()) throw cancelled();
        item.destination = item.context.createMediaStreamDestination();
        item.track = new LivekitClient.LocalAudioTrack(item.destination.stream.getAudioTracks()[0], undefined, true, item.context);
        item.source = item.context.createBufferSource(); item.source.buffer = audio;
        item.source.connect(item.destination);
        item.monitor = item.context.createGain(); item.monitor.gain.value = 1; item.source.connect(item.monitor); item.monitor.connect(item.context.destination);
        // Publication must complete before either remote or local playback starts.
        await capturedRoom.localParticipant.publishTrack(item.track, { name:'quad-ai-question', source:LivekitClient.Track.Source.Unknown });
        item.published = true;
        if (!isCurrent(capturedRoom, version) || item.cancelled || !allowed()) throw cancelled();
        await operation('speaking', { turnId:data.turnId });
        if (!isCurrent(capturedRoom, version) || item.cancelled || !allowed()) throw cancelled();
        lastQuestion = { ...question }; item.turnId = data.turnId;
        item.source.onended = () => {
          if (playback !== item || item.cancelled || !isCurrent(capturedRoom, version)) return;
          playback = null; busy = false;
          void cleanupPlayback(item).then(async () => {
            if (!isCurrent(capturedRoom, version) || !allowed()) return;
            try { await operation('waiting', { turnId:data.turnId }); message(text('Question finished. You may start recording the candidate answer.', '题目播报完毕。可手动开始录制候选人回答。')); }
            catch (cause) { message(cause.message, true); }
          });
        };
        item.started = true; busy = false; item.source.start();
        message(text('AI-generated English question is playing in the call.', 'AI 生成的英文问题正在通话中播报。'));
      } catch (cause) {
        const stillCurrent = playback === item && isCurrent(capturedRoom, version);
        if (playback === item) playback = null;
        await cleanupPlayback(item);
        if (stillCurrent) {
          busy = false;
          try { if (ownsControl()) await operation('interrupted', item.turnId ? { turnId:item.turnId } : {}); } catch {}
          if (cause.name !== 'AbortError') message(cause.message, true);
        }
      } finally { render(); }
    }
    function speakSelected() { return speak(bridge.getSelectedQuestion()); }
    function repeat() { return lastQuestion ? speak({ ...lastQuestion }) : Promise.resolve(); }
    function invalidatePreview() {
      previewRevision += 1; previewSource = ''; previewQuestion = ''; $('voiceFollowupPreview').value = ''; render();
    }
    function selectedQuestionChanged() { invalidatePreview(); void prepareQuestions(); render(); }
    async function translateFollowup() {
      if (!allowed() || followupBusy || playback || capture || pendingAnswer || uploadPromise) return;
      const draft = $('voiceFollowupDraft').value, key = questionKey(), revision = ++previewRevision;
      if (!draft.trim()) return;
      followupBusy = true; previewSource = ''; $('voiceFollowupPreview').value = ''; render();
      try {
        const data = await api('video-followup', { text:draft });
        if (revision !== previewRevision || draft !== $('voiceFollowupDraft').value || key !== questionKey()) return;
        if (!english(data.text)) throw new Error(text('The English preview is empty or invalid. Nothing was spoken.', '英文预览为空或不符合要求，未播报任何内容。'));
        previewSource = draft; previewQuestion = key; $('voiceFollowupPreview').value = data.text;
        message(text('Review the English text, edit if needed, then confirm to speak.', '请核对英文内容，必要时修改，然后明确确认播报。'));
      } catch (cause) { if (cause.name !== 'AbortError') message(cause.message, true); }
      finally { followupBusy = false; render(); }
    }
    function confirmFollowup() {
      if (previewSource !== $('voiceFollowupDraft').value || previewQuestion !== questionKey() || !previewSource || !english($('voiceFollowupPreview').value)) return;
      return speak({ ...bridge.getSelectedQuestion(), text:$('voiceFollowupPreview').value.trim(), followup:true });
    }
    function candidateMicrophone() {
      if (!activeRoom || !voice?.candidateIdentity) return null;
      const participant = activeRoom.remoteParticipants.get(voice.candidateIdentity);
      if (!participant) return null;
      let role = ''; try { role = JSON.parse(participant.metadata || '{}').role; } catch {}
      if (role !== 'candidate') return null;
      const publication = participant.getTrackPublication?.(LivekitClient.Track.Source.Microphone);
      const track = publication?.track;
      if (publication?.source !== LivekitClient.Track.Source.Microphone || publication.isMuted || publication.isSubscribed === false || track?.isMuted || track?.kind !== LivekitClient.Track.Kind.Audio || track.mediaStreamTrack?.readyState !== 'live') return null;
      return { participant, publication, track };
    }
    async function startRecording() {
      if (window.QuadInterviewAuto) return; // Automatic mode records local microphones only; legacy remote capture is disabled.
      if (!allowed() || busy || playback || capture || captureStarting || pendingAnswer || uploadPromise || currentTurn()?.phase !== 'waiting') return;
      const candidate = candidateMicrophone();
      if (!candidate) return message(text('The consenting candidate microphone is not available.', '已同意的候选人麦克风尚不可用。'), true);
      if (!window.MediaRecorder || !window.MediaStream) return message(text('Recording is unavailable in this browser. Use manual notes; no microphone fallback is started.', '此浏览器不支持录音，请使用人工笔记；不会改为录制其他麦克风。'), true);
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(value => MediaRecorder.isTypeSupported?.(value));
      if (!mimeType) return message(text('No supported audio recording format is available.', '此浏览器没有可用的音频录制格式。'), true);
      const version = generation, capturedRoom = activeRoom, turn = { ...currentTurn() };
      let createdStream = null;
      captureStarting = true; render();
      try {
        await operation('recording', { turnId:turn.id, candidateIdentity:candidate.participant.identity });
        if (!isCurrent(capturedRoom, version) || !allowed() || candidateMicrophone()?.track !== candidate.track) throw cancelled();
        const clonedTrack = candidate.track.mediaStreamTrack.clone();
        const stream = new MediaStream([clonedTrack]); createdStream = stream;
        const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond:32000 });
        const item = { room:capturedRoom, version, recorder, stream, originalTrack:candidate.track, candidateIdentity:candidate.participant.identity, turnId:turn.id, requestId:newId(), chunks:[], bytes:0, startedAt:Date.now(), mimeType, discarded:false, finish:null, timeout:null };
        item.done = new Promise(resolve => { item.finish = resolve; });
        recorder.ondataavailable = event => {
          if (item.discarded || !event.data?.size) return;
          item.bytes += event.data.size;
          if (item.bytes > MAX_AUDIO_BYTES) { suspend(text('Audio exceeded the safe upload size; the unsaved segment was discarded.', '音频超过安全上传大小，未保存片段已丢弃。'), true); return; }
          item.chunks.push(event.data);
        };
        recorder.onerror = () => suspend(text('Recording failed; the incomplete segment was discarded. Start a new recording explicitly.', '录音失败，不完整片段已丢弃；需要手动开始新的录音。'), true);
        recorder.onstop = () => {
          clearTimeout(item.timeout); stream.getTracks().forEach(track => track.stop());
          if (capture === item) capture = null;
          const blob = !item.discarded && item.chunks.length ? new Blob(item.chunks, { type:recorder.mimeType || mimeType }) : null;
          item.chunks.length = 0;
          if (blob && isCurrent(capturedRoom, version) && allowed()) pendingAnswer = { blob, turnId:item.turnId, candidateIdentity:item.candidateIdentity, requestId:item.requestId, durationMs:Math.min(MAX_RECORDING_MS, Math.max(1, Date.now() - item.startedAt)), mimeType:blob.type, room:capturedRoom };
          item.finish(pendingAnswer); render();
        };
        capture = item; captureStarting = false;
        recorder.start(500);
        item.timeout = setTimeout(() => { void stopRecording().catch(cause => message(cause.message, true)); }, MAX_RECORDING_MS);
        message(text('Recording only the remote candidate microphone. Stop to transcribe; maximum 120 seconds.', '正在录制远端候选人的麦克风。点击停止后转写，最多 120 秒。'));
      } catch (cause) {
        captureStarting = false;
        createdStream?.getTracks().forEach(track => { try { track.stop(); } catch {} });
        if (isCurrent(capturedRoom, version)) {
          discardCapture();
          try { if (ownsControl()) await operation('interrupted', { turnId:turn.id }); } catch {}
          if (cause.name !== 'AbortError') message(cause.message, true);
        }
      } finally { render(); }
    }
    async function stopRecording() {
      const item = capture;
      if (item) {
        if (item.recorder.state !== 'inactive') item.recorder.stop();
        await item.done;
        if (!pendingAnswer && !item.discarded && ownsControl()) {
          try { await operation('interrupted', { turnId:item.turnId }); } catch {}
          message(text('No answer audio was captured. Nothing was saved; repeat the question and start a new recording.', '没有采集到回答音频，未保存任何内容。请重读问题后重新录音。'), true);
        }
      }
      if (!pendingAnswer) return;
      return retryAnswer();
    }
    async function retryAnswer() {
      if (uploadPromise) return uploadPromise;
      if (!pendingAnswer || !allowed()) throw new Error(text('Answer is not saved. Consent and AI control are required to retry.', '回答尚未保存；重试前需要有效同意和 AI 控制权。'));
      const item = pendingAnswer;
      if (item.terminalError) throw new Error(text('This request cannot be retried. Discard the unsaved audio, repeat the question, then record a fresh answer.', '此请求不能重试。请丢弃未保存音频、重新播题，再录制新的回答。'));
      uploadPromise = (async () => {
        try {
          await operation('status');
          if (pendingAnswer !== item || item.room !== activeRoom || !allowed() || currentTurn()?.id !== item.turnId) throw cancelled();
          if (currentTurn()?.phase === 'recording') await operation('stop-recording', { turnId:item.turnId, candidateIdentity:item.candidateIdentity });
          if (pendingAnswer !== item || !allowed()) throw cancelled();
          message(text('Transcribing and translating this answer… not saved yet.', '正在转写并翻译本段回答…目前尚未保存。'));
          const bytes = new Uint8Array(await item.blob.arrayBuffer());
          let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
          if (pendingAnswer !== item || !allowed()) throw cancelled();
          const data = await api('video-answer', { turnId:item.turnId, requestId:item.requestId, candidateIdentity:item.candidateIdentity, mimeType:item.mimeType, durationMs:item.durationMs, audioBase64:btoa(binary) });
          if (data.requestStatus === 'pending') throw new Error(data.row?.id ? text('The English original is saved, but Chinese processing is still pending. Check status with an explicit retry; do not record this answer again.', '英文原文已保存，但中文处理尚未完成。请手动重试查询状态，不要重复录制该回答。') : text('The answer is still processing. Keep this page open and explicitly retry to check the same request.', '回答仍在处理中，请保持页面打开并手动重试查询同一请求。'));
          if (!data.row?.id && ['failed', 'cancelled'].includes(data.requestStatus)) {
            item.terminalError = true;
            throw new Error(text('Processing ended without a saved answer. Discard this audio, repeat the question and record again; no provider retry will occur.', '处理已终止且没有保存回答。请丢弃这段音频、重新播题并录音；不会重复调用提供方。'));
          }
          if (!data.row?.id) throw new Error(text('No saved answer was confirmed. Keep this page open and explicitly retry; the same request is not duplicated.', '尚未确认回答已保存。请保持页面打开并手动重试，同一请求不会重复处理。'));
          if (pendingAnswer === item) pendingAnswer = null;
          message(data.row.translationZh && !data.row.translationError ? text('Answer transcript and Chinese translation saved. Raw audio was not stored by this app.', '回答原文与中文译文已保存，本应用未存储原始音频。') : text('The English answer was saved, but Chinese translation failed or is still unavailable. Check the original; no translation is claimed complete.', '英文回答已保存，但中文翻译失败或尚不可用。请核对原文；译文尚未完成。'), Boolean(data.row.translationError || !data.row.translationZh));
        } catch (cause) {
          if (pendingAnswer === item) message(`${item.terminalError ? '' : text('Answer processing is not confirmed complete. Audio remains only in this page memory. ', '回答处理尚未确认完成。音频仅留在本页面内存中。')}${cause.message}`, true);
          throw cause;
        } finally { uploadPromise = null; render(); }
      })();
      render(); return uploadPromise;
    }
    async function discardAnswer() {
      if (!pendingAnswer || uploadPromise) return;
      const turnId = pendingAnswer.turnId; pendingAnswer = null;
      try { if (ownsControl()) await operation('interrupted', { turnId }); } catch {}
      message(text('In-memory audio discarded. Any text already saved remains in the record.', '内存中的音频已丢弃；此前已保存的文字仍保留在档案中。'));
    }
    async function setConsent(consent) {
      if (window.QuadInterviewAuto) return; // Current consent belongs to the automatic local-microphone workflow.
      if (ctx().recruiter || !ctx().connected || busy) return;
      busy = true; render();
      try {
        const data = await api('voice-consent', { consent:Boolean(consent), noticeVersion:NOTICE_VERSION }, { publicRoute:true });
        // This is only a wake-up hint. Peers always refetch authoritative consent.
        try { await activeRoom?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type:'voice-state-changed' })), { reliable:true }); } catch {}
        message(consent ? text('Optional consent saved. An interviewer must still start each recording.', '已保存可选同意；每段录音仍须面试官手动开始。') : text('Consent revoked. You remain in the call; no new answer recording is allowed.', '已撤回同意，你仍在通话中，不能再开始新的回答录音。'));
        return data;
      } catch (cause) { message(cause.message, true); }
      finally { busy = false; render(); }
    }
    function sync() {
      if (playback && !activeRoom?.remoteParticipants.has(voice?.candidateIdentity)) suspend(text('The candidate disconnected. AI playback stopped and will not resume automatically.', '候选人已断开，AI 播音已停止，不会自动恢复。'), true);
      if (capture && (!allowed() || candidateMicrophone()?.track !== capture.originalTrack)) suspend(text('Candidate microphone, consent or control changed. Recording stopped and unsaved audio was discarded.', '候选人麦克风、同意状态或控制权已变化。录音已停止，未保存音频已丢弃。'), true);
      render();
    }
    function receiveSignal(payload, participant) {
      if (!participant?.identity || !activeRoom?.remoteParticipants.has(participant.identity)) return;
      try {
        const signal = JSON.parse(new TextDecoder().decode(payload));
        if (signal.type === 'voice-state-changed') void poll();
      } catch {}
    }
    async function beforeAnalyze() {
      if ((voice?.recording && !capture) || (['preparing', 'speaking', 'transcribing'].includes(currentTurn()?.phase) && !playback && !uploadPromise && !pendingAnswer)) throw new Error(text('Another AI question or answer is still active. Its controller must finish or stop it before analysis.', '另一段 AI 提问或回答仍在进行中，请由控制人先完成或停止，再分析。'));
      if (playback || busy) await stop();
      if (capture) await stopRecording();
      else if (uploadPromise) await uploadPromise;
      else if (pendingAnswer) await retryAnswer();
      if (capture || captureStarting || pendingAnswer || uploadPromise) throw new Error(text('Finish saving or discard the current answer before analysis.', '请先保存或丢弃当前回答，再进行分析。'));
    }
    async function disconnect({ release:releaseLease = true } = {}) {
      const previous = activeRoom, c = ctx(), canRelease = previous && voice?.controllerIdentity === previous.localParticipant.identity;
      clearInterval(timer); clearInterval(leaseTimer); timer = null; leaseTimer = null;
      generation += 1; abortRequests(); healthy = false; busy = false; followupBusy = false;
      const oldPlayback = playback; playback = null; discardCapture(); pendingAnswer = null; lastQuestion = null; invalidatePreview();
      activeRoom = null; voice = null; polling = false;
      await cleanupPlayback(oldPlayback);
      if (releaseLease && canRelease && c.info?.interviewId && c.recruiter) {
        const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 1500);
        try { await bridge.request(`/api/recruiting/interviews/${encodeURIComponent(c.info.interviewId)}/video-voice`, { method:'POST', auth:true, body:JSON.stringify({ participantSessionId:c.participantSessionId, operation:'release' }), signal:controller.signal }); } catch {} finally { clearTimeout(timeout); }
      }
      render();
    }
    const bind = (id, handler) => $(id).addEventListener('click', () => { Promise.resolve(handler()).catch(cause => { if (cause.name !== 'AbortError') message(cause.message, true); }); });
    bind('voiceClaim', claim); bind('voiceRelease', release); bind('voiceSpeak', speakSelected); bind('voiceRepeat', repeat); bind('voiceStop', stop);
    bind('voiceTranslateFollowup', translateFollowup); bind('voiceConfirmFollowup', confirmFollowup);
    bind('voiceRecordStart', startRecording); bind('voiceRecordStop', stopRecording); bind('voiceRetryAnswer', retryAnswer); bind('voiceDiscardAnswer', discardAnswer);
    bind('voiceConsentSave', () => setConsent(true)); bind('voiceConsentRevoke', () => setConsent(false));
    for (const id of ['voicePrepareRetry', 'welcomeVoicePrepareRetry']) if ($(id)) bind(id, retryPreparation);
    $('voiceFollowupDraft').addEventListener('input', invalidatePreview); $('voiceFollowupPreview').addEventListener('input', render);
    render();
    return Object.freeze({ connect, disconnect, suspend, sync, render, selectedQuestionChanged, receiveSignal, beforeAnalyze, claim, release, speakSelected, repeat, stop, translateFollowup, confirmFollowup, startRecording, stopRecording, retryAnswer, discardAnswer, setConsent, prepareQuestions, retryPreparation, dispose });
  }
  window.QuadInterviewVoice = Object.freeze({ create, consentText, NOTICE_VERSION });
})();
