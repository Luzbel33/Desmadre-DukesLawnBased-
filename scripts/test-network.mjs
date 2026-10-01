// Starts a disposable localhost server and uses real WebSocket clients. Node 22+ for native WebSocket.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOCOL } from '../public/js/shared/mapdata.js';
if(typeof WebSocket==='undefined')throw new Error('Esta prueba requiere Node 22+ (el juego no necesita WebSocket nativo de Node).');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dukes-network-'));
const server=spawn(process.execPath,['server/server.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
const peers=[],report={http:[],checks:[]};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label,ms=4000){const start=Date.now();while(Date.now()-start<ms){const v=check();if(v)return v;await sleep(20);}throw new Error('Timeout: '+label);}
async function peer(name){
 const ws=new WebSocket(`ws://127.0.0.1:${port}/ws?sala=qa-audio`),messages=[];
 ws.addEventListener('message',e=>{if(typeof e.data==='string')messages.push(JSON.parse(e.data));});
 const p={ws,messages,send:m=>ws.send(JSON.stringify(m)),latest:()=>[...messages].reverse().find(m=>m.t==='ms'&&m.s==='cine')?.st};peers.push(p);
 await until(()=>ws.readyState===1,'socket open');p.send({t:'join',v:PROTOCOL,name,look:{}});
 await until(()=>messages.some(m=>m.t==='ready'),'room ready');return p;
}
try{
 await until(()=>log.includes('servidor andando'),'server startup');
 for(const file of ['/health','/','/js/audio/audio.js','/js/audio/synthesis.js','/js/media/screens.js','/js/media/playback.js','/js/media/youtube.js','/vendor/three/addons/renderers/CSS3DRenderer.js']){
  const r=await fetch(`http://127.0.0.1:${port}${file}`);assert.equal(r.status,200,file);report.http.push(file);
  if(file==='/'){assert.equal(r.headers.get('referrer-policy'),'strict-origin-when-cross-origin');assert.match(await r.text(),/id="media"/);}
 }
 const a=await peer('QA A'),b=await peer('QA B');
 a.send({t:'media',s:'cine',a:'add',v:'M7lc1UVf-VE'});
 const first=await until(()=>b.latest()?.cur?.v==='M7lc1UVf-VE'&&b.latest().cur,'shared video');assert.ok(first.playId);report.checks.push('add shared across 2 clients');
 a.send({t:'media',s:'cine',a:'pause'});await until(()=>b.latest()?.cur?.paused,'pause');assert.ok(b.latest().cur.pos>=0);report.checks.push('pause shared; nonnegative early position');
 a.send({t:'media',s:'cine',a:'seek',pos:25});await until(()=>b.latest()?.cur?.pos===25,'seek');report.checks.push('paused seek shared');
 const c=await peer('QA C');const welcome=c.messages.find(m=>m.t==='welcome');assert.equal(welcome.media.cine.cur.playId,first.playId);assert.equal(welcome.media.cine.cur.pos,25);report.checks.push('late join receives video, playbackId, pause and position');
 b.send({t:'media',s:'cine',a:'play'});await until(()=>a.latest()?.cur?.paused===false,'resume');report.checks.push('resume shared');
 a.send({t:'media',s:'cine',a:'add',v:'M7lc1UVf-VE'});await until(()=>b.latest()?.queue?.length===1,'same-video queued');
 b.send({t:'media',s:'cine',a:'error',v:first.v,playId:first.playId});await sleep(150);assert.equal(b.latest().cur.playId,first.playId);report.checks.push('local playback error does not skip for others');
 a.send({t:'media',s:'cine',a:'skip'});const second=await until(()=>b.latest()?.cur?.playId!==first.playId&&b.latest()?.cur,'manual skip');assert.equal(second.v,first.v);
 a.send({t:'media',s:'cine',a:'seek',pos:55});await until(()=>b.latest()?.cur?.start<Date.now()-50000,'set active time');
 b.send({t:'media',s:'cine',a:'ended',v:first.v,playId:first.playId});await sleep(150);assert.equal(b.latest().cur.playId,second.playId);report.checks.push('stale end notification cannot skip repeated video');
 b.send({t:'media',s:'cine',a:'ended',v:second.v,playId:second.playId});await until(()=>a.latest()?.cur===null,'correct ending');report.checks.push('correct ending empties queue for all');
 a.send({t:'chat',m:'audio qa'});await until(()=>b.messages.some(m=>m.t==='chat'&&m.m==='audio qa'),'chat');report.checks.push('chat regression');
 a.send({t:'st',s:{p:[1,0,2],y:0,eq:1}});await until(()=>b.messages.some(m=>m.t==='snap'&&m.P?.some(x=>x[1].eq===1)),'position/equipment');report.checks.push('state/equipment regression');
 report.clients=3;report.result='PASS';console.log(JSON.stringify(report,null,2));
}finally{
 for(const p of peers)p.ws.close();await sleep(100);server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});
}
