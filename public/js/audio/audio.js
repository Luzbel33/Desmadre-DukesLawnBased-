import { synthesize } from './synthesis.js';
import { zoneAt } from '../shared/mapdata.js';
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,Number.isFinite(+x)?+x:0));
const DEFAULTS={vol:.8,volSfx:.8,volAmbient:.35,muted:false};
const ACTIONS={drink:'drink',smoke:'smoke',bong:'drink',eat:'drink',punchL:'swing',punchR:'swing',kick:'swing',swing:'swing',throw:'throw'};
// variantes sintetizadas por sonido (cada semilla da otra; los pájaros son "especies" distintas)
const VARIANTS={birds:8};
export class AudioEngine {
  constructor({opts={},contextFactory,changed=()=>{}}={}) {
    this.opts=opts;this.changed=changed;this.contextFactory=contextFactory||(()=>{
      const AC=globalThis.AudioContext||globalThis.webkitAudioContext;
      return AC ? new AC({latencyHint:'interactive'}) : null;
    });
    this.ctx=null;this.master=null;this.sfxBus=null;this.ambientBus=null;
    this.buffers=new Map();this.loops=new Map();this.shots=new Set();this.walkers=new Map();
    this.samples=new Map();this.sampleManifest=null;this._samplesLoading=false;
    this.listener={x:0,y:1.7,z:0};this.right={x:1,y:0,z:0};this.active=false;
    this.problem='';this.played=0;this.disposed=false;
  }
  get status(){return this.problem || (this.opts.muted?'silenciado':this.ctx?.state==='running'?'activo':'requiere clic');}
  unlock() {
    if(this.disposed)return Promise.resolve(false);
    try {
      if(!this.ctx){
        this.ctx=this.contextFactory();
        if(!this.ctx){this.problem='Audio no disponible en este navegador';this.changed(this);return Promise.resolve(false);}
        const c=this.ctx;
        this.master=c.createGain();this.sfxBus=c.createGain();this.ambientBus=c.createGain();
        this.sfxBus.connect(this.master);this.ambientBus.connect(this.master);
        this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-10;this.limiter.knee.value=16;this.limiter.ratio.value=7;
        this.limiter.attack.value=.004;this.limiter.release.value=.15;this.master.connect(this.limiter);this.limiter.connect(c.destination);
        c.onstatechange=()=>this.changed(this);this.refresh();this._loadSamples();
      }
      // resume() is called synchronously in the click stack, before any awaited network operation.
      const promise=this.ctx.resume?.();
      return Promise.resolve(promise).then(()=>{this.problem='';this.refresh();this.changed(this);return this.ctx?.state==='running';},()=>{
        this.problem='Tocá «Activar sonido» para habilitar el audio';this.changed(this);return false;
      });
    }catch(e){this.problem='No se pudo iniciar el audio. Revisá los permisos de sonido del navegador.';this.changed(this);return Promise.resolve(false);}
  }
  _gain(param,value,time=.03){
    if(!param||!this.ctx)return;
    if(param._dukesTarget===value)return;
    param._dukesTarget=value;param.setTargetAtTime(value,this.ctx.currentTime,time);
  }
  refresh(){
    const o={...DEFAULTS,...this.opts};
    this._gain(this.master?.gain,o.muted?0:clamp(o.vol));
    this._gain(this.sfxBus?.gain,clamp(o.volSfx));this._gain(this.ambientBus?.gain,clamp(o.volAmbient));
  }
  // Samples reales (CC0) cargados desde assets/sfx; si no hay, se usa el sintetizador procedural.
  setSamples(manifest){this.sampleManifest=manifest;if(this.ctx)this._loadSamples();}
  async _loadSamples(){
    if(this._samplesLoading||!this.sampleManifest||!this.ctx)return;this._samplesLoading=true;
    await Promise.all(Object.entries(this.sampleManifest).map(async([name,files])=>{
      const list=[];
      for(const f of files){
        try{const r=await fetch(f);if(!r.ok)continue;const ab=await r.arrayBuffer();list.push(await this.ctx.decodeAudioData(ab));}catch{/* archivo faltante */}
      }
      if(list.length)this.samples.set(name,list);
    }));
  }
  hasSound(name){if(this.samples.has(name))return true;try{synthesize(name,8000,1);return true;}catch{return false;}}
  _buffer(name,variant=0){
    const sm=this.samples.get(name);
    if(sm&&sm.length)return sm[variant%sm.length];
    const key=`${name}:${variant}`;if(this.buffers.has(key))return this.buffers.get(key);
    let data;try{data=synthesize(name,22050,1234+variant*311);}catch{this.buffers.set(key,null);return null;}
    const b=this.ctx.createBuffer(1,data.length,22050);
    b.copyToChannel(data,0);this.buffers.set(key,b);return b;
  }
  _spatial(pos,full=2,max=35){
    if(!pos)return {gain:1,pan:0};
    const x=pos.x-this.listener.x,y=(pos.y||0)-this.listener.y,z=pos.z-this.listener.z,d=Math.hypot(x,y,z);
    const f=clamp(1-(d-full)/(max-full));
    return {gain:f*f,pan:clamp((x*this.right.x+y*this.right.y+z*this.right.z)/Math.max(1,d),-1,1)};
  }
  _voice(name,{loop=false,bus='sfx',variant=0}={}){
    const c=this.ctx,source=c.createBufferSource(),gain=c.createGain(),pan=c.createStereoPanner();
    source.buffer=this._buffer(name,variant);source.loop=loop;gain.gain.value=0;
    source.connect(gain);gain.connect(pan);pan.connect(bus==='ambient'?this.ambientBus:this.sfxBus);
    const voice={source,gain,pan,name,dead:false};
    voice.dispose=()=>{if(voice.dead)return;voice.dead=true;try{source.stop();}catch{}source.disconnect();gain.disconnect();pan.disconnect();this.shots.delete(voice);};
    source.onended=voice.dispose;return voice;
  }
  // variant: toma fija (todos oyen la misma); rate: tono (si no, uno al azar cerca de 1);
  // slot: canal (p. ej. la voz de un jugador): lo nuevo corta a lo anterior del mismo canal en vez de encimarse
  trigger(name,pos=null,level=.65,{full=2,max=35,bus='sfx',variant=-1,rate=0,slot=null}={}){
    if(!this.ctx||this.ctx.state!=='running'||this.disposed)return false;
    const space=this._spatial(pos,full,max);if(space.gain<.003)return false;
    const variants=this.samples.get(name)?.length||VARIANTS[name]||3;
    if(!this._buffer(name,0))return false;
    // Bounded polyphony; heavy rooms cannot allocate unlimited one-shot sources.
    if(this.shots.size>=40)this.shots.values().next().value.dispose();
    const v=this._voice(name,{variant:variant>=0?variant%variants:Math.floor(Math.random()*variants),bus});
    v.gain.gain.value=clamp(level)*space.gain;v.pan.pan.value=space.pan;
    v.source.playbackRate.value=rate>0?rate*(.985+Math.random()*.03):.94+Math.random()*.12;
    if(slot){
      this.slots=this.slots||new Map();const old=this.slots.get(slot);
      if(old&&!old.dead){try{old.gain.gain.cancelScheduledValues(this.ctx.currentTime);old.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.015);old.source.stop(this.ctx.currentTime+.08);}catch{old.dispose();}}
      this.slots.set(slot,v);
    }this.shots.add(v);v.source.start();this.played++;return true;
  }
  test(){return this.unlock().then(ok=>{if(ok)this.trigger('ui',null,.85);return ok;});}
  // Pájaros: trinos sueltos cada tanto, de distintas direcciones y distancias (nunca un loop fijo)
  _birds(dt,inside){
    this._birdT=(this._birdT??1.5)-dt;
    if(this._birdT>0)return;
    this._birdT=1.4+Math.random()*4.6;
    if(inside&&Math.random()<.85)return;
    const a=Math.random()*Math.PI*2,d=7+Math.random()*22,L=this.listener;
    const pos={x:L.x+Math.cos(a)*d,y:L.y+2+Math.random()*5,z:L.z+Math.sin(a)*d};
    this.trigger('birds',pos,(inside?.05:.16)+Math.random()*.08,{full:12,max:60,bus:'ambient'});
    // a veces contesta otro pájaro un poco después
    if(Math.random()<.3)this._birdT=Math.min(this._birdT,.35+Math.random()*.5);
  }
  _loop(key,name,level,pos=null,{bus='sfx',rate=1,full=3,max=40}={}){
    if(!this.ctx)return;
    const spatial=this._spatial(pos,full,max),target=clamp(level)*spatial.gain;
    let v=this.loops.get(key);
    if(!v && target>.001){v=this._voice(name,{loop:true,bus});this.loops.set(key,v);v.source.start();}
    if(!v)return;
    v.touched=true;this._gain(v.gain.gain,target,.10);this._gain(v.pan.pan,spatial.pan,.08);
    this._gain(v.source.playbackRate,clamp(rate,.3,3),.1);
  }
  update(dt,{active=false,local=null,remotes=[],vehicles=[],camera=null,spraying=false}={}){
    if(!this.ctx||this.disposed)return;
    this.refresh();this.active=active && !globalThis.document?.hidden;
    if(camera?.position){Object.assign(this.listener,{x:camera.position.x,y:camera.position.y,z:camera.position.z});const m=camera.matrixWorld?.elements;if(m)Object.assign(this.right,{x:m[0],y:m[1],z:m[2]});}
    for(const v of this.loops.values())v.touched=false;
    if(this.active && local && this.ctx.state==='running'){
      const zone=zoneAt(local.pos.x,local.pos.z),inside=['bar','cine','mansion','galpon'].includes(zone);
      this._loop('wind','wind',inside?.06:.36,null,{bus:'ambient'});
      this._birds(dt,inside);
      this._loop('fountain','water',.2,{x:0,y:1,z:-65},{bus:'ambient',full:4,max:18});
      const all=[{key:'me',p:local,isMe:true},...[...remotes].map(p=>({key:`p${p.id}`,p,isMe:false}))],seen=new Set();
      for(const {key,p,isMe} of all){
        seen.add(key);const st=isMe?null:p.stateData;if(!isMe&&!st)continue;
        const pos=p.pos,ground=isMe?p.grounded:st.g!==0,vehicle=isMe?p.vehicle:st.veh,dead=isMe?p.dead:st.hp<=0;
        const action=isMe?p.action:st.ac,at=(isMe?p.actionT:st.at)||0,soundPos=isMe?null:pos;
        let old=this.walkers.get(key);
        if(!old){old={x:pos.x,y:pos.y,z:pos.z,ground,dist:0,action:null,at:0};this.walkers.set(key,old);}
        const moved=Math.hypot(pos.x-old.x,pos.z-old.z);
        if(!dead&&!vehicle){
          if(!old.ground&&ground && pos.y-old.y<.2)this.trigger('land',soundPos,isMe?.5:.6);
          if(old.ground&&!ground && pos.y>old.y+.005)this.trigger('jump',soundPos,.35);
          if(ground&&moved<2){
            old.dist+=moved;
            if(old.dist>((isMe?p.speed:st.sp)>5?1.25:.88)){
              old.dist=0;const floor=zoneAt(pos.x,pos.z);const step=floor==='bar'?'step-wood':floor==='cine'?'step-carpet':['pasto','saltos','autocine',null].includes(floor)?'step-grass':'step-hard';this.trigger(step,soundPos,isMe?.4:.55);
            }
          }else old.dist=0;
          if(ACTIONS[action] && (action!==old.action || at+.35<old.at))this.trigger(ACTIONS[action],soundPos,.65);
          const spray=isMe?spraying:action==='spray';
          if(spray)this._loop(`spray-${key}`,'spray',isMe?.24:.35,soundPos,{max:14});
        }
        Object.assign(old,{x:pos.x,y:pos.y,z:pos.z,ground,action,at});
      }
      for(const key of this.walkers.keys())if(!seen.has(key))this.walkers.delete(key);
      // Simulate only the four closest audible engines.
      // solo suenan los que tienen conductor (una estacionada no hace ruido aunque haya quedado algo raro en la red)
      const nearby=[...vehicles].filter(v=>v.seats?.[0])
        .sort((a,b)=>Math.hypot(a.pos.x-local.pos.x,a.pos.z-local.pos.z)-Math.hypot(b.pos.x-local.pos.x,b.pos.z-local.pos.z)).slice(0,4);
      for(const v of nearby){
        const speed=Math.abs(v.speed||0),own=local.vehicle===v,pos=own?null:v.pos;
        this._loop(`engine-${v.id}`,'engine',(v.type==='cart'?.2:.34)*(own?1:.8),pos,{rate:(v.type==='tractor'?.73:.95)+Math.min(12,speed)*.055,full:2,max:34});
        if(v.blades&&v.type!=='cart')this._loop(`blades-${v.id}`,'blades',.2,pos,{rate:1+speed*.012,full:2,max:24});
      }
    }else this.walkers.clear();
    for(const [key,v] of this.loops){
      if(!v.touched){this._gain(v.gain.gain,0,.06);if(v.gain.gain.value<.0005){v.dispose();this.loops.delete(key);}}
    }
  }
  stop(){for(const v of this.loops.values())v.dispose();this.loops.clear();for(const v of [...this.shots])v.dispose();this.walkers.clear();this.active=false;}
  dispose(){this.stop();this.disposed=true;if(this.ctx){this.ctx.onstatechange=null;this.ctx.close?.().catch?.(()=>{});}this.buffers.clear();}
  diagnostics(){return {state:this.ctx?.state||'not-created',status:this.status,played:this.played,loops:this.loops.size,shots:this.shots.size,cachedBuffers:this.buffers.size};}
}
