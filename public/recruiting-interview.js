(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const invite = params.get('invite') || '';
  const interviewId = params.get('interview') || '';
  const recruiter = Boolean(interviewId && !invite);
  const authToken = localStorage.getItem('filmShopCloud.token') || '';
  const localeCodes = { en:'en-US', es:'es-US', pt:'pt-BR', zh:'zh-CN' };
  const copy = {
    en:{ secureInterview:'Secure video interview', language:'Language', preparing:'Preparing', videoInterview:'VIDEO INTERVIEW', checkingLink:'Checking your interview link…', cameraCheck:'🎥 Camera', micCheck:'🎙️ Microphone', secureLink:'🔒 One-time secure link', consent:'I understand that this interview uses audio, video, and live transcription to assist with notes. AI scoring is advisory only; a person makes the final decision.', join:'Join video interview', privacy:'No account or app download is required. Your browser asks for camera and microphone access only after you consent. Video is not recorded by default.', waiting:'Waiting for the other participant…', keepOpen:'Keep this page open. Video will appear automatically after they connect.', myVideo:'My video', inProgress:'Interview in progress', connectingRoom:'Connecting to the secure room…', aiBoundary:'AI assistance', aiNotice:'AI may assist with transcription, evidence organization, and a draft score. It does not evaluate appearance, accent, or other protected characteristics.', microphone:'🎙️ Microphone', camera:'🎥 Camera', leave:'End / Leave', liveTranscript:'Live transcript', startTranscript:'Start transcript', stopTranscript:'Stop transcript', transcriptOff:'Transcription is off.', transcriptOn:'Live transcription is on.', transcriptUnavailable:'Live transcription is not supported in this browser. Use current Chrome or Safari.', aiCopilot:'AI interview copilot', suggestQuestions:'Suggest questions', createSummary:'Create summary and score draft', aiReady:'Ready to analyze job-related evidence.', aiWorking:'AI is reviewing saved transcript evidence…', candidateWelcome:'{name}, welcome to your QUAD FILM video interview', recruiterWelcome:'Join the video interview with {name}', minutes:'Estimated {count} minutes', linkValid:'Link ready', reconnect:'Reconnect to interview', recruiterJoin:'Join as interviewer', connecting:'Connecting…', retry:'Try again', unsupported:'This browser does not support secure video calls. Use current Chrome, Safari, or Edge.', connected:'In call', reconnecting:'Reconnecting', joined:'{name} joined', other:'Other participant', micOn:'🎙️ Mute microphone', micOff:'🔇 Turn on microphone', cameraOn:'🎥 Turn off camera', cameraOff:'🚫 Turn on camera', you:'You', candidate:'Candidate', interviewer:'Interviewer', questions:'Suggested follow-up questions', evidence:'Evidence found', openQuestions:'Still needs verification', summary:'Interview summary', resumeDraft:'Resume completion draft (verify before saving)', scores:'Draft evidence scores', noEvidence:'No transcript evidence yet.', aiFailed:'AI analysis could not be completed. The original transcript remains saved.', requestFailed:'Request failed', connectionFailed:'Unable to connect' },
    es:{ secureInterview:'Entrevista segura por video', language:'Idioma', preparing:'Preparando', videoInterview:'ENTREVISTA POR VIDEO', checkingLink:'Verificando el enlace de la entrevista…', cameraCheck:'🎥 Cámara', micCheck:'🎙️ Micrófono', secureLink:'🔒 Enlace seguro de un solo uso', consent:'Entiendo que esta entrevista usa audio, video y transcripción en vivo para ayudar con las notas. La puntuación de IA es solo orientativa; la decisión final la toma una persona.', join:'Entrar a la entrevista', privacy:'No necesita una cuenta ni descargar una aplicación. El navegador solicitará acceso a la cámara y al micrófono solo después de su consentimiento. El video no se graba de forma predeterminada.', waiting:'Esperando al otro participante…', keepOpen:'Mantenga esta página abierta. El video aparecerá automáticamente cuando se conecte.', myVideo:'Mi video', inProgress:'Entrevista en curso', connectingRoom:'Conectando con la sala segura…', aiBoundary:'Asistencia de IA', aiNotice:'La IA puede ayudar con la transcripción, organizar evidencia y preparar una puntuación preliminar. No evalúa apariencia, acento ni otras características protegidas.', microphone:'🎙️ Micrófono', camera:'🎥 Cámara', leave:'Finalizar / Salir', liveTranscript:'Transcripción en vivo', startTranscript:'Iniciar transcripción', stopTranscript:'Detener transcripción', transcriptOff:'La transcripción está desactivada.', transcriptOn:'La transcripción en vivo está activa.', transcriptUnavailable:'Este navegador no admite la transcripción en vivo. Use Chrome o Safari actualizado.', aiCopilot:'Copiloto de entrevista con IA', suggestQuestions:'Sugerir preguntas', createSummary:'Crear resumen y borrador de puntuación', aiReady:'Listo para analizar evidencia relacionada con el trabajo.', aiWorking:'La IA está revisando la transcripción guardada…', candidateWelcome:'{name}, bienvenido a su entrevista con QUAD FILM', recruiterWelcome:'Entrar a la entrevista con {name}', minutes:'Duración estimada: {count} minutos', linkValid:'Enlace listo', reconnect:'Volver a conectar', recruiterJoin:'Entrar como entrevistador', connecting:'Conectando…', retry:'Intentar de nuevo', unsupported:'Este navegador no admite videollamadas seguras. Use Chrome, Safari o Edge actualizado.', connected:'En llamada', reconnecting:'Reconectando', joined:'{name} se conectó', other:'Otro participante', micOn:'🎙️ Silenciar micrófono', micOff:'🔇 Activar micrófono', cameraOn:'🎥 Apagar cámara', cameraOff:'🚫 Encender cámara', you:'Usted', candidate:'Candidato', interviewer:'Entrevistador', questions:'Preguntas de seguimiento sugeridas', evidence:'Evidencia encontrada', openQuestions:'Aún requiere verificación', summary:'Resumen de la entrevista', resumeDraft:'Borrador para completar el currículum (verifique antes de guardar)', scores:'Puntuaciones preliminares', noEvidence:'Todavía no hay evidencia transcrita.', aiFailed:'No se pudo completar el análisis de IA. La transcripción original permanece guardada.', requestFailed:'Solicitud fallida', connectionFailed:'No se pudo conectar' },
    pt:{ secureInterview:'Entrevista segura por vídeo', language:'Idioma', preparing:'Preparando', videoInterview:'ENTREVISTA POR VÍDEO', checkingLink:'Verificando o link da entrevista…', cameraCheck:'🎥 Câmera', micCheck:'🎙️ Microfone', secureLink:'🔒 Link seguro de uso único', consent:'Entendo que esta entrevista usa áudio, vídeo e transcrição ao vivo para auxiliar nas anotações. A pontuação da IA é apenas consultiva; a decisão final é humana.', join:'Entrar na entrevista', privacy:'Não é necessário criar conta nem baixar aplicativo. O navegador só pedirá acesso à câmera e ao microfone após seu consentimento. O vídeo não é gravado por padrão.', waiting:'Aguardando o outro participante…', keepOpen:'Mantenha esta página aberta. O vídeo aparecerá automaticamente quando houver conexão.', myVideo:'Meu vídeo', inProgress:'Entrevista em andamento', connectingRoom:'Conectando à sala segura…', aiBoundary:'Assistência de IA', aiNotice:'A IA pode auxiliar na transcrição, organização de evidências e rascunho de pontuação. Ela não avalia aparência, sotaque ou outras características protegidas.', microphone:'🎙️ Microfone', camera:'🎥 Câmera', leave:'Encerrar / Sair', liveTranscript:'Transcrição ao vivo', startTranscript:'Iniciar transcrição', stopTranscript:'Parar transcrição', transcriptOff:'A transcrição está desligada.', transcriptOn:'A transcrição ao vivo está ativa.', transcriptUnavailable:'Este navegador não oferece transcrição ao vivo. Use Chrome ou Safari atualizado.', aiCopilot:'Copiloto de entrevista com IA', suggestQuestions:'Sugerir perguntas', createSummary:'Criar resumo e rascunho de notas', aiReady:'Pronto para analisar evidências relacionadas ao trabalho.', aiWorking:'A IA está analisando a transcrição salva…', candidateWelcome:'{name}, bem-vindo à sua entrevista com a QUAD FILM', recruiterWelcome:'Entrar na entrevista com {name}', minutes:'Duração estimada: {count} minutos', linkValid:'Link pronto', reconnect:'Reconectar à entrevista', recruiterJoin:'Entrar como entrevistador', connecting:'Conectando…', retry:'Tentar novamente', unsupported:'Este navegador não oferece videochamadas seguras. Use Chrome, Safari ou Edge atualizado.', connected:'Em chamada', reconnecting:'Reconectando', joined:'{name} entrou', other:'Outro participante', micOn:'🎙️ Silenciar microfone', micOff:'🔇 Ativar microfone', cameraOn:'🎥 Desligar câmera', cameraOff:'🚫 Ligar câmera', you:'Você', candidate:'Candidato', interviewer:'Entrevistador', questions:'Perguntas de acompanhamento sugeridas', evidence:'Evidências encontradas', openQuestions:'Ainda precisa de verificação', summary:'Resumo da entrevista', resumeDraft:'Rascunho para completar o currículo (verifique antes de salvar)', scores:'Pontuações preliminares', noEvidence:'Ainda não há evidência transcrita.', aiFailed:'Não foi possível concluir a análise de IA. A transcrição original continua salva.', requestFailed:'Falha na solicitação', connectionFailed:'Não foi possível conectar' },
    zh:{ secureInterview:'安全视频面试', language:'语言', preparing:'准备中', videoInterview:'视频面试', checkingLink:'正在检查面试链接…', cameraCheck:'🎥 摄像头', micCheck:'🎙️ 麦克风', secureLink:'🔒 一次性安全链接', consent:'我了解本次面试将使用音频、视频及实时文字转写辅助记录；AI评分仅供招聘负责人参考，最终决定由人工完成。', join:'进入视频面试', privacy:'无需注册或下载应用。浏览器只会在你同意后申请摄像头和麦克风权限；页面不会默认录制视频。', waiting:'正在等待另一位参与者…', keepOpen:'保持此页面打开，连接后会自动显示。', myVideo:'我的画面', inProgress:'面试进行中', connectingRoom:'正在连接安全房间…', aiBoundary:'AI辅助边界', aiNotice:'AI可以协助转写、整理证据和生成评分草稿，但不会根据外貌、口音或其他受保护特征作出判断。', microphone:'🎙️ 麦克风', camera:'🎥 摄像头', leave:'结束 / 离开', liveTranscript:'实时转写', startTranscript:'开始转写', stopTranscript:'停止转写', transcriptOff:'转写尚未开启。', transcriptOn:'实时转写已开启。', transcriptUnavailable:'当前浏览器不支持实时转写，请使用最新版 Chrome 或 Safari。', aiCopilot:'AI面试助手', suggestQuestions:'建议追问', createSummary:'生成总结和评分草稿', aiReady:'可以分析与岗位有关的证据。', aiWorking:'AI正在分析已保存的转写证据…', candidateWelcome:'{name}，欢迎参加 QUAD FILM 视频面试', recruiterWelcome:'进入与 {name} 的视频面试', minutes:'预计 {count} 分钟', linkValid:'链接有效', reconnect:'重新连接面试', recruiterJoin:'以面试官身份进入', connecting:'正在连接…', retry:'重新尝试', unsupported:'此浏览器不支持安全视频通话，请使用最新版 Chrome、Safari 或 Edge。', connected:'通话中', reconnecting:'正在重连', joined:'{name} 已加入', other:'另一位参与者', micOn:'🎙️ 关闭麦克风', micOff:'🔇 打开麦克风', cameraOn:'🎥 关闭摄像头', cameraOff:'🚫 打开摄像头', you:'我', candidate:'应聘者', interviewer:'面试官', questions:'建议追问题目', evidence:'已发现证据', openQuestions:'仍需核实', summary:'面试总结', resumeDraft:'简历补全草稿（保存前核实）', scores:'证据评分草稿', noEvidence:'目前还没有转写证据。', aiFailed:'AI分析暂时失败，原始转写已经保存。', requestFailed:'请求失败', connectionFailed:'无法连接' }
  };
  const questionCopy = {
    en:{ title:'Interview question bank', kit:'Question set', questions:'questions', critical:'Key', focus:'What to assess', strong:'Strong-answer evidence', bilingual:'Chinese reference' },
    es:{ title:'Banco de preguntas', kit:'Conjunto de preguntas', questions:'preguntas', critical:'Clave', focus:'Qué evaluar', strong:'Evidencia de una respuesta sólida', bilingual:'Referencia en chino' },
    pt:{ title:'Banco de perguntas', kit:'Conjunto de perguntas', questions:'perguntas', critical:'Essencial', focus:'O que avaliar', strong:'Evidência de uma resposta forte', bilingual:'Referência em chinês' },
    zh:{ title:'面试题库（点击题目查看评分要点）', kit:'选择题目模板', questions:'道题', critical:'重点', focus:'考察重点', strong:'优秀回答证据', bilingual:'英文提问' }
  };
  let language = localStorage.getItem('quadInterview.language') || 'en';
  if (!copy[language]) language = 'en';
  let info = null, room = null, joining = false, sessionSecret = '', recognition = null, transcriptActive = false, micEnabled = true, cameraEnabled = true;
  let analysisBusy = false, newEvidenceCount = 0, lastAutoAnalysisAt = 0, selectedKitId = '', selectedQuestionId = '';
  const t = (key, vars = {}) => Object.entries(vars).reduce((value, [name, replacement]) => value.replace(`{${name}}`, replacement), copy[language][key] || copy.en[key] || key);
  const qt = key => questionCopy[language]?.[key] || questionCopy.en[key] || key;
  const request = async (url, options = {}) => {
    const headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    if (options.auth) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetch(url, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(body.error || `${t('requestFailed')} (${response.status})`); error.code = body.code; throw error; }
    return body;
  };
  const when = value => value ? new Intl.DateTimeFormat(localeCodes[language], { dateStyle:'full', timeStyle:'short', timeZone:'America/Los_Angeles' }).format(new Date(value)) : '';
  function applyLanguage() {
    document.documentElement.lang = localeCodes[language]; $('language').value = language;
    localStorage.setItem('quadInterview.language', language);
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    if (info) renderReady();
    $('transcriptToggle').textContent = t(transcriptActive ? 'stopTranscript' : 'startTranscript');
    document.title = `QUAD FILM · ${t('videoInterview')}`;
  }
  function error(message) { $('error').textContent = message || ''; $('connectionBadge').textContent = t('connectionFailed'); $('connectionBadge').className = 'badge warn'; }
  function renderReady() {
    $('welcomeTitle').textContent = recruiter ? t('recruiterWelcome', { name:info.candidateName }) : t('candidateWelcome', { name:info.candidateName });
    $('welcomeMeta').textContent = `${when(info.startsAt)} · ${t('minutes', { count:String(info.durationMinutes || 30) })}`;
    $('consentRow').hidden = recruiter; $('consent').checked = recruiter;
    $('join').disabled = recruiter ? false : !$('consent').checked;
    $('join').textContent = recruiter ? t('recruiterJoin') : info.status === 'joined' ? t('reconnect') : t('join');
    $('connectionBadge').textContent = t('linkValid');
    renderQuestionBank(); renderTranscripts(info.aiState?.transcript || []); renderAnalysis(info.aiState?.analysis || null);
  }
  function ready(data) { info = data; $('aiPanel').hidden = !recruiter; $('questionBankPanel').hidden = !recruiter; renderReady(); }
  async function boot() {
    try {
      if (invite) return ready(await request(`/api/public/recruiting-video/invite/${encodeURIComponent(invite)}`));
      if (interviewId && authToken) return ready(await request(`/api/recruiting/interviews/${encodeURIComponent(interviewId)}/video-token`, { method:'POST', auth:true }));
      throw new Error(t('connectionFailed'));
    } catch (cause) { error(cause.message); }
  }
  function renderTranscripts(rows) {
    const list = $('transcriptList'); list.replaceChildren();
    for (const row of rows.slice(-30)) appendTranscript(row);
  }
  function appendTranscript(row) {
    if ($(`transcript-${CSS.escape(String(row.id || ''))}`)) return;
    const line = document.createElement('div'); line.className = 'transcript-line'; line.id = `transcript-${row.id}`;
    const speaker = row.speaker === 'candidate' ? t('candidate') : t('interviewer');
    const label = document.createElement('strong'); label.textContent = speaker;
    const text = document.createElement('span'); text.textContent = row.text;
    line.append(label, text); $('transcriptList').appendChild(line); line.scrollIntoView({ block:'nearest' });
  }
  function queueRealtimeAnalysis() {
    if (!recruiter || analysisBusy) return;
    newEvidenceCount += 1;
    const now = Date.now();
    if (newEvidenceCount < 3 || now - lastAutoAnalysisAt < 30_000) return;
    newEvidenceCount = 0; lastAutoAnalysisAt = now;
    analyze('next', true);
  }
  function recommendedKitId(kits, position) {
    const value = String(position || '').toLowerCase();
    if (/(dealer|dealership|4s|经销|外跑)/.test(value)) return kits.find(item => item.id === 'dealer_quick_8')?.id;
    if (/(installer|technician|技师|施工|贴膜)/.test(value)) return kits.find(item => item.id === 'installer_quick_6')?.id;
    if (/(wholesale|b2b|sales|销售|业务)/.test(value)) return kits.find(item => item.id === 'wholesale_quick_6')?.id;
    return kits.find(item => item.id === 'remote_quick_6')?.id || kits[0]?.id || '';
  }
  function renderQuestionBank() {
    const panel = $('questionBankPanel');
    const kits = recruiter && Array.isArray(info?.interviewKits) ? info.interviewKits : [];
    panel.hidden = !recruiter || !kits.length;
    if (panel.hidden) return;
    if (!kits.some(item => item.id === selectedKitId)) selectedKitId = recommendedKitId(kits, info.candidatePosition);
    const kit = kits.find(item => item.id === selectedKitId) || kits[0];
    selectedKitId = kit.id;
    if (!kit.questions.some(item => item.id === selectedQuestionId)) selectedQuestionId = kit.questions[0]?.id || '';
    $('questionBankTitle').textContent = qt('title');
    $('questionKitLabel').textContent = qt('kit');
    $('questionCount').textContent = `${kit.questions.length} ${qt('questions')}`;
    $('questionKitDescription').textContent = language === 'zh' ? kit.descriptionZh : kit.descriptionEn;
    const select = $('questionKitSelect'); select.replaceChildren();
    for (const optionKit of kits) {
      const option = document.createElement('option'); option.value = optionKit.id;
      option.textContent = language === 'zh' ? optionKit.titleZh : optionKit.titleEn;
      option.selected = optionKit.id === kit.id; select.appendChild(option);
    }
    select.onchange = event => { selectedKitId = event.target.value; selectedQuestionId = ''; renderQuestionBank(); };
    const list = $('questionBankList'); list.replaceChildren();
    kit.questions.forEach((question, index) => {
      const selected = question.id === selectedQuestionId;
      const card = document.createElement('article'); card.className = `question-card${selected ? ' selected' : ''}`;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'question-button'; button.setAttribute('aria-expanded', String(selected));
      const number = document.createElement('span'); number.className = 'question-number'; number.textContent = String(index + 1);
      const wording = document.createElement('span'); wording.className = 'question-text'; wording.textContent = language === 'zh' ? question.zh : question.en;
      const flag = document.createElement('span'); flag.className = 'question-critical'; flag.textContent = question.critical ? qt('critical') : '';
      button.append(number, wording, flag);
      button.onclick = () => { selectedQuestionId = selected ? '' : question.id; renderQuestionBank(); };
      card.appendChild(button);
      if (selected) {
        const details = document.createElement('div'); details.className = 'question-details';
        const bilingual = document.createElement('p'); const bilingualTitle = document.createElement('strong'); bilingualTitle.textContent = qt('bilingual');
        bilingual.append(bilingualTitle, document.createTextNode(language === 'zh' ? question.en : question.zh));
        const focus = document.createElement('p'); const focusTitle = document.createElement('strong'); focusTitle.textContent = qt('focus');
        focus.append(focusTitle, document.createTextNode(question.focus));
        const strong = document.createElement('p'); const strongTitle = document.createElement('strong'); strongTitle.textContent = qt('strong');
        strong.append(strongTitle, document.createTextNode(question.strong));
        details.append(bilingual, focus, strong); card.appendChild(details);
      }
      list.appendChild(card);
    });
  }
  function displayValue(value) {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (!value || typeof value !== 'object') return '';
    const preferred = value.question || value.text || value.evidence || value.detail || value.summary || value.reason;
    if (typeof preferred === 'string') return preferred;
    return Object.values(value).filter(item => typeof item === 'string' || typeof item === 'number').join(' — ');
  }
  function renderList(title, values) {
    if (!values?.length) return null;
    const section = document.createElement('section'); const heading = document.createElement('strong'); heading.textContent = title;
    const list = document.createElement('ul'); values.forEach(value => { const item = document.createElement('li'); item.textContent = displayValue(value); list.appendChild(item); });
    section.append(heading, list); return section;
  }
  function renderAnalysis(analysis) {
    $('aiQuestions').replaceChildren(); $('aiSummary').replaceChildren(); if (!analysis) return;
    for (const section of [renderList(t('questions'), analysis.nextQuestions), renderList(t('evidence'), analysis.evidence), renderList(t('openQuestions'), analysis.openQuestions)]) if (section) $('aiQuestions').appendChild(section);
    const summary = document.createElement('section'); const title = document.createElement('strong'); title.textContent = t('summary'); const text = document.createElement('p'); text.textContent = analysis.summary || t('noEvidence'); summary.append(title, text); $('aiSummary').appendChild(summary);
    const scores = document.createElement('section'); const scoreTitle = document.createElement('strong'); scoreTitle.textContent = t('scores'); scores.appendChild(scoreTitle);
    for (const [name, value] of Object.entries(analysis.scores || {})) { const row = document.createElement('div'); row.className = 'score-row'; const key = document.createElement('span'); key.textContent = name; const score = document.createElement('b'); score.textContent = value == null ? '—' : `${value}/10`; row.append(key, score); scores.appendChild(row); }
    $('aiSummary').appendChild(scores);
    if (analysis.resumeDraft) { const resume = document.createElement('section'); const resumeTitle = document.createElement('strong'); resumeTitle.textContent = t('resumeDraft'); const pre = document.createElement('p'); pre.textContent = analysis.resumeDraft; resume.append(resumeTitle, pre); $('aiSummary').appendChild(resume); }
  }
  function updateVideoAspect(element, container) {
    const apply = () => {
      if (!element.videoWidth || !element.videoHeight) return;
      container.classList.toggle('portrait-video', element.videoHeight > element.videoWidth * 1.08);
    };
    element.addEventListener('loadedmetadata', apply);
    element.addEventListener('resize', apply);
    if (element.readyState >= 1) apply();
  }
  function attachRemote(track, participant) {
    const element = track.attach();
    if (track.kind === LivekitClient.Track.Kind.Video) { $('remoteStage').querySelector('.waiting')?.remove(); element.autoplay = true; element.playsInline = true; updateVideoAspect(element, $('remoteStage')); $('remoteStage').appendChild(element); $('participantState').textContent = t('joined', { name:participant?.name || t('other') }); }
    else if (track.kind === LivekitClient.Track.Kind.Audio) { element.autoplay = true; $('audioStage').appendChild(element); element.play().catch(() => {}); }
  }
  async function tokenForJoin() {
    if (!invite) return info;
    const stored = JSON.parse(localStorage.getItem(`quadInterview.${info.interviewId}`) || 'null');
    if (info.status === 'joined' && stored?.sessionSecret) { sessionSecret = stored.sessionSecret; return request('/api/public/recruiting-video/session', { method:'POST', body:JSON.stringify({ interviewId:info.interviewId, sessionSecret }) }); }
    const data = await request(`/api/public/recruiting-video/invite/${encodeURIComponent(invite)}/exchange`, { method:'POST', body:JSON.stringify({ consent:true }) });
    sessionSecret = data.sessionSecret; localStorage.setItem(`quadInterview.${data.interviewId}`, JSON.stringify({ sessionSecret, expiresAt:data.expiresAt })); return data;
  }
  async function join() {
    if (joining || (!$('consent').checked && invite)) return;
    if (!window.LivekitClient?.isBrowserSupported?.()) return error(t('unsupported'));
    joining = true; $('join').disabled = true; $('join').textContent = t('connecting');
    try {
      const access = await tokenForJoin(); info = { ...info, ...access };
      room = new LivekitClient.Room({ adaptiveStream:true, dynacast:true, disconnectOnPageLeave:true });
      room.on(LivekitClient.RoomEvent.TrackSubscribed, attachRemote);
      room.on(LivekitClient.RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(node => node.remove()); if (!$('remoteStage').querySelector('video')) $('remoteStage').classList.remove('portrait-video'); });
      room.on(LivekitClient.RoomEvent.ParticipantConnected, participant => { $('participantState').textContent = t('joined', { name:participant.name || t('other') }); });
      room.on(LivekitClient.RoomEvent.DataReceived, payload => { try { const value = JSON.parse(new TextDecoder().decode(payload)); if (value.type === 'transcript') { appendTranscript(value.row); queueRealtimeAnalysis(); } } catch {} });
      room.on(LivekitClient.RoomEvent.Reconnecting, () => { $('connectionBadge').textContent = t('reconnecting'); $('connectionBadge').className = 'badge warn'; });
      room.on(LivekitClient.RoomEvent.Reconnected, () => { $('connectionBadge').textContent = t('connected'); $('connectionBadge').className = 'badge live'; });
      await room.connect(access.url, access.token); await room.localParticipant.setCameraEnabled(true); await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation:true, noiseSuppression:true, autoGainControl:true });
      const local = room.localParticipant.getTrackPublication(LivekitClient.Track.Source.Camera)?.track;
      if (local) { const video = local.attach(); video.muted = true; video.playsInline = true; updateVideoAspect(video, $('localStage')); $('localStage').appendChild(video); }
      $('welcome').hidden = true; $('roomView').hidden = false; $('connectionBadge').textContent = t('connected'); $('connectionBadge').className = 'badge live'; renderTranscripts(access.aiState?.transcript || []); renderAnalysis(access.aiState?.analysis || null);
    } catch (cause) { error(cause.message); $('join').disabled = false; $('join').textContent = t('retry'); }
    finally { joining = false; }
  }
  async function saveTranscript(text) {
    const row = { id:`${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`, speaker:recruiter ? 'interviewer' : 'candidate', text, language, createdAt:new Date().toISOString() };
    appendTranscript(row); room?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type:'transcript', row })), { reliable:true }).catch(() => {});
    const body = { id:row.id, text, language };
    if (recruiter) { await request(`/api/recruiting/interviews/${encodeURIComponent(info.interviewId)}/video-transcript`, { method:'POST', auth:true, body:JSON.stringify(body) }); queueRealtimeAnalysis(); }
    else await request('/api/public/recruiting-video/transcript', { method:'POST', body:JSON.stringify({ ...body, interviewId:info.interviewId, sessionSecret }) });
  }
  function startTranscript() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { $('transcriptStatus').textContent = t('transcriptUnavailable'); return; }
    if (transcriptActive) { transcriptActive = false; recognition?.stop(); $('transcriptToggle').textContent = t('startTranscript'); $('transcriptStatus').textContent = t('transcriptOff'); return; }
    recognition = new SpeechRecognition(); recognition.continuous = true; recognition.interimResults = true; recognition.lang = localeCodes[language]; transcriptActive = true;
    recognition.onresult = event => { for (let index = event.resultIndex; index < event.results.length; index++) if (event.results[index].isFinal) saveTranscript(event.results[index][0].transcript.trim()).catch(cause => { $('transcriptStatus').textContent = cause.message; }); };
    recognition.onend = () => { if (transcriptActive) try { recognition.start(); } catch {} };
    recognition.onerror = event => { if (!['no-speech', 'aborted'].includes(event.error)) $('transcriptStatus').textContent = event.error; };
    recognition.start(); $('transcriptToggle').textContent = t('stopTranscript'); $('transcriptStatus').textContent = t('transcriptOn');
  }
  async function analyze(mode, automatic = false) {
    if (analysisBusy) return;
    analysisBusy = true;
    const button = mode === 'final' ? $('aiFinal') : $('aiNext'); button.disabled = true; $('aiStatus').textContent = t('aiWorking');
    try { const data = await request(`/api/recruiting/interviews/${encodeURIComponent(info.interviewId)}/video-analyze`, { method:'POST', auth:true, body:JSON.stringify({ mode }) }); renderAnalysis(data.aiState?.analysis); $('aiStatus').textContent = t('aiReady'); }
    catch { $('aiStatus').textContent = t('aiFailed'); if (automatic) lastAutoAnalysisAt = 0; } finally { analysisBusy = false; button.disabled = false; }
  }
  $('language').addEventListener('change', event => { language = event.target.value; applyLanguage(); if (recognition && transcriptActive) { recognition.stop(); recognition.lang = localeCodes[language]; } });
  $('consent').addEventListener('change', () => { if (invite) $('join').disabled = !$('consent').checked || !info; });
  $('join').addEventListener('click', join); $('transcriptToggle').addEventListener('click', startTranscript); $('aiNext').addEventListener('click', () => analyze('next')); $('aiFinal').addEventListener('click', () => analyze('final'));
  $('mic').addEventListener('click', async () => { if (!room) return; micEnabled = !room.localParticipant.isMicrophoneEnabled; await room.localParticipant.setMicrophoneEnabled(micEnabled); $('mic').textContent = t(micEnabled ? 'micOn' : 'micOff'); });
  $('camera').addEventListener('click', async () => { if (!room) return; cameraEnabled = !room.localParticipant.isCameraEnabled; await room.localParticipant.setCameraEnabled(cameraEnabled); $('camera').textContent = t(cameraEnabled ? 'cameraOn' : 'cameraOff'); });
  $('leave').addEventListener('click', async () => { transcriptActive = false; recognition?.stop(); await room?.disconnect(); room = null; location.reload(); });
  applyLanguage(); boot();
})();
