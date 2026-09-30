// Original procedural effects. No remote downloads, copyrighted recordings or hidden audio streams.
// Samples are cached once by AudioEngine; these are intentionally lightweight game sounds.
// Ambient loops (agua, cuchillas, motor) se arman con ruido filtrado y resonancias, no con tonos puros:
// un seno sostenido suena a "señal de radio".
const TAU=Math.PI*2;
const GAIN={engine:3,blades:1.4,water:1.6};
const DURATIONS={gulp:.32,cough:.9,pain:.42,burp:.7,'step-grass':.18,'step-hard':.16,jump:.2,land:.28,hit:.22,swing:.24,pickup:.18,throw:.3,drink:1.0,smoke:.8,spray:2,engine:2,blades:2,horn:.55,wind:6,birds:1.6,water:4,ui:.18,munch:.5,drip:.42,shot:.55,boom:2.4,bills:.7,fireball:1.3,'lift-hum':2,'lift-ding':1.8,'lift-door':1.05,'lift-clunk':.7};

// Filtro de dos polos (RBJ): pasabanda de ganancia 0 dB en el pico, o pasabajos.
function biquad(kind,f,q,sr){
  let b0=0,b1=0,b2=0,a1=0,a2=0,x1=0,x2=0,y1=0,y2=0;
  const set=(freq,Q=q)=>{
    const w=TAU*Math.min(freq,sr*.45)/sr,c=Math.cos(w),al=Math.sin(w)/(2*Q),a0=1+al;
    if(kind==='bp'){b0=al/a0;b1=0;b2=-al/a0;}
    else{b0=(1-c)/2/a0;b1=(1-c)/a0;b2=b0;}
    a1=-2*c/a0;a2=(1-al)/a0;
  };
  set(f);
  const run=(x)=>{const y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;return y;};
  run.set=set;return run;
}

export function synthesize(name, sampleRate=22050, seed=1) {
  if(!Object.hasOwn(DURATIONS,name))throw new Error(`Unknown sound: ${name}`);
  const duration=DURATIONS[name],len=Math.max(2,Math.floor(sampleRate*duration)),out=new Float32Array(len);
  let s=seed|0,lo=0,slow=0,phase=0,phase2=0;
  const noise=()=>{s=(Math.imul(s,1664525)+1013904223)|0;return (s>>>0)/2147483648-1;};
  const rnd=()=>(noise()+1)/2;
  const sr=sampleRate;
  // estado por sonido (filtros, eventos)
  const st={};
  if(name==='water'){
    // chapoteo de fuente: ruido en medios-agudos que titila (gotas), casi nada de graves (no retumba como un motor)
    st.low=biquad('lp',220,.7,sr);st.mid=biquad('bp',1500,.9,sr);st.hi=biquad('bp',4200,1.2,sr);st.mod=0;st.fl=0;
    // burbujas: gotitas cortas con el tono subiendo (resonancia de Minnaert), en momentos al azar
    st.bub=[];let t=0;while(t<duration){t+=.012+rnd()*.07;st.bub.push({t,f:520+rnd()*1100,d:.012+rnd()*.03,a:.018+rnd()*.05});}
  }
  if(name==='drip'){st.f0=480+rnd()*420;st.dec=rnd()*10;}
  // ascensor del Búnker: motor (zumbido con armónicos que cierran el loop de 2 s), aire/cable (ruido en banda) y traqueteo
  if(name==='lift-hum'){st.air=biquad('bp',620,1.1,sr);st.lp=biquad('lp',140,.7,sr);st.rat=biquad('bp',2300,2.2,sr);st.clk=[];let t=0;while(t<duration-.05){t+=.05+rnd()*.16;st.clk.push({t,a:.2+rnd()*.8});}}
  if(name==='lift-door'){st.bp=biquad('bp',600,1.4,sr);st.lp=biquad('lp',220,.7,sr);}
  if(name==='lift-clunk'){st.lp=biquad('lp',300,.8,sr);}
  if(name==='blades'){st.bp=biquad('bp',430,1.2,sr);st.hiss=biquad('bp',1900,1.4,sr);st.lp=biquad('lp',180,.7,sr);}
  if(name==='engine'){
    // monocilíndrico: explosiones a ~24 Hz (48 en 2 s, así el loop cierra) que excitan el escape
    st.r1=biquad('bp',92,3.5,sr);st.r2=biquad('bp',360,2.6,sr);st.r3=biquad('bp',1250,2,sr);st.lp=biquad('lp',400,.7,sr);
    const per=duration/48;st.fire=[];for(let k=0;k<48;k++)st.fire.push(Math.floor((k*per+(rnd()-.5)*per*.08)*sr));st.fi=0;st.env=0;
  }
  if(name==='birds'){
    // trinos: notas cortas con armónicos y glissando; cada variante (semilla) es otra "especie"
    const kind=Math.abs(seed)%4,notes=[];let t=.03+rnd()*.05;
    if(kind===0){const n=6+Math.floor(rnd()*6),f=2900+rnd()*600;for(let i=0;i<n;i++){notes.push({t,d:.035,f0:f*1.04,f1:f*.93,vib:0});t+=.055+rnd()*.012;}}
    else if(kind===1){const f=2500+rnd()*500;notes.push({t,d:.2,f0:f*1.1,f1:f,vib:.02});t+=.28;notes.push({t,d:.26,f0:f*.95,f1:f*.78,vib:.025});if(rnd()<.6){t+=.34;notes.push({t,d:.16,f0:f*.9,f1:f*.8,vib:.02});}}
    else if(kind===2){const n=2+Math.floor(rnd()*3);for(let i=0;i<n;i++){const f=1800+rnd()*400;notes.push({t,d:.07,f0:f,f1:f*1.85,vib:0});t+=.15+rnd()*.06;}}
    else{notes.push({t,d:.55+rnd()*.25,f0:2700+rnd()*300,f1:2300+rnd()*300,vib:.12,vr:22+rnd()*8});}
    st.notes=notes.filter((n)=>n.t+n.d<duration-.02);
  }
  for(let i=0;i<len;i++){
    const t=i/sampleRate, u=t/duration,n=noise();lo+=.10*(n-lo);slow+=.018*(n-slow);
    let v=0,env=1;
    switch(name){
      case 'step-grass': v=.35*lo+.13*n+.4*Math.sin(TAU*(90*t-60*t*t));env=Math.exp(-t*24)*(1+Math.exp(-(((t-.07)/.02)**2)));break;
      case 'step-hard': v=.24*n+.5*Math.sin(TAU*92*t)+.16*Math.sin(TAU*180*t);env=Math.exp(-t*32);break;
      case 'jump': v=.65*lo+.15*n;env=Math.sin(Math.PI*u)*Math.exp(-u*2);break;
      case 'land': v=.6*Math.sin(TAU*(72*t-45*t*t))+.4*lo+.11*n;env=Math.exp(-t*17);break;
      case 'hit': v=.6*Math.sin(TAU*(130*t-180*t*t))+.45*lo+.18*n;env=Math.exp(-t*24);break;
      // el Búnker: disparo (chasquido + estampido grave + cola), explosión (golpe sordo + ruido que rueda), billetes al aire
      case 'shot': v=.9*n*Math.exp(-t*70)+.7*Math.sin(TAU*(95*t-60*t*t))*Math.exp(-t*18)+.35*lo*Math.exp(-t*6);env=Math.min(1,t*4000);break;
      case 'boom': v=1.1*Math.sin(TAU*(55*t-18*t*t))*Math.exp(-t*3.5)+.9*slow*6*Math.exp(-t*1.4)+.5*n*Math.exp(-t*9);env=Math.min(1,t*800);break;
      // bola de fuego: soplido que ruge (ruido grave que crece y se va) con chisporroteos
      case 'fireball': {const crack=n>.93?(n-.93)*14:0;v=1.3*lo*(1+.6*Math.sin(TAU*9*t))+.5*slow*5+.35*(n-lo)*u+crack;env=Math.min(1,t*14)*Math.exp(-t*2.2);break;}
      case 'bills': {const fl=Math.abs(Math.sin(TAU*14*t+Math.sin(TAU*3*t)*2));v=.35*(n-lo)*fl+.15*n;env=Math.sin(Math.PI*u)**.6;break;}
      case 'swing': v=.7*lo+.06*n;env=Math.sin(Math.PI*u)**2;break;
      case 'pickup': v=.5*Math.sin(TAU*340*t)+.22*Math.sin(TAU*680*t)+.10*n;env=Math.exp(-t*32);break;
      case 'throw': v=.65*lo+.13*n;env=Math.sin(Math.PI*u)*Math.exp(-u);break;
      case 'drink': {const pulse=(t*6)%1;v=.38*Math.sin(TAU*(135*t+7*Math.sin(t*25)))+.12*lo;env=Math.sin(Math.PI*pulse)**4 * Math.sin(Math.PI*u);break;}
      case 'smoke': v=.50*lo+.08*n;env=Math.sin(Math.PI*u)**1.7;break;
      case 'spray': v=.32*n+.3*(n-lo);env=.65+.1*Math.sin(TAU*9*t);break;
      case 'engine': {
        // excitación: pulso + ráfaga de ruido en cada explosión; el escape resuena
        let x=.04*n;
        if(st.fi<st.fire.length&&i>=st.fire[st.fi]){st.env=.8+.4*rnd();st.fi++;}
        if(st.env>1e-4){x+=st.env*(.55+.45*n);st.env*=.9;}
        v=2.2*st.r1(x)+1.1*st.r2(x)+.25*st.r3(x)+.6*st.lp(n)*.5;
        env=.9;break;
      }
      case 'blades': {
        // cuchilla girando: ruido que "sopla" 55 veces por segundo (110 pasadas en 2 s) + pasto que silba
        const pass=Math.abs(Math.sin(Math.PI*55*t))**1.5;
        v=.55*st.bp(n)*(.45+.55*pass)+.14*st.hiss(n)*(.6+.4*pass)+.35*st.lp(n);
        break;
      }
      case 'horn': v=.19*Math.sin(TAU*392*t)+.18*Math.sin(TAU*493.88*t)+.06*Math.sin(TAU*784*t);break;
      case 'wind': v=.9*slow+.08*lo;env=.65+.25*Math.sin(TAU*t/6);break;
      case 'water': {
        st.mod+=(.00035)*(n*2-st.mod);
        st.fl+=.02*(Math.abs(noise())-st.fl); // titileo rápido de las gotas
        const burble=.6+.4*Math.sin(TAU*t/4+Math.sin(TAU*t*.5)*1.3);
        v=.05*st.low(n)+.34*st.mid(n)*(.45+1.1*st.fl)*burble+.14*st.hi(n)*(.5+st.fl);
        for(const b of st.bub){
          const bt=t-b.t;if(bt<0||bt>b.d*3)continue;
          const f=b.f*(1+.18*bt/b.d);v+=b.a*Math.sin(TAU*f*bt)*Math.exp(-bt/b.d)*Math.min(1,bt/.002);
        }
        env=.8+.1*Math.sin(TAU*t/4);break;
      }
      case 'birds': {
        for(const nt of st.notes){
          const bt=t-nt.t;if(bt<0||bt>nt.d)continue;
          const k=bt/nt.d,f=(nt.f0+(nt.f1-nt.f0)*k)*(1+nt.vib*Math.sin(TAU*(nt.vr||7)*bt));
          phase+=TAU*f/sampleRate;phase2+=TAU*f*2/sampleRate;
          v+=(.5*Math.sin(phase)+.13*Math.sin(phase2))*Math.sin(Math.PI*k)**2;
        }
        break;
      }
      // gota que cae en un charco: "plip" con el tono subiendo (la burbuja que se cierra) y un chasquido corto
      case 'drip': {const f=st.f0*(1+1.5*(1-Math.exp(-t*60)));phase+=TAU*f/sampleRate;v=.6*Math.sin(phase)+.14*Math.sin(2*phase)*Math.exp(-t*40)+.22*n*Math.exp(-t*220);env=Math.min(1,t/.002)*Math.exp(-t*(15+st.dec));break;}
      case 'lift-hum': {
        const hum=.5*Math.sin(TAU*50*t)+.28*Math.sin(TAU*100*t+1)+.16*Math.sin(TAU*150*t+2)+.07*Math.sin(TAU*300*t);
        let rat=0;for(const c of st.clk){const bt=t-c.t;if(bt>=0&&bt<.03)rat+=c.a*Math.exp(-bt*160);}
        v=.55*hum*(.8+.2*Math.sin(TAU*1.5*t))+.5*st.air(n)*(.7+.3*Math.sin(TAU*.5*t))+.35*st.lp(n)+.3*st.rat(n)*rat;
        break;
      }
      case 'lift-door': {
        // puerta neumática: soplido que sube y baja + rodamientos, y el golpe sordo al llegar al tope
        st.bp.set(500+900*Math.sin(Math.PI*Math.min(1,u*1.25)));
        const slide=Math.sin(Math.PI*Math.min(1,u*1.25))**.7;
        const bt=t-.8,thud=bt>0?(.9*Math.sin(TAU*85*bt)+.5*n)*Math.exp(-bt*30):0;
        v=.6*st.bp(n)*slide+.3*st.lp(n)*slide*(1+.5*Math.sin(TAU*31*t))+thud;
        break;
      }
      case 'lift-clunk': {
        // freno que se suelta / engancha: golpe grave con chapa que resuena
        v=.9*Math.sin(TAU*(68*t-20*t*t))*Math.exp(-t*9)+.35*Math.sin(TAU*423*t)*Math.exp(-t*14)+.2*Math.sin(TAU*1131*t)*Math.exp(-t*22)+.5*st.lp(n)*Math.exp(-t*25);
        env=Math.min(1,t*900);break;
      }
      case 'lift-ding': {
        // campanita de llegada: parciales de campana (inarmónicos) que se apagan a distinto ritmo
        const f=1318.5;v=.5*Math.sin(TAU*f*t)*Math.exp(-t*2.2)+.22*Math.sin(TAU*f*2.76*t)*Math.exp(-t*5)+.1*Math.sin(TAU*f*5.4*t)*Math.exp(-t*9)+.18*Math.sin(TAU*f*.5*t)*Math.exp(-t*3);
        env=Math.min(1,t*600);break;
      }
      case 'ui': v=.24*Math.sin(TAU*(u<.5?660:880)*t);env=Math.sin(Math.PI*u)**2;break;
      case 'gulp': {const f=150-180*u;phase+=TAU*f/sampleRate;v=.55*Math.sin(phase)+.25*lo;env=Math.exp(-(((u-.3)/.2)**2));break;}
      case 'cough': {const k=Math.floor(u*3),lu=(u*3)%1;v=.55*lo+.25*n+.2*Math.sin(TAU*(180-60*lu)*t);env=(k<3?1:0)*Math.exp(-lu*6)*(1-k*.25);break;}
      case 'pain': {const f=210-90*u;phase+=TAU*f/sampleRate;const saw=((phase/TAU)%1)*2-1;v=.35*saw*(.6+.4*Math.sin(TAU*7*t))+.2*lo;env=Math.sin(Math.PI*Math.min(1,u*1.3))**1.5;break;}
      case 'munch': {const k=Math.floor(u*4),lu=(u*4)%1;v=.55*n+.25*(n-lo);env=(k<4?1:0)*Math.exp(-lu*9)*(1-k*.18);break;}
      case 'burp': {const f=95+18*Math.sin(TAU*9*t)-30*u;phase+=TAU*f/sampleRate;const saw=((phase/TAU)%1)*2-1;v=.5*saw+.3*lo;env=Math.sin(Math.PI*u)**.8;break;}
    }
    // Short edge ramps remove clicks, including when looping ambient buffers.
    const ramp=Math.min(1,t/.005,(duration-t)/.012);
    out[i]=v*env*Math.max(0,ramp);
  }
  // nivel parejo con los sonidos viejos; y lo que se pase (los filtros resonantes suman) se normaliza: nunca recorta
  const gain=GAIN[name]||1;if(gain!==1)for(let i=0;i<len;i++)out[i]*=gain;
  let peak=0;for(let i=0;i<len;i++)peak=Math.max(peak,Math.abs(out[i]));
  if(peak>.9)for(let i=0;i<len;i++)out[i]*=.9/peak;
  out[0]=0;out[len-1]=0;return out;
}
