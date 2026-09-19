(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const invite = params.get('invite') || '';
  const interviewId = params.get('interview') || '';
  const recruiter = Boolean(interviewId && !invite);
  document.body.classList.add(recruiter ? 'recruiter-view' : 'candidate-view');
  const authToken = localStorage.getItem('filmShopCloud.token') || '';
  const localeCodes = { en:'en-US', es:'es-US', pt:'pt-BR', zh:'zh-CN' };
  const copy = {
    en:{ secureInterview:'Secure video interview', language:'Language', preparing:'Preparing', videoInterview:'VIDEO INTERVIEW', checkingLink:'Checking your interview link…', cameraCheck:'🎥 Camera', micCheck:'🎙️ Microphone', secureLink:'🔒 One-time secure link', consent:'I understand that this interview uses audio, video, and live transcription to assist with notes. AI scoring is advisory only; a person makes the final decision.', join:'Join video interview', privacy:'No account or app download is required. Your browser asks for camera and microphone access only after you consent. Video is not recorded by default.', waiting:'Waiting for the other participant…', keepOpen:'Keep this page open. Video will appear automatically after they connect.', myVideo:'My video', inProgress:'Interview in progress', connectingRoom:'Connecting to the secure room…', aiBoundary:'AI assistance', aiNotice:'AI may assist with transcription, evidence organization, and a draft score. It does not evaluate appearance, accent, or other protected characteristics.', microphone:'🎙️ Microphone', camera:'🎥 Camera', leave:'End / Leave', leaving:'Leaving…', interviewEnded:'You have left the interview', safeToClose:'The camera and microphone are disconnected. You may safely close this page.', liveTranscript:'Live transcript', startTranscript:'Start transcript', stopTranscript:'Stop transcript', transcriptOff:'Transcription is off.', transcriptOn:'Live transcription is on.', transcriptUnavailable:'Live transcription is not supported in this browser. Use current Chrome or Safari.', aiCopilot:'AI interview copilot', suggestQuestions:'Suggest questions', createSummary:'Create summary and score draft', aiReady:'Ready to analyze job-related evidence.', aiWorking:'AI is reviewing saved transcript evidence…', candidateWelcome:'{name}, welcome to your QUAD FILM video interview', recruiterWelcome:'Join the video interview with {name}', minutes:'Estimated {count} minutes', linkValid:'Link ready', reconnect:'Reconnect to interview', recruiterJoin:'Join as interviewer', connecting:'Connecting…', retry:'Try again', unsupported:'This browser does not support secure video calls. Use current Chrome, Safari, or Edge.', connected:'In call', reconnecting:'Reconnecting', joined:'{name} joined', other:'Other participant', micOn:'🎙️ Mute microphone', micOff:'🔇 Turn on microphone', cameraOn:'🎥 Turn off camera', cameraOff:'🚫 Turn on camera', you:'You', candidate:'Candidate', interviewer:'Interviewer', questions:'Suggested follow-up questions', evidence:'Evidence found', openQuestions:'Still needs verification', summary:'Interview summary', resumeDraft:'Resume completion draft (verify before saving)', scores:'Draft evidence scores', noEvidence:'No transcript evidence yet.', aiFailed:'AI analysis could not be completed. The original transcript remains saved.', requestFailed:'Request failed', connectionFailed:'Unable to connect' },
    es:{ secureInterview:'Entrevista segura por video', language:'Idioma', preparing:'Preparando', videoInterview:'ENTREVISTA POR VIDEO', checkingLink:'Verificando el enlace de la entrevista…', cameraCheck:'🎥 Cámara', micCheck:'🎙️ Micrófono', secureLink:'🔒 Enlace seguro de un solo uso', consent:'Entiendo que esta entrevista usa audio, video y transcripción en vivo para ayudar con las notas. La puntuación de IA es solo orientativa; la decisión final la toma una persona.', join:'Entrar a la entrevista', privacy:'No necesita una cuenta ni descargar una aplicación. El navegador solicitará acceso a la cámara y al micrófono solo después de su consentimiento. El video no se graba de forma predeterminada.', waiting:'Esperando al otro participante…', keepOpen:'Mantenga esta página abierta. El video aparecerá automáticamente cuando se conecte.', myVideo:'Mi video', inProgress:'Entrevista en curso', connectingRoom:'Conectando con la sala segura…', aiBoundary:'Asistencia de IA', aiNotice:'La IA puede ayudar con la transcripción, organizar evidencia y preparar una puntuación preliminar. No evalúa apariencia, acento ni otras características protegidas.', microphone:'🎙️ Micrófono', camera:'🎥 Cámara', leave:'Finalizar / Salir', leaving:'Saliendo…', interviewEnded:'Ha salido de la entrevista', safeToClose:'La cámara y el micrófono están desconectados. Puede cerrar esta página.', liveTranscript:'Transcripción en vivo', startTranscript:'Iniciar transcripción', stopTranscript:'Detener transcripción', transcriptOff:'La transcripción está desactivada.', transcriptOn:'La transcripción en vivo está activa.', transcriptUnavailable:'Este navegador no admite la transcripción en vivo. Use Chrome o Safari actualizado.', aiCopilot:'Copiloto de entrevista con IA', suggestQuestions:'Sugerir preguntas', createSummary:'Crear resumen y borrador de puntuación', aiReady:'Listo para analizar evidencia relacionada con el trabajo.', aiWorking:'La IA está revisando la transcripción guardada…', candidateWelcome:'{name}, bienvenido a su entrevista con QUAD FILM', recruiterWelcome:'Entrar a la entrevista con {name}', minutes:'Duración estimada: {count} minutos', linkValid:'Enlace listo', reconnect:'Volver a conectar', recruiterJoin:'Entrar como entrevistador', connecting:'Conectando…', retry:'Intentar de nuevo', unsupported:'Este navegador no admite videollamadas seguras. Use Chrome, Safari o Edge actualizado.', connected:'En llamada', reconnecting:'Reconectando', joined:'{name} se conectó', other:'Otro participante', micOn:'🎙️ Silenciar micrófono', micOff:'🔇 Activar micrófono', cameraOn:'🎥 Apagar cámara', cameraOff:'🚫 Encender cámara', you:'Usted', candidate:'Candidato', interviewer:'Entrevistador', questions:'Preguntas de seguimiento sugeridas', evidence:'Evidencia encontrada', openQuestions:'Aún requiere verificación', summary:'Resumen de la entrevista', resumeDraft:'Borrador para completar el currículum (verifique antes de guardar)', scores:'Puntuaciones preliminares', noEvidence:'Todavía no hay evidencia transcrita.', aiFailed:'No se pudo completar el análisis de IA. La transcripción original permanece guardada.', requestFailed:'Solicitud fallida', connectionFailed:'No se pudo conectar' },
    pt:{ secureInterview:'Entrevista segura por vídeo', language:'Idioma', preparing:'Preparando', videoInterview:'ENTREVISTA POR VÍDEO', checkingLink:'Verificando o link da entrevista…', cameraCheck:'🎥 Câmera', micCheck:'🎙️ Microfone', secureLink:'🔒 Link seguro de uso único', consent:'Entendo que esta entrevista usa áudio, vídeo e transcrição ao vivo para auxiliar nas anotações. A pontuação da IA é apenas consultiva; a decisão final é humana.', join:'Entrar na entrevista', privacy:'Não é necessário criar conta nem baixar aplicativo. O navegador só pedirá acesso à câmera e ao microfone após seu consentimento. O vídeo não é gravado por padrão.', waiting:'Aguardando o outro participante…', keepOpen:'Mantenha esta página aberta. O vídeo aparecerá automaticamente quando houver conexão.', myVideo:'Meu vídeo', inProgress:'Entrevista em andamento', connectingRoom:'Conectando à sala segura…', aiBoundary:'Assistência de IA', aiNotice:'A IA pode auxiliar na transcrição, organização de evidências e rascunho de pontuação. Ela não avalia aparência, sotaque ou outras características protegidas.', microphone:'🎙️ Microfone', camera:'🎥 Câmera', leave:'Encerrar / Sair', leaving:'Saindo…', interviewEnded:'Você saiu da entrevista', safeToClose:'A câmera e o microfone foram desconectados. Você pode fechar esta página.', liveTranscript:'Transcrição ao vivo', startTranscript:'Iniciar transcrição', stopTranscript:'Parar transcrição', transcriptOff:'A transcrição está desligada.', transcriptOn:'A transcrição ao vivo está ativa.', transcriptUnavailable:'Este navegador não oferece transcrição ao vivo. Use Chrome ou Safari atualizado.', aiCopilot:'Copiloto de entrevista com IA', suggestQuestions:'Sugerir perguntas', createSummary:'Criar resumo e rascunho de notas', aiReady:'Pronto para analisar evidências relacionadas ao trabalho.', aiWorking:'A IA está analisando a transcrição salva…', candidateWelcome:'{name}, bem-vindo à sua entrevista com a QUAD FILM', recruiterWelcome:'Entrar na entrevista com {name}', minutes:'Duração estimada: {count} minutos', linkValid:'Link pronto', reconnect:'Reconectar à entrevista', recruiterJoin:'Entrar como entrevistador', connecting:'Conectando…', retry:'Tentar novamente', unsupported:'Este navegador não oferece videochamadas seguras. Use Chrome, Safari ou Edge atualizado.', connected:'Em chamada', reconnecting:'Reconectando', joined:'{name} entrou', other:'Outro participante', micOn:'🎙️ Silenciar microfone', micOff:'🔇 Ativar microfone', cameraOn:'🎥 Desligar câmera', cameraOff:'🚫 Ligar câmera', you:'Você', candidate:'Candidato', interviewer:'Entrevistador', questions:'Perguntas de acompanhamento sugeridas', evidence:'Evidências encontradas', openQuestions:'Ainda precisa de verificação', summary:'Resumo da entrevista', resumeDraft:'Rascunho para completar o currículo (verifique antes de salvar)', scores:'Pontuações preliminares', noEvidence:'Ainda não há evidência transcrita.', aiFailed:'Não foi possível concluir a análise de IA. A transcrição original continua salva.', requestFailed:'Falha na solicitação', connectionFailed:'Não foi possível conectar' },
    zh:{ secureInterview:'安全视频面试', language:'语言', preparing:'准备中', videoInterview:'视频面试', checkingLink:'正在检查面试链接…', cameraCheck:'🎥 摄像头', micCheck:'🎙️ 麦克风', secureLink:'🔒 一次性安全链接', consent:'我了解本次面试将使用音频、视频及实时文字转写辅助记录；AI评分仅供招聘负责人参考，最终决定由人工完成。', join:'进入视频面试', privacy:'无需注册或下载应用。浏览器只会在你同意后申请摄像头和麦克风权限；页面不会默认录制视频。', waiting:'正在等待另一位参与者…', keepOpen:'保持此页面打开，连接后会自动显示。', myVideo:'我的画面', inProgress:'面试进行中', connectingRoom:'正在连接安全房间…', aiBoundary:'AI辅助边界', aiNotice:'AI可以协助转写、整理证据和生成评分草稿，但不会根据外貌、口音或其他受保护特征作出判断。', microphone:'🎙️ 麦克风', camera:'🎥 摄像头', leave:'结束 / 离开', leaving:'正在离开…', interviewEnded:'你已离开本次面试', safeToClose:'摄像头和麦克风已经断开，可以安全关闭此页面。', liveTranscript:'实时转写', startTranscript:'开始转写', stopTranscript:'停止转写', transcriptOff:'转写尚未开启。', transcriptOn:'实时转写已开启。', transcriptUnavailable:'当前浏览器不支持实时转写，请使用最新版 Chrome 或 Safari。', aiCopilot:'AI面试助手', suggestQuestions:'建议追问', createSummary:'生成总结和评分草稿', aiReady:'可以分析与岗位有关的证据。', aiWorking:'AI正在分析已保存的转写证据…', candidateWelcome:'{name}，欢迎参加 QUAD FILM 视频面试', recruiterWelcome:'进入与 {name} 的视频面试', minutes:'预计 {count} 分钟', linkValid:'链接有效', reconnect:'重新连接面试', recruiterJoin:'以面试官身份进入', connecting:'正在连接…', retry:'重新尝试', unsupported:'此浏览器不支持安全视频通话，请使用最新版 Chrome、Safari 或 Edge。', connected:'通话中', reconnecting:'正在重连', joined:'{name} 已加入', other:'另一位参与者', micOn:'🎙️ 关闭麦克风', micOff:'🔇 打开麦克风', cameraOn:'🎥 关闭摄像头', cameraOff:'🚫 打开摄像头', you:'我', candidate:'应聘者', interviewer:'面试官', questions:'建议追问题目', evidence:'已发现证据', openQuestions:'仍需核实', summary:'面试总结', resumeDraft:'简历补全草稿（保存前核实）', scores:'证据评分草稿', noEvidence:'目前还没有转写证据。', aiFailed:'AI分析暂时失败，原始转写已经保存。', requestFailed:'请求失败', connectionFailed:'无法连接' }
  };
  const questionCopy = {
    en:{ title:'Interview question bank', kit:'Question set', questions:'questions', critical:'Key', focus:'What to assess', strong:'Strong-answer evidence', bilingual:'Chinese reference' },
    es:{ title:'Banco de preguntas', kit:'Conjunto de preguntas', questions:'preguntas', critical:'Clave', focus:'Qué evaluar', strong:'Evidencia de una respuesta sólida', bilingual:'Referencia en chino' },
    pt:{ title:'Banco de perguntas', kit:'Conjunto de perguntas', questions:'perguntas', critical:'Essencial', focus:'O que avaliar', strong:'Evidência de uma resposta forte', bilingual:'Referência em chinês' },
    zh:{ title:'面试题库（点击题目查看评分要点）', kit:'选择题目模板', questions:'道题', critical:'重点', focus:'考察重点', strong:'优秀回答证据', bilingual:'英文提问' }
  };
  const resumeCopy = {
    en:{ title:'Candidate resume', position:'Position', location:'Location', source:'Source', availability:'Availability', employment:'Employment', compensation:'Compensation', experience:'Work experience', resources:'Customer / dealership resources', resume:'Resume', notes:'Recruiting notes', missing:'No resume text has been entered yet.', attachment:'Resume attached: {name}' },
    es:{ title:'Currículum del candidato', position:'Puesto', location:'Ubicación', source:'Origen', availability:'Disponibilidad', employment:'Tipo de empleo', compensation:'Compensación', experience:'Experiencia laboral', resources:'Recursos de clientes / concesionarios', resume:'Currículum', notes:'Notas de contratación', missing:'Aún no se ha ingresado el texto del currículum.', attachment:'Currículum adjunto: {name}' },
    pt:{ title:'Currículo do candidato', position:'Cargo', location:'Localização', source:'Origem', availability:'Disponibilidade', employment:'Tipo de trabalho', compensation:'Remuneração', experience:'Experiência profissional', resources:'Recursos de clientes / concessionárias', resume:'Currículo', notes:'Notas de recrutamento', missing:'O texto do currículo ainda não foi inserido.', attachment:'Currículo anexado: {name}' },
    zh:{ title:'应聘者简历', position:'应聘岗位', location:'所在地', source:'来源', availability:'最早到岗', employment:'工作意愿', compensation:'薪酬匹配', experience:'工作经历', resources:'客户 / 经销商资源', resume:'简历正文', notes:'招聘备注', missing:'尚未录入简历正文。', attachment:'已附简历：{name}' }
  };
  const transcriptBlocked = {
    en:'Automatic transcription could not start. Check browser microphone and speech-recognition permissions.',
    es:'No se pudo iniciar la transcripción automática. Revise los permisos del micrófono y reconocimiento de voz.',
    pt:'Não foi possível iniciar a transcrição automática. Verifique as permissões do microfone e reconhecimento de voz.',
    zh:'自动转写未能启动，请检查浏览器的麦克风和语音识别权限。'
  };
  const backCopy = { en:'← Back to recruiting', es:'← Volver a contratación', pt:'← Voltar ao recrutamento', zh:'← 返回招聘中心' };
  const interviewerCopy = {
    en:{ secureLink:'🔒 Sign-in protected interviewer access', privacy:'Sign in with a system account that has recruiting access. The candidate uses a separate invitation link. Camera and microphone access begins only after you click Join; video is not recorded by default.' },
    es:{ secureLink:'🔒 Acceso para entrevistadores con inicio de sesión', privacy:'Inicie sesión con una cuenta del sistema con acceso a contratación. El candidato usa un enlace de invitación independiente. La cámara y el micrófono se solicitan al pulsar Entrar; el video no se graba de forma predeterminada.' },
    pt:{ secureLink:'🔒 Acesso de entrevistador protegido por login', privacy:'Entre com uma conta do sistema com acesso ao recrutamento. O candidato usa um convite separado. A câmera e o microfone são solicitados ao clicar em Entrar; o vídeo não é gravado por padrão.' },
    zh:{ secureLink:'🔒 登录保护的面试官入口', privacy:'请先登录具有招聘权限的系统账号；候选人使用独立邀请链接。点击进入后才会申请摄像头和麦克风权限；不会默认录制视频。' }
  };
  const roomCopy = {
    en:{ leave:'Leave interview', endRoom:'End for everyone', endConfirm:'End this interview for everyone? All participants will be disconnected and the candidate link will stop working.', ending:'Ending interview…', roomEnded:'This interview has ended for everyone', disconnected:'You are disconnected. You can try joining again.', participants:'{count} online', cameraPaused:'Camera off / waiting for video', microphoneMuted:'Microphone muted', waiting:'Waiting for other participants…', shareInterviewer:'Interviewer link', copyLink:'Copy interviewer link', linkCopied:'Interviewer link copied.', copyManually:'Select and copy the link above.', shareNotice:'For interviewers only: sign in with an account that has recruiting access before opening this link. This is not the candidate invitation link.', signInRequired:'Please sign in with an account that has recruiting access, then open this interviewer link again.', readOnly:'View-only recruiting access: you can join the call, but cannot save transcription, run AI analysis, or end the room.', muteTranscript:'Turn on your microphone before starting transcription.', leaveNotice:'Leave disconnects only you. Other participants stay in the room.', participantRole:'Participant' },
    es:{ leave:'Salir de la entrevista', endRoom:'Finalizar para todos', endConfirm:'¿Finalizar esta entrevista para todos? Se desconectarán todos los participantes y el enlace del candidato dejará de funcionar.', ending:'Finalizando entrevista…', roomEnded:'La entrevista ha finalizado para todos', disconnected:'Se perdió la conexión. Puede intentar entrar de nuevo.', participants:'{count} en línea', cameraPaused:'Cámara apagada / esperando video', microphoneMuted:'Micrófono silenciado', waiting:'Esperando a otros participantes…', shareInterviewer:'Enlace para entrevistadores', copyLink:'Copiar enlace para entrevistadores', linkCopied:'Enlace para entrevistadores copiado.', copyManually:'Seleccione y copie el enlace de arriba.', shareNotice:'Solo para entrevistadores: inicie sesión con una cuenta con acceso a contratación antes de abrir este enlace. No es el enlace de invitación del candidato.', signInRequired:'Inicie sesión con una cuenta con acceso a contratación y vuelva a abrir este enlace.', readOnly:'Acceso de solo lectura: puede participar, pero no guardar transcripciones, ejecutar análisis de IA ni finalizar la sala.', muteTranscript:'Active su micrófono antes de iniciar la transcripción.', leaveNotice:'Salir solo le desconecta a usted. Los demás permanecen en la sala.', participantRole:'Participante' },
    pt:{ leave:'Sair da entrevista', endRoom:'Encerrar para todos', endConfirm:'Encerrar esta entrevista para todos? Todos serão desconectados e o link do candidato deixará de funcionar.', ending:'Encerrando entrevista…', roomEnded:'A entrevista foi encerrada para todos', disconnected:'Você foi desconectado. Pode tentar entrar novamente.', participants:'{count} online', cameraPaused:'Câmera desligada / aguardando vídeo', microphoneMuted:'Microfone silenciado', waiting:'Aguardando outros participantes…', shareInterviewer:'Link para entrevistadores', copyLink:'Copiar link para entrevistadores', linkCopied:'Link para entrevistadores copiado.', copyManually:'Selecione e copie o link acima.', shareNotice:'Somente para entrevistadores: entre com uma conta com acesso ao recrutamento antes de abrir este link. Este não é o convite do candidato.', signInRequired:'Entre com uma conta com acesso ao recrutamento e abra este link novamente.', readOnly:'Acesso somente leitura: você pode participar, mas não salvar transcrições, executar análise de IA ou encerrar a sala.', muteTranscript:'Ative seu microfone antes de iniciar a transcrição.', leaveNotice:'Sair desconecta apenas você. Os outros permanecem na sala.', participantRole:'Participante' },
    zh:{ leave:'离开面试', endRoom:'结束所有人的面试', endConfirm:'确定结束整场面试吗？所有参与者都会断开，候选人链接也将失效。', ending:'正在结束整场面试…', roomEnded:'本次面试已为所有人结束', disconnected:'连接已断开，可以尝试重新进入。', participants:'{count} 人在线', cameraPaused:'摄像头关闭 / 等待画面', microphoneMuted:'麦克风已关闭', waiting:'正在等待其他参与者…', shareInterviewer:'面试官链接', copyLink:'复制面试官链接', linkCopied:'已复制面试官链接。', copyManually:'请选择并复制上面的链接。', shareNotice:'仅供面试官：请先登录具有招聘权限的账号，再打开此链接。这里不分享候选人的一次性邀请链接。', signInRequired:'请先登录具有招聘权限的账号，再打开此面试官链接。', readOnly:'当前为招聘只读权限：可以加入通话，不能保存转写、调用 AI 分析或结束整场面试。', muteTranscript:'请先打开麦克风，再开始转写。', leaveNotice:'“离开”只断开你自己，其他人仍留在房间内。', participantRole:'参与者' }
  };
  // Kept in memory for this page only: separate tabs/devices must not evict each other.
  const participantSessionId = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
  const participants = new Map();
  let language = localStorage.getItem('quadInterview.language') || 'en';
  if (!copy[language]) language = 'en';
  let info = null, room = null, joining = false, leaving = false, sessionSecret = '', recognition = null, transcriptActive = false, micEnabled = true, cameraEnabled = true;
  let connected = false, ending = false, roomEnded = false, hasJoined = false;
  let analysisBusy = false, newEvidenceCount = 0, lastAutoAnalysisAt = 0, selectedKitId = '', selectedQuestionId = '';
  const t = (key, vars = {}) => Object.entries(vars).reduce((value, [name, replacement]) => value.replace(`{${name}}`, replacement), (recruiter && interviewerCopy[language]?.[key]) || roomCopy[language]?.[key] || copy[language][key] || roomCopy.en[key] || copy.en[key] || key);
  const qt = key => questionCopy[language]?.[key] || questionCopy.en[key] || key;
  const rt = (key, vars = {}) => Object.entries(vars).reduce((value, [name, replacement]) => value.replace(`{${name}}`, replacement), resumeCopy[language]?.[key] || resumeCopy.en[key] || key);
  const request = async (url, options = {}) => {
    const headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    if (options.auth) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetch(url, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(body.error || `${t('requestFailed')} (${response.status})`); error.code = body.code; error.status = response.status; throw error; }
    return body;
  };
  const when = value => value ? new Intl.DateTimeFormat(localeCodes[language], { dateStyle:'full', timeStyle:'short', timeZone:'America/Los_Angeles' }).format(new Date(value)) : '';
  function applyLanguage() {
    document.documentElement.lang = localeCodes[language]; $('language').value = language;
    localStorage.setItem('quadInterview.language', language);
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    $('backToRecruiting').textContent = backCopy[language] || backCopy.en;
    if (info) renderReady();
    for (const entry of participants.values()) renderParticipant(entry);
    updateParticipantCount(); updatePermissions();
    $('transcriptToggle').textContent = t(transcriptActive ? 'stopTranscript' : 'startTranscript');
    document.title = `QUAD FILM · ${t('videoInterview')}`;
  }
  function error(message) { $('error').textContent = message || ''; $('roomError').textContent = message || ''; $('connectionBadge').textContent = t('connectionFailed'); $('connectionBadge').className = 'badge warn'; }
  function renderReady() {
    $('welcomeTitle').textContent = recruiter ? t('recruiterWelcome', { name:info.candidateName }) : t('candidateWelcome', { name:info.candidateName });
    $('welcomeMeta').textContent = `${when(info.startsAt)} · ${t('minutes', { count:String(info.durationMinutes || 30) })}`;
    $('consentRow').hidden = recruiter;
    if (recruiter) $('consent').checked = true;
    $('join').disabled = joining || roomEnded || (!recruiter && !$('consent').checked);
    $('join').textContent = hasJoined ? t('reconnect') : recruiter ? t('recruiterJoin') : info.status === 'joined' ? t('reconnect') : t('join');
    $('join').hidden = roomEnded;
    if (roomEnded) { $('welcomeTitle').textContent = t('roomEnded'); $('welcomeMeta').textContent = t('safeToClose'); }
    $('connectionBadge').textContent = t(roomEnded ? 'roomEnded' : connected ? 'connected' : 'linkValid');
    $('connectionBadge').className = connected ? 'badge live' : 'badge';
    updatePermissions();
    renderCandidateResume(); renderQuestionBank(); renderTranscripts(info.aiState?.transcript || []); renderAnalysis(info.aiState?.analysis || null);
  }
  function ready(data) {
    info = data;
    $('aiPanel').hidden = !recruiter; $('questionBankPanel').hidden = !recruiter;
    $('aiBoundaryNotice').hidden = recruiter; $('candidateResumePanel').hidden = !recruiter;
    renderReady();
  }
  async function boot() {
    try {
      if (invite) return ready(await request(`/api/public/recruiting-video/invite/${encodeURIComponent(invite)}`));
      if (recruiter && !authToken) throw new Error(t('signInRequired'));
      if (interviewId && authToken) return ready(await recruiterAccess());
      throw new Error(t('connectionFailed'));
    } catch (cause) { error(recruiter && [401, 403].includes(cause.status) ? t('signInRequired') : cause.message); }
  }
  function renderTranscripts(rows) {
    const list = $('transcriptList'); list.replaceChildren();
    for (const row of rows.slice(-30)) appendTranscript(row);
  }
  function appendTranscript(row) {
    if (!row?.id || !row.text || $(`transcript-${row.id}`)) return;
    const line = document.createElement('div'); line.className = 'transcript-line'; line.id = `transcript-${row.id}`;
    const speaker = row.speaker === 'candidate' ? t('candidate') : t('interviewer');
    const label = document.createElement('strong'); label.textContent = row.speakerName ? `${row.speakerName} · ${speaker}` : speaker;
    line.dataset.participantIdentity = String(row.participantIdentity || '');
    const text = document.createElement('span'); text.textContent = row.text;
    line.append(label, text); $('transcriptList').appendChild(line); line.scrollIntoView({ block:'nearest' });
  }
  function queueRealtimeAnalysis() {
    if (!recruiter || info?.canWriteTranscript !== true || !connected || analysisBusy || !isAutoAnalysisLeader()) return;
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
  function renderCandidateResume() {
    const panel = $('candidateResumePanel');
    const profile = recruiter ? info?.candidateProfile : null;
    panel.hidden = !profile;
    if (!profile) return;
    $('candidateResumeLabel').textContent = rt('title');
    $('candidateResumeName').textContent = profile.name || info.candidateName || '';
    const file = $('candidateResumeFile');
    file.hidden = !profile.resume?.name;
    file.textContent = profile.resume?.name ? rt('attachment', { name:profile.resume.name }) : '';
    const facts = $('candidateResumeFacts'); facts.replaceChildren();
    for (const [label, value] of [[rt('position'), profile.position], [rt('location'), profile.location], [rt('source'), profile.source], [rt('availability'), profile.availability], [rt('employment'), profile.employmentType], [rt('compensation'), profile.compensation]]) {
      if (!String(value || '').trim()) continue;
      const item = document.createElement('span'); const title = document.createElement('strong');
      title.textContent = `${label}: `; item.append(title, document.createTextNode(String(value))); facts.appendChild(item);
    }
    const content = $('candidateResumeContent'); content.replaceChildren();
    const sections = [[rt('experience'), profile.experience], [rt('resources'), profile.dealershipResources], [rt('resume'), profile.resumeText], [rt('notes'), profile.notes]];
    let visible = 0;
    for (const [label, value] of sections) {
      if (!String(value || '').trim()) continue;
      visible += 1; const section = document.createElement('section'); const title = document.createElement('strong'); const text = document.createElement('p');
      title.textContent = label; text.textContent = String(value); section.append(title, text); content.appendChild(section);
    }
    if (!visible) { const empty = document.createElement('p'); empty.className = 'candidate-resume-empty'; empty.textContent = rt('missing'); content.appendChild(empty); }
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
  function participantMetadata(participant) {
    try { return JSON.parse(participant?.metadata || '{}'); } catch { return {}; }
  }
  function participantRole(participant, local = false) {
    const role = local ? (recruiter ? 'interviewer' : 'candidate') : participantMetadata(participant).role;
    return ['interviewer', 'candidate'].includes(role) ? role : 'participantRole';
  }
  function canTranscribe() { return recruiter ? info?.canWriteTranscript === true : Boolean(sessionSecret); }
  function updatePermissions() {
    $('shareInterviewer').hidden = !recruiter || !info?.interviewId || roomEnded;
    $('endRoom').hidden = !recruiter || info?.canManageRoom !== true || !connected;
    $('endRoom').disabled = ending || leaving;
    $('endRoom').textContent = t(ending ? 'ending' : 'endRoom');
    $('transcriptToggle').disabled = !connected || !canTranscribe() || ending || leaving;
    $('aiNext').disabled = !connected || !recruiter || info?.canWriteTranscript !== true || analysisBusy;
    $('aiFinal').disabled = $('aiNext').disabled;
    $('roomAccessNotice').hidden = !recruiter || info?.canWriteTranscript === true;
    $('mic').disabled = !connected || ending || leaving;
    $('camera').disabled = !connected || ending || leaving;
    $('leave').disabled = !connected || ending || leaving;
    $('leave').textContent = t(leaving ? 'leaving' : 'leave');
    $('mic').textContent = t(micEnabled ? 'micOn' : 'micOff');
    $('camera').textContent = t(cameraEnabled ? 'cameraOn' : 'cameraOff');
  }
  function isAutoAnalysisLeader() {
    if (!room || info?.canWriteTranscript !== true) return false;
    const eligible = [...participants.values()].filter(entry => participantRole(entry.participant, entry.local) === 'interviewer'
      && (entry.local ? info.canWriteTranscript === true : participantMetadata(entry.participant).canWriteTranscript === true));
    const identities = eligible.map(entry => entry.participant.identity).sort();
    return identities[0] === room.localParticipant.identity;
  }
  function updateParticipantCount() {
    const count = connected ? participants.size : 0;
    $('participantCount').textContent = t('participants', { count:String(count) });
    $('participantState').textContent = connected ? t('participants', { count:String(count) }) : t('connectingRoom');
    $('waitingParticipants').hidden = !connected || count > 1;
  }
  function renderParticipant(entry) {
    const { participant, tile, name, role, placeholder, avatar, status, local, tracks } = entry;
    const displayName = participant.name || (local ? info?.participantName : '') || t(participantRole(participant, local));
    name.textContent = `${displayName}${local ? ` (${t('you')})` : ''}`;
    role.textContent = t(participantRole(participant, local));
    avatar.textContent = displayName.trim().split(/\s+/).slice(0, 2).map(value => value[0] || '').join('').toUpperCase();
    placeholder.querySelector('span').textContent = t('cameraPaused');
    let hasVideo = false;
    for (const [track, attached] of tracks) {
      if (track.kind !== LivekitClient.Track.Kind.Video) continue;
      const visible = !attached.publication?.isMuted && !track.isMuted;
      attached.element.hidden = !visible; hasVideo ||= visible;
      if (visible && attached.element.videoWidth && attached.element.videoHeight) tile.classList.toggle('portrait-video', attached.element.videoHeight > attached.element.videoWidth * 1.08);
    }
    placeholder.hidden = hasVideo; tile.classList.toggle('camera-off', !hasVideo);
    if (!hasVideo) tile.classList.remove('portrait-video');
    status.textContent = participant.isMicrophoneEnabled === false ? t('microphoneMuted') : '';
    status.hidden = !status.textContent;
  }
  function ensureParticipant(participant, local = false) {
    if (!participant?.identity) return null;
    let entry = participants.get(participant.identity);
    if (entry) { entry.participant = participant; renderParticipant(entry); return entry; }
    const tile = local ? $('localStage') : document.createElement('article');
    tile.replaceChildren(); tile.hidden = false; tile.className = `participant-tile ${local ? 'local-stage' : 'remote-tile'}`;
    tile.dataset.participantIdentity = participant.identity;
    const media = document.createElement('div'); media.className = 'participant-media';
    const placeholder = document.createElement('div'); placeholder.className = 'participant-placeholder';
    const avatar = document.createElement('b'); const cameraText = document.createElement('span'); placeholder.append(avatar, cameraText);
    const label = document.createElement('div'); label.className = 'participant-label';
    const name = document.createElement('strong'); const role = document.createElement('span'); label.append(name, role);
    const status = document.createElement('span'); status.className = 'participant-status';
    tile.append(media, placeholder, label, status);
    if (!local) $('remoteStage').appendChild(tile);
    entry = { participant, tile, media, placeholder, avatar, name, role, status, local, tracks:new Map() };
    participants.set(participant.identity, entry); renderParticipant(entry); updateParticipantCount(); return entry;
  }
  function detachTrack(entry, track) {
    const attached = entry?.tracks.get(track);
    if (!attached) return;
    try { track.detach(attached.element); } catch {}
    attached.element.remove(); entry.tracks.delete(track);
  }
  function attachParticipantTrack(track, publication, participant, local = false) {
    const entry = ensureParticipant(participant, local);
    if (!entry || !track) return;
    const video = track.kind === LivekitClient.Track.Kind.Video;
    if (!video && (local || track.kind !== LivekitClient.Track.Kind.Audio)) return;
    if (video && publication?.source && ![LivekitClient.Track.Source.Camera, LivekitClient.Track.Source.Unknown].includes(publication.source)) return;
    if (entry.tracks.has(track)) { renderParticipant(entry); return; }
    if (video) for (const previous of [...entry.tracks.keys()]) if (previous.kind === LivekitClient.Track.Kind.Video) detachTrack(entry, previous);
    const element = track.attach(); element.autoplay = true;
    entry.tracks.set(track, { element, publication });
    if (video) {
      element.playsInline = true; element.muted = local; updateVideoAspect(element, entry.tile); entry.media.appendChild(element);
    } else {
      $('audioStage').appendChild(element); element.play()?.catch(() => {});
    }
    renderParticipant(entry);
  }
  function syncParticipant(participant, local = false) {
    const entry = ensureParticipant(participant, local); if (!entry) return;
    const camera = participant.getTrackPublication?.(LivekitClient.Track.Source.Camera);
    if (camera?.track && (local || camera.isSubscribed !== false)) attachParticipantTrack(camera.track, camera, participant, local);
    if (!local) for (const publication of participant.audioTrackPublications?.values() || []) {
      if (publication.track && publication.isSubscribed !== false) attachParticipantTrack(publication.track, publication, participant);
    }
    renderParticipant(entry);
  }
  function syncParticipants() {
    if (!room) return;
    for (const entry of [...participants.values()]) if (entry.local ? entry.participant.identity !== room.localParticipant.identity : !room.remoteParticipants.has(entry.participant.identity)) removeParticipant(entry.participant);
    syncParticipant(room.localParticipant, true);
    for (const participant of room.remoteParticipants.values()) syncParticipant(participant);
    updateParticipantCount();
  }
  function removeParticipant(participant) {
    const entry = participants.get(participant?.identity); if (!entry) return;
    for (const track of [...entry.tracks.keys()]) detachTrack(entry, track);
    if (entry.local) { entry.tile.replaceChildren(); entry.tile.hidden = true; } else entry.tile.remove();
    participants.delete(participant.identity); updateParticipantCount();
  }
  function clearParticipants() {
    for (const entry of [...participants.values()]) removeParticipant(entry.participant);
    $('audioStage').replaceChildren(); updateParticipantCount();
  }
  function recruiterAccess() {
    return request(`/api/recruiting/interviews/${encodeURIComponent(interviewId)}/video-token`, { method:'POST', auth:true, body:JSON.stringify({ participantSessionId }) });
  }
  async function tokenForJoin() {
    if (!invite) return recruiterAccess();
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(`quadInterview.${info.interviewId}`) || 'null'); } catch {}
    if (sessionSecret || (info.status === 'joined' && stored?.sessionSecret)) { sessionSecret ||= stored.sessionSecret; return request('/api/public/recruiting-video/session', { method:'POST', body:JSON.stringify({ interviewId:info.interviewId, sessionSecret }) }); }
    const data = await request(`/api/public/recruiting-video/invite/${encodeURIComponent(invite)}/exchange`, { method:'POST', body:JSON.stringify({ consent:true }) });
    sessionSecret = data.sessionSecret; localStorage.setItem(`quadInterview.${data.interviewId}`, JSON.stringify({ sessionSecret, expiresAt:data.expiresAt })); return data;
  }
  async function join() {
    if (!info || joining || leaving || ending || connected || roomEnded || (!$('consent').checked && invite)) return;
    if (!window.LivekitClient?.isBrowserSupported?.()) return error(t('unsupported'));
    joining = true; $('join').disabled = true; $('join').textContent = t('connecting'); $('error').textContent = ''; $('roomError').textContent = '';
    let joiningRoom = null;
    try {
      await disconnectLocal();
      const access = await tokenForJoin(); info = { ...info, ...access };
      joiningRoom = new LivekitClient.Room({ adaptiveStream:true, dynacast:true, disconnectOnPageLeave:true }); room = joiningRoom;
      const on = (event, callback) => joiningRoom.on(event, (...args) => { if (room === joiningRoom) callback(...args); });
      on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => attachParticipantTrack(track, publication, participant));
      on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, _publication, participant) => { const entry = participants.get(participant?.identity); if (entry) { detachTrack(entry, track); renderParticipant(entry); } });
      on(LivekitClient.RoomEvent.TrackUnpublished, (publication, participant) => { const entry = participants.get(participant?.identity); if (entry) { for (const [track, attached] of [...entry.tracks]) if (attached.publication === publication || track === publication.track) detachTrack(entry, track); renderParticipant(entry); } });
      on(LivekitClient.RoomEvent.ParticipantConnected, participant => syncParticipant(participant));
      on(LivekitClient.RoomEvent.ParticipantDisconnected, removeParticipant);
      for (const event of [LivekitClient.RoomEvent.ParticipantNameChanged, LivekitClient.RoomEvent.ParticipantMetadataChanged]) on(event, (_value, participant) => syncParticipant(participant, participant?.identity === room.localParticipant.identity));
      for (const event of [LivekitClient.RoomEvent.TrackMuted, LivekitClient.RoomEvent.TrackUnmuted]) on(event, (_publication, participant) => syncParticipant(participant, participant?.identity === room.localParticipant.identity));
      on(LivekitClient.RoomEvent.LocalTrackPublished, publication => attachParticipantTrack(publication.track, publication, room.localParticipant, true));
      on(LivekitClient.RoomEvent.LocalTrackUnpublished, publication => { const entry = participants.get(room.localParticipant.identity); if (entry) { for (const [track, attached] of [...entry.tracks]) if (attached.publication === publication || track === publication.track) detachTrack(entry, track); renderParticipant(entry); } });
      on(LivekitClient.RoomEvent.DataReceived, (payload, participant) => receiveTranscript(payload, participant));
      on(LivekitClient.RoomEvent.Reconnecting, () => { $('connectionBadge').textContent = t('reconnecting'); $('connectionBadge').className = 'badge warn'; });
      on(LivekitClient.RoomEvent.Reconnected, () => { syncParticipants(); $('connectionBadge').textContent = t('connected'); $('connectionBadge').className = 'badge live'; });
      on(LivekitClient.RoomEvent.Disconnected, reason => {
        roomEnded ||= [LivekitClient.DisconnectReason.ROOM_DELETED, LivekitClient.DisconnectReason.ROOM_CLOSED].includes(reason);
        disconnectLocal(); showDisconnected();
      });
      await joiningRoom.connect(access.url, access.token);
      if (room !== joiningRoom) throw new Error(t('disconnected'));
      await joiningRoom.localParticipant.setCameraEnabled(true);
      if (room !== joiningRoom) throw new Error(t('disconnected'));
      await joiningRoom.localParticipant.setMicrophoneEnabled(true, { echoCancellation:true, noiseSuppression:true, autoGainControl:true });
      if (room !== joiningRoom) throw new Error(t('disconnected'));
      connected = true; hasJoined = true; micEnabled = true; cameraEnabled = true; syncParticipants(); updatePermissions();
      $('welcome').hidden = true; $('roomView').hidden = false; $('connectionBadge').textContent = t('connected'); $('connectionBadge').className = 'badge live'; renderTranscripts(access.aiState?.transcript || []); renderAnalysis(access.aiState?.analysis || null);
      if (!transcriptActive && canTranscribe()) startTranscript();
    } catch (cause) {
      stopLocalTracks(joiningRoom);
      if (!joiningRoom || room === joiningRoom) await disconnectLocal();
      $('welcome').hidden = false; $('roomView').hidden = true; error(recruiter && [401, 403].includes(cause.status) ? t('signInRequired') : cause.message);
      $('join').disabled = roomEnded; $('join').hidden = roomEnded; $('join').textContent = t('retry');
    } finally { joining = false; updatePermissions(); }
  }
  function rememberTranscript(row) {
    if (!row?.id || !String(row.text || '').trim()) return false;
    info.aiState ||= {}; info.aiState.transcript ||= [];
    if (info.aiState.transcript.some(item => item.id === row.id)) return false;
    info.aiState.transcript.push(row);
    info.aiState.transcript = info.aiState.transcript.slice(-300); appendTranscript(row); return true;
  }
  function receiveTranscript(payload, participant) {
    // A peer may send arbitrary data. Its signed room identity, not its payload, identifies the speaker.
    if (!participant?.identity || !room?.remoteParticipants.has(participant.identity)) return;
    const role = participantRole(participant); if (!['candidate', 'interviewer'].includes(role)) return;
    try {
      const value = JSON.parse(new TextDecoder().decode(payload));
      if (value.type !== 'transcript' || typeof value.row?.id !== 'string' || value.row.id.length > 200 || typeof value.row.text !== 'string' || !value.row.text.trim() || value.row.text.length > 2000) return;
      if (value.row.participantIdentity !== participant.identity) return;
      if (role === 'interviewer' && participantMetadata(participant).canWriteTranscript !== true) return;
      const row = { id:value.row.id, text:value.row.text, language:String(value.row.language || '').slice(0, 20), createdAt:value.row.createdAt,
        speaker:role, speakerName:participant.name || t(role), participantIdentity:participant.identity };
      if (rememberTranscript(row)) queueRealtimeAnalysis();
    } catch {}
  }
  async function saveTranscript(text) {
    if (!connected || !room || !canTranscribe() || !text.trim()) return;
    const activeRoom = room;
    const body = { id:`${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`, text, language, participantSessionId,
      speakerName:info.participantName || activeRoom.localParticipant.name || '', participantIdentity:info.participantIdentity || activeRoom.localParticipant.identity };
    const data = recruiter
      ? await request(`/api/recruiting/interviews/${encodeURIComponent(info.interviewId)}/video-transcript`, { method:'POST', auth:true, body:JSON.stringify(body) })
      : await request('/api/public/recruiting-video/transcript', { method:'POST', body:JSON.stringify({ ...body, interviewId:info.interviewId, sessionSecret }) });
    if (room !== activeRoom || !connected || !data.row) return;
    // Broadcast only the server-attributed row, without private account identifiers.
    const { id, speaker, speakerName, participantIdentity, text:savedText, language:savedLanguage, createdAt } = data.row;
    const row = { id, speaker, speakerName, participantIdentity, text:savedText, language:savedLanguage, createdAt };
    rememberTranscript(row);
    activeRoom.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type:'transcript', row })), { reliable:true }).catch(() => {});
    queueRealtimeAnalysis();
  }
  function startTranscript() {
    if (!connected || !canTranscribe()) return;
    if (transcriptActive) { stopTranscript(); return; }
    if (!micEnabled) { $('transcriptStatus').textContent = t('muteTranscript'); return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { $('transcriptStatus').textContent = t('transcriptUnavailable'); return; }
    recognition = new SpeechRecognition(); recognition.continuous = true; recognition.interimResults = true; recognition.lang = localeCodes[language]; transcriptActive = true;
    const activeRecognition = recognition;
    recognition.onresult = event => { if (recognition !== activeRecognition || !transcriptActive || !micEnabled) return; for (let index = event.resultIndex; index < event.results.length; index++) if (event.results[index].isFinal) saveTranscript(event.results[index][0].transcript.trim()).catch(cause => { $('transcriptStatus').textContent = cause.message; }); };
    recognition.onend = () => { if (recognition === activeRecognition && transcriptActive && connected && canTranscribe()) try { activeRecognition.start(); } catch {} };
    recognition.onerror = event => {
      if (recognition !== activeRecognition) return;
      if (['not-allowed', 'service-not-allowed'].includes(event.error)) {
        transcriptActive = false; $('transcriptToggle').textContent = t('startTranscript'); $('transcriptStatus').textContent = transcriptBlocked[language] || transcriptBlocked.en;
      } else if (!['no-speech', 'aborted'].includes(event.error)) $('transcriptStatus').textContent = event.error;
    };
    try {
      recognition.start(); $('transcriptToggle').textContent = t('stopTranscript'); $('transcriptStatus').textContent = t('transcriptOn');
    } catch {
      transcriptActive = false; recognition = null; $('transcriptToggle').textContent = t('startTranscript'); $('transcriptStatus').textContent = t('transcriptUnavailable');
    }
  }
  function stopTranscript() {
    transcriptActive = false;
    const previous = recognition; recognition = null;
    try { previous?.stop(); } catch {}
    $('transcriptToggle').textContent = t('startTranscript'); $('transcriptStatus').textContent = t('transcriptOff');
  }
  async function analyze(mode, automatic = false) {
    if (analysisBusy || !connected || !recruiter || info?.canWriteTranscript !== true || (automatic && !isAutoAnalysisLeader())) return;
    analysisBusy = true;
    updatePermissions(); $('aiStatus').textContent = t('aiWorking');
    try { const data = await request(`/api/recruiting/interviews/${encodeURIComponent(info.interviewId)}/video-analyze`, { method:'POST', auth:true, body:JSON.stringify({ mode }) }); info.aiState ||= {}; info.aiState.analysis = data.aiState?.analysis; renderAnalysis(data.aiState?.analysis); $('aiStatus').textContent = t('aiReady'); }
    catch { $('aiStatus').textContent = t('aiFailed'); if (automatic) lastAutoAnalysisAt = 0; } finally { analysisBusy = false; updatePermissions(); }
  }
  function stopLocalTracks(activeRoom) {
    for (const publication of activeRoom?.localParticipant?.trackPublications?.values() || []) {
      try { publication.track?.stop(); } catch {}
    }
  }
  async function disconnectLocal() {
    const previous = room; room = null; connected = false;
    stopTranscript(); stopLocalTracks(previous); clearParticipants(); updatePermissions();
    try { await Promise.race([Promise.resolve(previous?.disconnect(true)), new Promise(resolve => setTimeout(resolve, 1500))]); } catch {}
  }
  function showDisconnected() {
    $('roomView').hidden = true; $('welcome').hidden = false;
    $('consentRow').hidden = recruiter || roomEnded;
    $('join').hidden = roomEnded; $('join').disabled = roomEnded || (!recruiter && !$('consent').checked); $('join').textContent = t('reconnect');
    $('welcomeTitle').textContent = t(roomEnded ? 'roomEnded' : 'interviewEnded');
    $('welcomeMeta').textContent = t('safeToClose'); $('connectionBadge').textContent = t(roomEnded ? 'roomEnded' : 'interviewEnded'); $('connectionBadge').className = 'badge';
    if (roomEnded) { $('interviewerShare').hidden = true; if (invite && info?.interviewId) localStorage.removeItem(`quadInterview.${info.interviewId}`); }
    updatePermissions();
  }
  async function leaveInterview() {
    if (leaving || ending) return;
    leaving = true; updatePermissions();
    try { await disconnectLocal(); showDisconnected(); }
    finally { leaving = false; updatePermissions(); }
  }
  async function endInterviewForEveryone() {
    if (!connected || !recruiter || info?.canManageRoom !== true || ending || leaving) return;
    if (!window.confirm(t('endConfirm'))) return;
    ending = true; updatePermissions(); $('roomError').textContent = '';
    try {
      await request(`/api/recruiting/interviews/${encodeURIComponent(info.interviewId)}/video-end`, { method:'POST', auth:true, body:'{}' });
      roomEnded = true; await disconnectLocal(); showDisconnected();
    } catch (cause) { error(cause.message); }
    finally { ending = false; updatePermissions(); }
  }
  function showInterviewerLink() {
    if (!recruiter || !info?.interviewId || roomEnded) return;
    const url = new URL('/recruiting-interview.html', location.origin);
    url.searchParams.set('interview', info.interviewId);
    $('interviewerLink').value = url.href; $('shareStatus').textContent = ''; $('interviewerShare').hidden = !$('interviewerShare').hidden;
  }
  async function copyInterviewerLink() {
    if (!recruiter || !info?.interviewId || roomEnded) return;
    try { await navigator.clipboard.writeText($('interviewerLink').value); $('shareStatus').textContent = t('linkCopied'); }
    catch { $('interviewerLink').focus(); $('interviewerLink').select(); $('shareStatus').textContent = t('copyManually'); }
  }
  async function toggleDevice(device) {
    if (!connected || !room || ending || leaving) return;
    const activeRoom = room; const button = $(device); button.disabled = true;
    try {
      if (device === 'mic') await activeRoom.localParticipant.setMicrophoneEnabled(!activeRoom.localParticipant.isMicrophoneEnabled);
      else await activeRoom.localParticipant.setCameraEnabled(!activeRoom.localParticipant.isCameraEnabled);
      if (room !== activeRoom) { stopLocalTracks(activeRoom); return; }
      micEnabled = activeRoom.localParticipant.isMicrophoneEnabled; cameraEnabled = activeRoom.localParticipant.isCameraEnabled;
      if (!micEnabled && transcriptActive) stopTranscript();
      syncParticipant(activeRoom.localParticipant, true);
    } catch (cause) { if (room === activeRoom) $('roomError').textContent = cause.message; }
    finally { updatePermissions(); }
  }
  $('language').addEventListener('change', event => { language = event.target.value; applyLanguage(); if (recognition && transcriptActive) { recognition.stop(); recognition.lang = localeCodes[language]; } });
  $('backToRecruiting').hidden = !recruiter;
  $('backToRecruiting').addEventListener('click', () => window.location.assign('/?page=recruiting'));
  $('consent').addEventListener('change', () => { if (invite) $('join').disabled = !$('consent').checked || !info || joining || roomEnded; });
  $('join').addEventListener('click', join); $('transcriptToggle').addEventListener('click', startTranscript); $('aiNext').addEventListener('click', () => analyze('next')); $('aiFinal').addEventListener('click', () => analyze('final'));
  $('mic').addEventListener('click', () => toggleDevice('mic'));
  $('camera').addEventListener('click', () => toggleDevice('camera'));
  $('leave').addEventListener('click', leaveInterview);
  $('endRoom').addEventListener('click', endInterviewForEveryone);
  $('shareInterviewer').addEventListener('click', showInterviewerLink);
  $('copyInterviewerLink').addEventListener('click', copyInterviewerLink);
  window.addEventListener('pagehide', () => { stopTranscript(); stopLocalTracks(room); room?.disconnect(true); });
  applyLanguage(); boot();
})();
