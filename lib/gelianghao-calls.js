// Same LiveKit account/SDK as QUAD, with private identities, rooms and storage.
const { randomUUID } = require('crypto');
function liveKitTransport() {
  const configured = () => Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
  const client = () => {
    const { RoomServiceClient } = require('livekit-server-sdk');
    return new RoomServiceClient(process.env.LIVEKIT_URL.replace(/^ws/, 'http'), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { requestTimeout: 5 });
  };
  return {
    configured,
    origins() { try { const url = new URL(process.env.LIVEKIT_URL); return [url.origin, url.origin.replace(/^ws/, 'http')]; } catch { return []; } },
    async token(call, user) {
      const { AccessToken, TrackSource } = require('livekit-server-sdk');
      const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
        identity: `glh-${user.id}`, name: user.name, ttl: '5m', metadata: JSON.stringify({ callId: call.id, scope: 'friends' })
      });
      token.addGrant({ roomJoin: true, room: call.roomName, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: [TrackSource.MICROPHONE] });
      return { url: process.env.LIVEKIT_URL, token: await token.toJwt() };
    },
    async remove(call, userId) { if (configured()) await client().removeParticipant(call.roomName, `glh-${userId}`); },
    async end(call) { if (configured()) await client().deleteRoom(call.roomName); }
  };
}
function createFriendCalls({ db, member, fail, body, json, limit, clients, transport = liveKitTransport() }) {
  db.exec('CREATE TABLE IF NOT EXISTS friend_calls(id TEXT PRIMARY KEY, payload TEXT NOT NULL, created INTEGER NOT NULL)');
  const all = () => db.prepare('SELECT payload FROM friend_calls ORDER BY created DESC').all().map(r => JSON.parse(r.payload));
  const live = c => ['ringing', 'active'].includes(c.status);
  const involved = (c,id) => c.callerUserId === id || c.participantUserIds.includes(id);
  const joined = (c,id) => c.participantStatuses[id] === 'joined';
  const terminal = c => !live(c);
  const save = c => db.prepare('INSERT OR REPLACE INTO friend_calls VALUES(?,?,?)').run(c.id, JSON.stringify(c), Date.parse(c.createdAt));
  const now = () => new Date().toISOString();
  function broadcast(call) { for (const client of clients) if (involved(call,client.userId)) { try { client.res.write(`event: voice-call\ndata: ${JSON.stringify({call})}\n\n`); } catch { clients.delete(client); } } }
  function detach(call,id) { Promise.resolve().then(() => transport.remove(call,id)).catch(() => {}); }
  function finish(call,status='ended') { call.status=status;call.endedAt=now();call.durationSeconds=call.answeredAt?Math.max(0,Math.round((Date.now()-Date.parse(call.answeredAt))/1000)):0;for(const id of Object.keys(call.participantStatuses))if(['ringing','invited'].includes(call.participantStatuses[id]))call.participantStatuses[id]='missed';Promise.resolve().then(()=>transport.end(call)).catch(()=>{}); }
  function expire() {
    for (const c of all()) {
      if (live(c)) {
        let changed=false;
        for (const [id,status] of Object.entries(c.participantStatuses)) {
          if (['ringing','invited'].includes(status) && Date.now()-(c.invitedAt[id]||Date.parse(c.createdAt))>=45000) { c.participantStatuses[id]='missed';changed=true; }
          if (status==='joined' && Date.now()-(c.lastSeen[id]||Date.parse(c.createdAt))>90000) { c.participantStatuses[id]='left';detach(c,id);changed=true; }
        }
        const states=Object.values(c.participantStatuses),waiting=states.some(s=>['ringing','invited'].includes(s)),count=states.filter(s=>s==='joined').length;
        if ((c.status==='ringing'&&!waiting)||(c.status==='active'&&count<2&&!waiting)||Date.now()-Date.parse(c.createdAt)>2*3600000) { finish(c,c.status==='ringing'?'missed':'ended');changed=true; }
        if(changed){save(c);broadcast(c);}
      }
    }
    db.prepare('DELETE FROM friend_calls WHERE created<=?').run(Date.now()-86400000);
  }
  const users = ids => ids.map(id=>db.prepare('SELECT id,name FROM users WHERE id=?').get(id));
  function checkPeople(room,ids,self) {
    if (!Array.isArray(ids)||!ids.length||ids.length>29) fail(400,'请选择要呼叫的朋友');
    const unique=[...new Set(ids)];if(unique.some(id=>typeof id!=='string'||id===self))fail(400,'通话成员无效');
    for(const id of unique)member(room,id);
    return unique;
  }
  function busy(id,except) {return all().some(c=>c.id!==except&&live(c)&&['joined','ringing','invited'].includes(c.participantStatuses[id]));}
  async function handle(req,res,user,p) {
    const match=p.match(/^\/api\/voice-calls(?:\/([^/]+))?(?:\/(token|heartbeat))?$/);if(!match)return false;
    expire();const [,id,operation]=match;
    if(req.method==='GET'&&!id){json(res,200,{configured:transport.configured(),calls:all().filter(c=>involved(c,user.id))});return true;}
    if(req.method==='POST'&&!id){
      if(!transport.configured())fail(503,'现有实时通话服务尚未配置');limit(`call:${user.id}`,10,60000);
      const b=await body(req);member(String(b.roomId||''),user.id);const ids=checkPeople(b.roomId,b.participantUserIds,user.id);
      if(busy(user.id)||ids.some(id=>busy(id)))fail(409,'你或朋友正在另一通电话中，请稍后再试');
      const people=users(ids),call={id:randomUUID(),roomName:`glh-${randomUUID()}`,chatRoomId:b.roomId,callerUserId:user.id,callerName:user.name,participantUserIds:ids,participantNames:people.map(p=>p.name),participantStatuses:{[user.id]:'joined',...Object.fromEntries(ids.map(id=>[id,'ringing']))},invitedAt:Object.fromEntries(ids.map(id=>[id,Date.now()])),lastSeen:{[user.id]:Date.now()},status:'ringing',createdAt:now(),answeredAt:'',endedAt:'',recording:false};
      save(call);broadcast(call);json(res,201,{call});return true;
    }
    const c=all().find(c=>c.id===id);if(!c||!involved(c,user.id))fail(404,'通话不存在或你没有访问权限');member(c.chatRoomId,user.id);
    if(req.method==='POST'&&operation==='token'){
      if(!transport.configured())fail(503,'实时通话服务不可用');if(!live(c)||!joined(c,user.id))fail(403,'请先接听有效的通话');
      const credentials=await transport.token(c,user);const latest=all().find(x=>x.id===id);if(!latest||!live(latest)||!joined(latest,user.id))fail(409,'通话已经结束');json(res,200,{...credentials,call:latest});return true;
    }
    if(req.method==='POST'&&operation==='heartbeat') { if(live(c)&&joined(c,user.id)){c.lastSeen[user.id]=Date.now();save(c);}json(res,200,{call:c});return true; }
    if(req.method==='PUT'&&!operation){
      const b=await body(req);if(!live(c))fail(409,'通话已经结束');const action=b.action;
      if(action==='accept') { if(!['ringing','invited'].includes(c.participantStatuses[user.id])||c.callerUserId===user.id)fail(409,'来电已被处理');c.participantStatuses[user.id]='joined';c.lastSeen[user.id]=Date.now();c.status='active';c.answeredAt ||= now(); }
      else if(action==='decline') { if(!['ringing','invited'].includes(c.participantStatuses[user.id]))fail(409,'来电已被处理');c.participantStatuses[user.id]='declined';if(c.participantUserIds.every(id=>!['ringing','invited','joined'].includes(c.participantStatuses[id])))finish(c,'declined'); }
      else if(action==='end') { if(c.callerUserId!==user.id)fail(403,'只有发起人可以结束整场通话');finish(c,c.status==='ringing'?'missed':'ended'); }
      else if(action==='leave') { if(!joined(c,user.id))fail(403,'你没有加入通话');c.participantStatuses[user.id]='left';detach(c,user.id);if((c.status==='ringing'&&user.id===c.callerUserId)||Object.values(c.participantStatuses).filter(s=>s==='joined').length<2){finish(c,c.status==='ringing'?'missed':'ended');} }
      else if(action==='invite') { if(!joined(c,user.id))fail(403,'只有通话中的成员可以邀请');const ids=checkPeople(c.chatRoomId,b.participantUserIds,user.id);if(ids.some(id=>busy(id,c.id)))fail(409,'朋友正在另一通电话中');for(const id of ids){if(joined(c,id))continue;c.participantStatuses[id]='ringing';c.invitedAt[id]=Date.now();if(!c.participantUserIds.includes(id)&&id!==c.callerUserId)c.participantUserIds.push(id);}c.participantNames=users(c.participantUserIds).map(u=>u.name); }
      else fail(400,'不支持该通话操作');
      save(c);broadcast(c);json(res,200,{call:c});return true;
    }
    fail(405,'不支持该请求');
  }
  return {handle,expire,configured:transport.configured,origins:transport.origins};
}
module.exports={createFriendCalls,liveKitTransport};
