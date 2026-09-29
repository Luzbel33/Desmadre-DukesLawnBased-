// Disposable loopback server with a random test-only owner key and real sockets.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROTOCOL} from '../public/js/shared/mapdata.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dukes-demon-test-')),key=randomBytes(24).toString('hex');
const server=spawn(process.execPath,['server/server.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,OWNER_KEY:key},stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
const peers=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){const start=Date.now();while(Date.now()-start<4000){const v=check();if(v)return v;await sleep(20);}throw new Error('Timeout: '+label);}
async function peer(name,model,key){
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws?sala=qa-demon`),messages=[];
  ws.addEventListener('message',e=>{if(typeof e.data==='string')messages.push(JSON.parse(e.data));});
  const p={ws,messages,send:m=>ws.send(JSON.stringify(m))};peers.push(p);
  await until(()=>ws.readyState===1,'open');p.send({t:'join',v:PROTOCOL,name,look:{model},key});
  await until(()=>messages.some(m=>m.t==='ready'),'ready');p.id=messages.find(m=>m.t==='welcome').id;return p;
}
try{
  await until(()=>log.includes('servidor andando'),'startup');
  for(const asset of ['assets/chars/cookie.glb','assets/chars/diablo.glb','js/game/owner.js','js/fx/demon-fire.js','js/shared/demon-fire.js'])assert.equal((await fetch(`http://127.0.0.1:${port}/${asset}`)).status,200,asset);
  const a=await peer('SmokePyro','diablo',key),b=await peer('Galletita','galleta');
  assert.equal(a.messages.find(m=>m.t==='welcome').owner,1);
  a.send({t:'st',s:{p:[0,0,0]}});b.send({t:'st',s:{p:[0,0,4]}});
  a.send({t:'pow',a:'fire',v:1,d:[0,-.2,1]});await until(()=>b.messages.some(m=>m.a==='fire'),'breath aim');
  a.send({t:'pow',a:'ball',shot:'1',o:[0,2,0],d:[0,0,1]});await until(()=>b.messages.some(m=>m.a==='ball'),'projectile');
  a.send({t:'ev',k:'burn',mode:'ball',shot:'1',to:b.id,s:1,p:[0,1,4]});await until(()=>b.messages.some(m=>m.k==='burn'),'impact');
  b.send({t:'ev',k:'onfire',d:3.2});await until(()=>a.messages.some(m=>m.k==='onfire'),'victim burning');
  a.send({t:'pow',a:'patch',p:[0,0,5],n:[0,1,0]});await until(()=>b.messages.some(m=>m.a==='patch'),'surface fire');
  const c=await peer('Tercero','eric');const fires=c.messages.find(m=>m.t==='welcome').fires;
  assert.equal(fires.length,1);assert.ok(fires[0].life>0&&fires[0].life<=6);
  await sleep(6200);const d=await peer('Cuarto','eric');assert.equal(d.messages.find(m=>m.t==='welcome').fires.length,0);
  a.send({t:'look',look:{model:'galleta'}});await until(()=>b.messages.some(m=>m.t==='look'&&m.id===a.id&&m.look.model==='galleta'),'model switch');
  b.messages.length=0;a.send({t:'pow',a:'ball',shot:'2',o:[0,2,0],d:[0,0,1]});await sleep(120);
  assert.ok(!b.messages.some(m=>m.a==='ball'),'powers revoked when leaving Diablo');
  console.log('PASS: 4 real WebSocket clients; breath, ball, impact, burn, late-join flames, expiry and model switch.');
}finally{
  for(const p of peers)p.ws.close();await sleep(100);server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));
  // Only this script's newly-created temporary directory can be removed.
  if(path.dirname(dir)===os.tmpdir()&&path.basename(dir).startsWith('dukes-demon-test-'))fs.rmSync(dir,{recursive:true,force:true});
}
