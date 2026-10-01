import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { SCREENS, SCREEN_BY_ID } from '../shared/mapdata.js';
import { loadYouTubeAPI, screenGain, clamp01 } from './youtube.js';
import { MediaPlayback } from './playback.js';
import { readVideoVolume, mountVideoVolume } from './volume.js';

// Each screen owns ONE persistent iframe. Focusing changes its camera/container,
// never reparents/reloads it and never creates a second audible player.
export class YouTubeScreenManager {
  constructor({scene,net,opts,changed=()=>{},document:doc=globalThis.document}={}) {
    this.world=scene;this.net=net;this.opts=opts||{};this.changed=changed;this.doc=doc;
    this.videoVolume=readVideoVolume(this.opts.volMusic??.7);
    this.screens=new Map();this.focused=null;this.slot=null;this.disposed=false;
    this.lastTick=0;this.lastCamera=null;this.lastPos=null;this.active=false;
    for(const def of SCREENS)this._build(def);
  }
  _build(def){
    const layer=this.doc.createElement('div');layer.className='yt-world-layer';layer.dataset.screen=def.id;
    Object.assign(layer.style,{position:'fixed',left:'0',top:'0',zIndex:'0',pointerEvents:'none'});
    this.doc.body.appendChild(layer);
    const renderer=new CSS3DRenderer({element:layer}),cssScene=new THREE.Scene();
    const el=this.doc.createElement('div');el.className='yt-surface';
    Object.assign(el.style,{width:'960px',height:'540px',pointerEvents:'none',backfaceVisibility:'hidden'});
    const placeholder=this.doc.createElement('div');placeholder.className='yt-empty';
    const title=this.doc.createElement('strong');title.textContent=def.name;
    const text=this.doc.createElement('span');text.textContent='P · Pantallas  /  X · Usar\nAgregá un video de YouTube para empezar';
    placeholder.append(title,text);
    const stage=this.doc.createElement('div');stage.className='yt-stage';el.append(placeholder,stage);
    const object=new CSS3DObject(el);object.position.fromArray(def.c);object.rotation.y=def.yaw;
    object.scale.set(def.w/960,def.h/540,1);cssScene.add(object);
    // Alpha cutout into the WebGL canvas. Real foreground geometry retains depth occlusion.
    const mat=new THREE.MeshBasicMaterial({color:0x000000,opacity:0,transparent:true,blending:THREE.NoBlending,depthWrite:true,depthTest:true,toneMapped:false,side:THREE.FrontSide});
    const hole=new THREE.Mesh(new THREE.PlaneGeometry(def.w,def.h),mat);hole.name=`youtube-aperture-${def.id}`;
    hole.position.fromArray(def.c);hole.rotation.y=def.yaw;hole.renderOrder=-1000;this.world.add(hole);
    const focusCamera=new THREE.OrthographicCamera(-def.w/2,def.w/2,def.h/2,-def.h/2,.01,100);
    focusCamera.position.set(0,0,10);
    focusCamera.lookAt(0,0,0);focusCamera.updateMatrixWorld();
    const entry={def,layer,renderer,cssScene,object,hole,focusCamera,placeholder,stage,center:new THREE.Vector3().fromArray(def.c),normal:new THREE.Vector3(Math.sin(def.yaw),0,Math.cos(def.yaw)),toCamera:new THREE.Vector3(),projected:new THREE.Vector3(),player:null,loading:false,error:'',ready:false,timer:null,w:0,h:0};
    entry.control=new MediaPlayback({screenId:def.id,now:()=>this.net.now(),send:m=>this.net.send(m),changed:()=>this.changed(def.id)});
    this.screens.set(def.id,entry);
  }
  apply(id,state){const e=this.screens.get(id);if(e){e.control.setState(state);if(!state?.cur)e.placeholder.style.display='';}}
  applyAll(all={}){for(const id of this.screens.keys())this.apply(id,all[id]||{cur:null,queue:[]});}
  nearest(pos){let id='autocine',distance=Infinity;for(const d of SCREENS){const n=Math.hypot(d.c[0]-pos.x,d.c[2]-pos.z);if(n<distance){distance=n;id=d.id;}}return id;}
  focus(id,slot=null){this.focused=this.screens.has(id)?id:null;this.slot=slot;mountVideoVolume(this,slot);this.lastTick=0;this.changed(this.focused);}
  info(id){
    const e=this.screens.get(id);if(!e)return {text:'Elegí una pantalla.',blocked:false};
    let text=e.error||e.control.error;
    if(!text){
      if(!e.control.state.cur)text='Pegá un enlace de video y pulsá Agregar. La cola se comparte con tu sala.';
      else if(e.control.blocked)text='YouTube necesita un clic: pulsá «Activar YouTube» o el botón ▶ del reproductor.';
      else if(e.loading||!e.ready)text='Conectando con YouTube…';
      else text='Video sincronizado con la sala. El volumen es personal.';
    }
    return {text,blocked:e.control.blocked,error:!!(e.error||e.control.error),ready:e.ready};
  }
  async _ensure(e){
    if(this.disposed||e.loading||e.player||e.error||!e.control.state.cur)return;
    e.loading=true;this.changed(e.def.id);
    try {
      const YT=await loadYouTubeAPI();
      if(this.disposed||!e.control.state.cur){e.loading=false;return;}
      const iframe=this.doc.createElement('iframe');iframe.title=`YouTube — ${e.def.name}`;
      iframe.width='960';iframe.height='540';iframe.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';
      const params=new URLSearchParams({enablejsapi:'1',origin:globalThis.location.origin,playsinline:'1',autoplay:'0',controls:'1',rel:'0'});
      iframe.src=`https://www.youtube.com/embed/${e.control.state.cur.v}?${params}`;
      Object.assign(iframe.style,{width:'960px',height:'540px',border:'0',pointerEvents:this.focused===e.def.id?'auto':'none'});
      e.stage.replaceChildren(iframe);e.placeholder.style.display='none';
      e.timer=setTimeout(()=>{if(!e.ready&&!this.disposed){e.error='YouTube no completó la carga. Revisá la conexión, los bloqueadores o pulsá Reintentar.';this.changed(e.def.id);}},18000);
      e.player=new YT.Player(iframe,{events:{
        onReady:event=>{clearTimeout(e.timer);e.ready=true;e.loading=false;e.error='';e.control.attach(event.target);this.lastTick=0;this.changed(e.def.id);},
        onStateChange:event=>{e.control.onPlayerState(event.data);this.changed(e.def.id);},
        onError:event=>{e.loading=false;e.control.onError(event.data);this.changed(e.def.id);},
        onAutoplayBlocked:()=>{e.control.onAutoplayBlocked();this.changed(e.def.id);},
      }});
    }catch(error){e.loading=false;e.error=error.message;this.changed(e.def.id);}
  }
  unlock(id=this.focused){
    const e=this.screens.get(id);if(!e)return;
    // No await before the player call: preserve the browser's user activation.
    e.control.active=true;e.control.unlock();
    if(!e.player&&!e.error)this._ensure(e);
    this.lastTick=0;
  }
  retry(id=this.focused){
    const e=this.screens.get(id);if(!e)return;
    clearTimeout(e.timer);try{e.player?.destroy();}catch{}
    e.player=null;e.ready=false;e.loading=false;e.error='';e.control.detach();e.control.error='';e.control.blocked=false;
    e.stage.replaceChildren();e.placeholder.style.display='';this._ensure(e);
  }
  update(camera,pos,{active=true}={}){
    if(this.disposed)return;
    this.lastCamera=camera;this.lastPos=pos;this.active=active;
    camera.updateMatrixWorld();
    const now=performance.now(),tick=now-this.lastTick>150;
    if(tick)this.lastTick=now;
    const pageVisible=!this.doc.hidden;
    for(const e of this.screens.values()){
      const focused=this.focused===e.def.id&&!!this.slot;
      const toCamera=e.toCamera.subVectors(camera.position,e.center);
      const projected=e.projected.copy(e.center).project(camera);
      const facing=toCamera.dot(e.normal)>0;
      const visible=facing&&projected.z>-1&&projected.z<1&&Math.abs(projected.x)<1.7&&Math.abs(projected.y)<1.7&&toCamera.lengthSq()<160*160;
      const showLayer=active&&(focused||visible);
      const gain=focused?1:screenGain(e.def,pos);
      const playing=active&&pageVisible&&(focused||(!this.focused&&(visible||gain>.01)));
      e.hole.visible=active&&!focused;
      e.layer.style.display=showLayer?'':'none';
      e.object.visible=true;
      let w=innerWidth,h=innerHeight;
      if(focused){
        const r=this.slot.getBoundingClientRect();w=Math.max(1,r.width);h=Math.max(1,r.height);
        Object.assign(e.layer.style,{left:r.left+'px',top:r.top+'px',zIndex:'8',pointerEvents:'auto'});
        // Do not cover the panel's controls if a small viewport makes it scroll.
        const parent=this.slot.closest('#media')?.getBoundingClientRect();
        e.layer.style.clipPath=parent?`inset(${Math.max(0,parent.top-r.top)}px 0 ${Math.max(0,r.bottom-parent.bottom)}px 0)`:'none';
      }else Object.assign(e.layer.style,{left:'0px',top:'0px',zIndex:'0',pointerEvents:'none',clipPath:'none'});
      e.object.element.style.pointerEvents=focused?'auto':'none';
      const iframe=e.stage.querySelector('iframe');if(iframe)iframe.style.pointerEvents=focused?'auto':'none';
      if(e.w!==w||e.h!==h){e.w=w;e.h=h;e.renderer.setSize(w,h);}
      // Orthographic focus must not inherit +/-90 degree world yaw: nested
      // CSS3D transforms can flatten those planes into an invisible layer.
      if(focused){e.object.position.set(0,0,0);e.object.rotation.set(0,0,0);}
      else {e.object.position.fromArray(e.def.c);e.object.rotation.set(0,e.def.yaw,0);}
      if(showLayer)e.renderer.render(e.cssScene,focused?e.focusCamera:camera);
      if(tick){
        if(playing&&e.control.state.cur)this._ensure(e);
        const volume=(this.opts.muted?0:clamp01(this.opts.vol??.8))*this.videoVolume*gain;
        e.control.tick({active:playing,volume:playing?volume:0});
        if(!e.control.state.cur){e.placeholder.style.display='';if(iframe)iframe.style.visibility='hidden';}
        else if(iframe){iframe.style.visibility='visible';e.placeholder.style.display='none';}
      }
    }
  }
  stop(){this.active=false;for(const e of this.screens.values()){e.control.tick({active:false,volume:0});e.hole.visible=false;e.layer.style.display='none';}}
  dispose(){
    this.disposed=true;this.volumeUI?.remove();this.volumeUI=null;
    for(const e of this.screens.values()){
      clearTimeout(e.timer);try{e.player?.destroy();}catch{}
      e.hole.removeFromParent();e.hole.geometry.dispose();e.hole.material.dispose();e.object.removeFromParent();e.layer.remove();
    }this.screens.clear();
  }
  diagnostics(){return [...this.screens].map(([id,e])=>({id,ready:e.ready,loading:e.loading,video:e.control.state.cur?.v||null,playId:e.control.state.cur?.playId,blocked:e.control.blocked,error:e.error||e.control.error,playerState:e.control.player?.getPlayerState?.(),volume:e.control.lastVolume}));}
}
