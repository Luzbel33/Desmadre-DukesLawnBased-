// YouTube's official iframe API; no proxying, extracting or downloading videos.
import { ZONES } from '../shared/mapdata.js';
const finite = (n, fallback=0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
export const clamp01 = n => Math.min(1, Math.max(0, finite(n)));
export function youtubeId(input) {
  const s=String(input||'').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  try {
    const u=new URL(s), host=u.hostname.toLowerCase();
    if (!['https:','http:'].includes(u.protocol)) return null;
    let id=null;
    if (host==='youtu.be' || host==='www.youtu.be') id=u.pathname.split('/')[1];
    else if (['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)) {
      id=u.searchParams.get('v') || u.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1];
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id||'') ? id : null;
  } catch { return null; }
}
export function mediaPosition(cur, now) {
  if (!cur) return 0;
  let t=cur.paused ? finite(cur.pos) : (finite(now)-finite(cur.start,finite(now)))/1000;
  t=Math.max(0,t); if (finite(cur.d)>0) t=Math.min(t,cur.d);return t;
}
export function screenGain(screen, pos) {
  if (!pos) return 0;
  const zone=ZONES[screen.zone];
  let d;
  if(zone) {
    // Distance to the room, NOT the wall-mounted screen; the whole cinema is audible.
    d=Math.hypot(Math.max(zone.x0-pos.x,0,pos.x-zone.x1),Math.max(zone.z0-pos.z,0,pos.z-zone.z1));
  } else d=Math.hypot(pos.x-screen.c[0],pos.z-screen.c[2]);
  const full=finite(screen.hearFull), max=Math.max(full+1,finite(screen.hearMax,60));
  if (d<=full) return 1;
  const x=clamp01(1-(d-full)/(max-full));return x*x*(3-2*x);
}
export function youtubeError(code) {
  return ({
    2:'El enlace o ID de YouTube no es válido.',
    5:'YouTube no pudo reproducir el video en este navegador. Probá otro video o recargá.',
    100:'El video fue eliminado, es privado o ya no está disponible.',
    101:'El propietario no permite insertar este video. Elegí otro o pulsá «Saltar».',
    150:'El propietario no permite insertar este video. Elegí otro o pulsá «Saltar».',
    153:'YouTube no recibió la identificación del sitio. Abrí el juego por http://localhost:3000 o HTTPS y revisá extensiones que eliminen Referer.',
  })[code] || `YouTube devolvió un error (${code}). Probá otro video o reintentá.`;
}
let pending=null;
export function loadYouTubeAPI(timeoutMs=16000) {
  if(globalThis.YT?.Player) return Promise.resolve(globalThis.YT);
  if(pending) return pending;
  pending=new Promise((resolve,reject)=>{
    const previous=globalThis.onYouTubeIframeAPIReady;
    const script=document.createElement('script');
    script.src='https://www.youtube.com/iframe_api';script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';
    const finish=(error)=>{
      clearTimeout(timer);script.onerror=null;
      globalThis.onYouTubeIframeAPIReady=previous;
      if(error){script.remove();pending=null;reject(error);} else resolve(globalThis.YT);
    };
    const timer=setTimeout(()=>finish(new Error('YouTube no respondió. Comprobá la conexión o si una extensión bloquea youtube.com.')),timeoutMs);
    script.onerror=()=>finish(new Error('No se pudo cargar YouTube. El juego y sus sonidos siguen funcionando sin esa conexión.'));
    globalThis.onYouTubeIframeAPIReady=()=>{try{previous?.();}finally{finish();}};
    document.head.appendChild(script);
  });return pending;
}
