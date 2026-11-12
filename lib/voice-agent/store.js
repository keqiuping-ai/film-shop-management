'use strict';
const fs = require('node:fs');
const path = require('node:path');
const initial = () => ({version:1, stopped:true, tasks:[], calls:[], audit:[], employees:[{id:'business',name:'AI商务助理',enabled:true}], limits:{dailyCalls:10,maxSeconds:180,dailyBudget:5,reservePerMinute:1,concurrency:1}});
// One state row is the serializable MVP aggregate. PostgreSQL row locks protect
// duplicate claims across workers. No network operations occur inside mutate.
class Store {
 constructor({file=path.join(process.cwd(),'data','voice.json'),databaseUrl=process.env.VOICE_DATABASE_URL}={}){this.file=file;this.tail=Promise.resolve();this.databaseUrl=databaseUrl;}
 async init(){
  if(this.databaseUrl){const {Pool}=require('pg');this.pool=new Pool({connectionString:this.databaseUrl});await this.pool.query('CREATE TABLE IF NOT EXISTS quad_voice_state (id integer PRIMARY KEY CHECK(id=1), payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');await this.pool.query('INSERT INTO quad_voice_state(id,payload) VALUES(1,$1) ON CONFLICT DO NOTHING',[initial()]);}
  else {fs.mkdirSync(path.dirname(this.file),{recursive:true});if(!fs.existsSync(this.file))this.save(initial());JSON.parse(fs.readFileSync(this.file,'utf8'));}
  return this;
 }
 save(state){const tmp=this.file+'.tmp';const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(state));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,this.file);const dir=fs.openSync(path.dirname(this.file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
 async read(){if(this.pool)return (await this.pool.query('SELECT payload FROM quad_voice_state WHERE id=1')).rows[0].payload;await this.tail;return JSON.parse(fs.readFileSync(this.file,'utf8'));}
 mutate(fn){const job=this.tail.then(async()=>{if(this.pool){const c=await this.pool.connect();try{await c.query('BEGIN');const state=(await c.query('SELECT payload FROM quad_voice_state WHERE id=1 FOR UPDATE')).rows[0].payload;const result=fn(state);if(result?.then)throw Error('Mutation must be synchronous');await c.query('UPDATE quad_voice_state SET payload=$1, updated_at=now() WHERE id=1',[state]);await c.query('COMMIT');return structuredClone(result);}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}const state=JSON.parse(fs.readFileSync(this.file,'utf8'));const result=fn(state);if(result?.then)throw Error('Mutation must be synchronous');this.save(state);return structuredClone(result);});this.tail=job.catch(()=>{});return job;}
 async close(){await this.tail;await this.pool?.end();}
}
module.exports={Store,initial};
