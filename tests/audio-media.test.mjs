import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Room } from '../server/room.js';
import { SCREENS } from '../public/js/shared/mapdata.js';
import { VoiceChat } from '../public/js/audio/voice.js';
const helpers = await import('../public/js/media/youtube.js').catch(() => null);
const playback = await import('../public/js/media/playback.js').catch(() => null);
const synth = await import('../public/js/audio/synthesis.js').catch(() => null);
const audio = await import('../public/js/audio/audio.js').catch(() => null);
const requireModule = m => assert.ok(m, 'El subsistema aún no está implementado');

test('la voz recibida antes de activar sonido se conecta al crear el contexto', () => {
  const previousAudio = globalThis.Audio;
  globalThis.Audio = class { play() { return Promise.resolve(); } };
  let ctx = null;
  const node = () => ({ context: ctx, gain: { value: 1 }, connect() {}, disconnect() {}, fftSize: 512 });
  const voice = new VoiceChat({ net: {}, opts: {}, getCtx: () => ctx });
  const peer = { id: 1, nodes: null };
  voice.peers.set(1, peer);
  const stream = {};
  try {
    voice._attachRemote(peer, stream);
    assert.equal(peer.nodes, null);
    ctx = { destination: {}, listener: {}, createGain: node, createAnalyser: node, createPanner: node, createMediaStreamSource: node };
    voice._rms = () => 0;
    voice.update({ matrixWorld: { elements: Array(16).fill(0) }, position: { x: 0, y: 0, z: 0 } }, null, new Map());
    assert.ok(peer.nodes);
    assert.equal(peer.stream, stream);
    assert.equal(peer.nodes.src.context, ctx);
  } finally { globalThis.Audio = previousAudio; }
});

test('YouTube IDs: allow genuine video URLs; reject arbitrary domains and playlist-only URLs', () => {
  requireModule(helpers);
  for (const s of ['M7lc1UVf-VE','https://youtu.be/M7lc1UVf-VE?t=3','https://www.youtube.com/watch?v=M7lc1UVf-VE&list=123', 'https://youtube.com/shorts/M7lc1UVf-VE','https://m.youtube.com/live/M7lc1UVf-VE']) assert.equal(helpers.youtubeId(s),'M7lc1UVf-VE');
  for (const s of ['https://example.com/?v=M7lc1UVf-VE','https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','https://youtube.com/playlist?list=PLabc','', 'not a video']) assert.equal(helpers.youtubeId(s),null);
});
test('shared playback time: pause, future start, duration bounds and invalid data', () => {
  requireModule(helpers);
  assert.equal(helpers.mediaPosition({start:1000},6000),5);
  assert.equal(helpers.mediaPosition({paused:true,pos:12,start:1000},80000),12);
  assert.equal(helpers.mediaPosition({start:10000},5000),0);
  assert.equal(helpers.mediaPosition({start:1000,d:5},20000),5);
  assert.equal(helpers.mediaPosition(null,5000),0);
  assert.equal(helpers.mediaPosition({start:NaN},5000),0);
});
test('screen volume covers the cinema interior, attenuates outside and is zero out of range', () => {
  requireModule(helpers);
  const cine=SCREENS.find(s=>s.id==='cine'), auto=SCREENS.find(s=>s.id==='autocine');
  assert.equal(helpers.screenGain(cine,{x:98,y:1.7,z:0}),1);
  assert.ok(helpers.screenGain(cine,{x:92,y:1.7,z:0})>0);
  assert.equal(helpers.screenGain(cine,{x:80,y:1.7,z:0}),0);
  assert.equal(helpers.screenGain(auto,{x:0,y:1.7,z:50}),1);
  assert.equal(helpers.screenGain(auto,{x:0,y:1.7,z:-100}),0);
});
function playerFixture() {
  requireModule(playback);
  let clock=10000; const calls=[], sent=[];
  const p={status:-1,time:0,duration:60,video:'',
    loadVideoById(o){calls.push(['load',o]);this.video=o.videoId;this.time=o.startSeconds;this.status=1;},
    cueVideoById(o){calls.push(['cue',o]);this.video=o.videoId;this.time=o.startSeconds;this.status=5;},
    playVideo(){calls.push(['play']);this.status=1;}, pauseVideo(){calls.push(['pause']);this.status=2;},stopVideo(){calls.push(['stop']);this.status=-1;},
    seekTo(t){calls.push(['seek',t]);this.time=t;}, setVolume(v){calls.push(['volume',v]);},unMute(){calls.push(['unmute']);},
    getPlayerState(){return this.status;},getCurrentTime(){return this.time;},getDuration(){return this.duration;},getVideoData(){return {video_id:this.video,title:'Demo'};}
  };
  const c=new playback.MediaPlayback({screenId:'cine',now:()=>clock,send:m=>sent.push(m)});
  return {c,p,calls,sent,setClock:v=>clock=v};
}
const active=(o={})=>({queue:[],cur:{v:'M7lc1UVf-VE',playId:'one',start:5000,paused:false,d:60,...o}});
test('media waits for player readiness and then seeks to shared time, without reload storms', () => {
  const {c,p,calls}=playerFixture(); c.setState(active());c.tick({active:true,volume:.5});assert.equal(calls.length,0);
  c.attach(p);c.tick({active:true,volume:.5});
  assert.equal(calls.find(x=>x[0]==='load')[1].startSeconds,5);
  for(let i=0;i<20;i++) c.tick({active:true,volume:.5});
  assert.equal(calls.filter(x=>x[0]==='load').length,1);
  assert.equal(calls.find(x=>x[0]==='volume')[1],50);
});
test('media follows room pause, seek and resume and reloads repeated videos with a new playId', () => {
  const {c,p,calls}=playerFixture();c.attach(p);c.setState(active());c.tick({active:true,volume:1});
  c.setState(active({paused:true,pos:23}));c.tick({active:true,volume:1});
  assert.ok(calls.some(x=>x[0]==='pause'));assert.ok(calls.some(x=>x[0]==='seek'&&x[1]===23));
  c.setState(active({start:8000}));c.tick({active:true,volume:1});assert.equal(p.status,1);
  c.setState(active({playId:'two',start:10000}));c.tick({active:true,volume:1});assert.equal(calls.filter(x=>x[0]==='load').length,2);
});
test('autoplay blocking does not produce repeated play commands; an explicit click retries', () => {
  const {c,p,calls}=playerFixture();c.attach(p);c.setState(active());c.tick({active:true,volume:1});
  p.status=2;c.onAutoplayBlocked();const before=calls.length;
  for(let i=0;i<100;i++) c.tick({active:true,volume:1});
  assert.equal(calls.length,before);assert.equal(c.blocked,true);
  c.unlock();assert.ok(calls.some(x=>x[0]==='unmute'));assert.equal(c.blocked,false);assert.equal(p.status,1);
});
test('a local YouTube error does not skip the video for the room', () => {
  const {c,p,sent}=playerFixture();c.attach(p);c.setState(active());c.tick({active:true,volume:1});
  c.onError(150);assert.match(c.error,/insert|incrust|permit/i);assert.equal(sent.filter(m=>m.a==='error'||m.a==='skip').length,0);
});
test('a hidden/inactive screen pauses locally, a late return resynchronizes', () => {
  const {c,p,calls,setClock}=playerFixture();c.attach(p);c.setState(active());c.tick({active:true,volume:1});
  c.tick({active:false,volume:0});assert.equal(p.status,2);
  setClock(26000);c.tick({active:true,volume:1});assert.equal(p.status,1);assert.ok(calls.some(x=>x[0]==='seek'&&x[1]===21));
  c.setState({cur:null,queue:[]});c.tick({active:true,volume:1});assert.ok(calls.some(x=>x[0]==='stop'));
});
test('end-of-video notification is keyed and sent once', () => {
  const {c,p,sent}=playerFixture();c.attach(p);c.setState(active());c.tick({active:true,volume:1});
  p.time=60;p.status=0;c.onPlayerState(0);c.onPlayerState(0);
  assert.equal(sent.filter(x=>x.a==='ended').length,1);assert.equal(sent.find(x=>x.a==='ended').playId,'one');
});
test('server gives consecutive copies of the same video different playback IDs', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dukes-media-'));
  try {const r=new Room('t',dir),m=r.media.get('cine');m.queue.push({v:'M7lc1UVf-VE'},{v:'M7lc1UVf-VE'});r._next('cine');const first=m.cur.playId;r._next('cine');assert.ok(first);assert.notEqual(m.cur.playId,first);} finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('server clamps an early pause to zero and ignores stale end notifications and client-local errors', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dukes-media-'));
  try {
    const r=new Room('t',dir),m=r.media.get('cine'),p={name:'Tester'};m.queue.push({v:'M7lc1UVf-VE'},{v:'dQw4w9WgXcQ'});r._next('cine');
    r.onMedia(p,{s:'cine',a:'pause'});assert.ok(m.cur.pos>=0);
    m.cur.start=Date.now()-10000;m.cur.paused=false;
    r.onMedia(p,{s:'cine',a:'ended',v:m.cur.v,playId:'old'});assert.equal(m.cur.v,'M7lc1UVf-VE');
    r.onMedia(p,{s:'cine',a:'error',v:m.cur.v,playId:m.cur.playId});assert.equal(m.cur.v,'M7lc1UVf-VE');
  }finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('synthesized game sounds contain finite, audible samples without clipping', () => {
  requireModule(synth);
  for(const name of ['step-grass','step-hard','jump','land','hit','swing','pickup','throw','drink','smoke','spray','engine','blades','horn','wind','birds','water','ui']){
    const s=synth.synthesize(name,22050,1);assert.ok(s instanceof Float32Array&&s.length>100,name);
    let power=0,peak=0;for(const v of s){assert.ok(Number.isFinite(v),name);power+=v*v;peak=Math.max(peak,Math.abs(v));}
    assert.ok(power/s.length>1e-7,`${name}: silencio`);assert.ok(peak<=.95,`${name}: clipping ${peak}`);
    assert.ok(Math.abs(s[0])<.02&&Math.abs(s.at(-1))<.02,`${name}: borde brusco`);
  }
});
test('audio unlock handles unsupported browsers without breaking the game',async()=>{
  requireModule(audio);const a=new audio.AudioEngine({contextFactory:()=>null});assert.equal(await a.unlock(),false);a.update(1/60,{});a.dispose();
});
test('client integrates audio unlock on join, per-frame audio/media, and visible retry controls',()=>{
  const main=fs.readFileSync(new URL('../public/js/main.js',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(main,/AudioEngine/);assert.match(main,/YouTubeScreenManager/);assert.match(main,/G\.sfx\??\.unlock\(/);
  assert.match(main,/G\.sfx\??\.update\(/);assert.match(main,/G\.media\??\.update\(/);
  assert.match(html,/id="audio-test"/);assert.match(html,/id="media-unlock"/);assert.match(html,/id="media-view"/);
});

test('seeking a cued video in a paused room must not accidentally start it',()=>{
  const {c,p}=playerFixture();
  // Official API behavior: seekTo starts playback unless the player was paused.
  p.seekTo=function(t){this.time=t;if(this.status!==2)this.status=1;};
  c.attach(p);c.setState(active({paused:true,pos:0}));c.tick({active:true,volume:1});
  assert.equal(p.status,5);
  c.setState(active({paused:true,pos:25}));c.tick({active:true,volume:1});
  assert.equal(p.time,25);assert.equal(p.status,2);
});
