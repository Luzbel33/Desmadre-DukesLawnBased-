from pathlib import Path
import re, json, os
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[2]
base='https://component-test.invalid/'
sources={}
pattern=re.compile(r'''\b(from\s+|import\s*)(['"])([^'"\n]+)\2''')
def visit(rel):
 if rel in sources:return
 p=root/rel;src=p.read_text();sources[rel]=''
 def sub(m):
  spec=m.group(3)
  if spec=='three': dep='public/vendor/three/three.module.js'
  elif spec.startswith('three/addons/'):dep='public/vendor/'+spec
  elif spec.startswith('.'):
   dep=str((p.parent/spec).resolve().relative_to(root.resolve()))
  else:return m.group(0)
  visit(dep);return m.group(1)+m.group(2)+base+dep+m.group(2)
 src=pattern.sub(sub,src)
 if rel.endswith('media/screens.js'):
  # Explicit mock fixture, kept OUTSIDE the distributable. No actual YouTube request is made.
  src=src.replace('iframe.src=`https://www.youtube.com/embed/${e.control.state.cur.v}?${params}`;', "iframe.src='about:blank';")
 sources[rel]=src
for f in ['public/js/audio/audio.js','public/js/media/screens.js']:visit(f)
html=(root/'public/index.html').read_text();html=re.sub(r'<script[\s\S]*?</script>','',html);html=re.sub(r'<link[^>]+>','',html)
with sync_playwright() as pw:
 browser_path=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
 b=pw.chromium.launch(executable_path=browser_path,headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html);page.add_style_tag(content=(root/'public/css/style.css').read_text())
 page.evaluate('''sources => {const imports={};for(const [p,s] of Object.entries(sources))imports['https://component-test.invalid/'+p]=URL.createObjectURL(new Blob([s],{type:'text/javascript'}));const tag=document.createElement('script');tag.type='importmap';tag.textContent=JSON.stringify({imports});document.head.append(tag);}''',sources)
 page.add_script_tag(type='module',content='''
 import * as THREE from 'https://component-test.invalid/public/vendor/three/three.module.js';
 import {AudioEngine} from 'https://component-test.invalid/public/js/audio/audio.js';
 import {YouTubeScreenManager} from 'https://component-test.invalid/public/js/media/screens.js';
 const $=id=>document.getElementById(id);
 const opts={vol:.8,volSfx:.8,volAmbient:.35,volMusic:.7,muted:false};
 const a=new AudioEngine({opts});window.testAudio=a;window.testOpts=opts;
 $('loading').classList.add('hidden');$('menu').classList.add('hidden');$('pause').classList.remove('hidden');
 $('audio-test').onclick=()=>a.test();
 const camera=new THREE.PerspectiveCamera(72,1280/1000,.1,2000);camera.position.set(110,1.7,2);camera.lookAt(122.6,4.3,2);camera.updateMatrixWorld();
 window.camera=camera;const local={pos:new THREE.Vector3(0,.02,-60),grounded:true,speed:0,action:null,actionT:0,dead:false,vehicle:null};
 window.testLocal=local;
 window.YT={Player:class {
   constructor(iframe,options){
     this.iframe=iframe;this.options=options;this.status=-1;this.time=0;this.volume=100;this.loads=0;this.video='M7lc1UVf-VE';
     iframe.srcdoc='<body style="margin:0;display:grid;place-items:center;background:#17232c;color:#d9e3ea;font:28px sans-serif;height:100vh;text-align:center">PRUEBA DE INTERFAZ<br>YouTube simulado · sin video real</body>';
     setTimeout(()=>options.events.onReady({target:this}),10);
   }
   loadVideoById(o){this.loads++;this.video=o.videoId;this.time=o.startSeconds;this.status=1;}
   cueVideoById(o){this.loads++;this.video=o.videoId;this.time=o.startSeconds;this.status=5;}
   playVideo(){this.status=1;} pauseVideo(){this.status=2;} stopVideo(){this.status=-1;}
   getPlayerState(){return this.status;} getCurrentTime(){return this.time;}
   getDuration(){return 120;} getVideoData(){return {video_id:this.video,title:'Video simulado'};}
   setVolume(v){this.volume=v;}unMute(){}seekTo(t){this.time=t;}
   destroy(){this.iframe.remove();}
 }};
 const net={now:()=>Date.now(),send:m=>(window.sent??=[]).push(m)};
 const media=new YouTubeScreenManager({scene:new THREE.Scene(),net,opts,changed:id=>{if(id===media.focused)$('media-status').textContent=media.info(id).text;}});
 window.testMedia=media;
 $('media-unlock').onclick=()=>media.unlock();$('media-close').onclick=()=>{media.focus(null);$('media').classList.add('hidden');};
 window.startMedia=()=>{
 camera.position.set(110,1.7,2);camera.lookAt(122.6,4.3,2);camera.updateMatrixWorld();
  $('pause').classList.add('hidden');$('media').classList.remove('hidden');
  $('media-title').textContent='Cine — QA de componentes';
  const opt=document.createElement('option');opt.textContent='Cine Gran Desmadre';$('media-screen').append(opt);
  media.apply('cine',{cur:{v:'M7lc1UVf-VE',playId:'test',start:Date.now()-5000,paused:false,d:120},queue:[]});media.focus('cine',$('media-view'));
 };
 function frame(){media.update(camera,camera.position,{active:true});requestAnimationFrame(frame);}requestAnimationFrame(frame);
 window.componentsReady=true;
 ''')
 page.wait_for_function('window.componentsReady===true')
 page.locator('#audio-test').click();page.wait_for_function('testAudio.ctx?.state==="running"')
 page.evaluate('''()=>{window.analyser=testAudio.ctx.createAnalyser();analyser.fftSize=2048;testAudio.master.connect(analyser);testAudio.trigger('horn',null,.7);window.energy=()=>{let f=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(f);return f.reduce((s,v)=>s+v*v,0)/f.length;};}''')
 page.wait_for_timeout(100)
 results={'audio_state':page.evaluate('testAudio.ctx.state'),'horn_power':page.evaluate('energy()')}
 assert results['horn_power']>1e-5,results
 page.evaluate('''()=>{testAudio.stop();camera.position.set(0,1.7,-60);camera.lookAt(0,1.7,-50);camera.updateMatrixWorld();testAudio.update(.016,{active:true,local:testLocal,camera,vehicles:[{id:1,type:'mower',pos:testLocal.pos,seats:[1],speed:5,blades:true}]});}''')
 page.wait_for_timeout(250);results['ambience_engine_power']=page.evaluate('energy()');results['loops']=page.evaluate('testAudio.loops.size')
 assert results['ambience_engine_power']>1e-6 and results['loops']>=4,results
 page.evaluate('testOpts.muted=true;testAudio.refresh()');page.wait_for_timeout(600);results['muted_power']=page.evaluate('energy()');assert results['muted_power']<1e-9,results
 page.evaluate('testOpts.muted=false;testAudio.refresh()');page.wait_for_timeout(250);results['unmuted_power']=page.evaluate('energy()');assert results['unmuted_power']>1e-6
 page.evaluate('window.oldCtx=testAudio.ctx');page.locator('#audio-test').click();assert page.evaluate('oldCtx===testAudio.ctx')
 results['single_audio_context']=True
 page.evaluate('startMedia()');page.wait_for_function("testMedia.screens.get('cine').ready")
 page.wait_for_timeout(400)
 results['media_iframe_count']=page.locator('.yt-stage iframe').count();assert results['media_iframe_count']==1
 results['media_status']=page.evaluate("testMedia.screens.get('cine').player.getPlayerState()")
 assert results['media_status']==1
 page.evaluate("window.originalFrame=testMedia.screens.get('cine').stage.querySelector('iframe');testMedia.screens.get('cine').control.onAutoplayBlocked();testMedia.screens.get('cine').player.status=2")
 page.wait_for_timeout(400);results['blocked_status']=page.locator('#media-status').inner_text();assert 'clic' in results['blocked_status']
 page.locator('#media-unlock').click();page.wait_for_timeout(300);assert page.evaluate("!testMedia.screens.get('cine').control.blocked")
 page.screenshot(path=str(root/'QA/audio-media/components-ui-not-live-youtube.png'),full_page=True)
 page.evaluate("testMedia.focus(null);document.getElementById('media').classList.add('hidden')");page.wait_for_timeout(150)
 page.evaluate("document.getElementById('media').classList.remove('hidden');testMedia.focus('cine',document.getElementById('media-view'))");page.wait_for_timeout(300)
 results['iframe_preserved_on_focus']=page.evaluate("originalFrame===testMedia.screens.get('cine').stage.querySelector('iframe')")
 results['load_calls']=page.evaluate("testMedia.screens.get('cine').player.loads")
 assert results['iframe_preserved_on_focus'] and results['load_calls']==1,results
 results['cutouts']=page.evaluate("[...testMedia.screens.values()].map(e=>({id:e.def.id,transparent:e.hole.material.transparent,opacity:e.hole.material.opacity,depth:e.hole.material.depthWrite}))")
 assert all(e['transparent'] and e['opacity']==0 and e['depth'] for e in results['cutouts'])
 results['errors']=errors;assert not errors,errors
 results['scope']='Component tests. Real browser AudioContext + analyser and CSS3D DOM; WebGL not available and YT.Player explicitly mocked. No real YouTube video played.'
 print(json.dumps(results,indent=2));(root/'QA/audio-media/browser-components.json').write_text(json.dumps(results,indent=2));b.close()
