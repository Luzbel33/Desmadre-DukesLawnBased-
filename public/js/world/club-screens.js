// Las pantallas de las pistas del Búnker (una por sala que se baila: el club, el coffeeshop, la VIP, el Infierno y la
// psicodélica). Cada una tiene su marco y, mientras nadie pasó un video, un visualizador propio que late con el compás
// de la música de esa sala (un shader chico, sin texturas). Cuando alguien pone algo desde la cabina, el agujero de
// YouTube (media/screens.js) queda adelante y lo tapa; la música sintetizada de esa sala se calla (game/club.js).
import * as THREE from 'three';
import { SCREEN_BY_ID } from '../shared/mapdata.js';

const HAS_DOM = typeof document !== 'undefined';
// estilo de cada pantalla (el mismo nombre que la música de su sala en audio/clubmix.js)
export const BUNKER_SCREENS = { bunker: 'techno', bunker_cafe: 'dub', bunker_vip: 'deep', bunker_hell: 'hell', bunker_psico: 'psy' };
const STYLE_N = { techno: 0, dub: 1, deep: 2, hell: 3, psy: 4 };
const CAPTION = {
  techno: ['EL BÚNKER', 'techno en vivo'], dub: ['ÁMSTERDAM', 'dub & reggae'], deep: ['VIP', 'deep house'],
  hell: ['EL INFIERNO', 'industrial'], psy: ['LA MENTE', 'psytrance'],
};
const ACCENT = { techno: '#4ff0ff', dub: '#ffd23b', deep: '#ff7ad0', hell: '#ff5a20', psy: '#b8ff3a' };

function caption(style) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 288;
  const g = cv.getContext('2d'), [name, kind] = CAPTION[style];
  g.clearRect(0, 0, 512, 288);
  g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 8;
  g.fillStyle = ACCENT[style]; g.font = 'bold 22px Rubik, sans-serif'; g.textAlign = 'left';
  g.fillText('● EN VIVO', 22, 38);
  g.font = 'bold 30px "Metal Mania", Rubik, sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'right';
  g.fillText(name, 490, 250);
  g.font = '18px Rubik, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.75)';
  g.fillText(kind + '  ·  tu tema desde la cabina', 490, 274);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG = /* glsl */ `
  uniform float uT, uBeat, uKick, uStyle, uAspect; uniform sampler2D tCap; varying vec2 vUv;
  float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
  float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  vec3 hue(float x){ return 0.5 + 0.5 * cos(6.2832 * (x + vec3(0.0, 0.33, 0.67))); }
  void main(){
    vec2 uv = vUv, p = (uv - 0.5) * vec2(uAspect, 1.0);
    float k = uKick, bt = uBeat;
    vec3 col = vec3(0.0);
    if (uStyle < 0.5) {
      // techno: ecualizador de 28 barras con picos, grilla de fondo y barrido
      float n = 28.0, i = floor(uv.x * n), fx = fract(uv.x * n);
      float lvl = 0.18 + 0.55 * h1(i * 3.1 + floor(bt * 2.0)) * (0.55 + 0.45 * k) + 0.25 * k * (1.0 - abs(i / n - 0.5) * 2.0);
      float bar = step(0.12, fx) * step(fx, 0.88) * step(uv.y, lvl) * step(0.06, uv.y);
      float seg = step(0.3, fract(uv.y * 40.0));
      col = mix(vec3(0.1, 0.95, 1.0), vec3(1.0, 0.15, 0.75), uv.y * 1.3) * bar * seg * 1.4;
      col += vec3(1.0) * step(abs(uv.y - lvl - 0.025), 0.007) * step(0.12, fx) * step(fx, 0.88);
      vec2 gr = abs(fract(p * 8.0 + vec2(0.0, uT * 0.4)) - 0.5);
      col += vec3(0.05, 0.12, 0.2) * step(0.47, max(gr.x, gr.y)) * (1.0 - bar);
      col += vec3(0.25, 0.0, 0.3) * smoothstep(0.03, 0.0, abs(uv.x - fract(uT * 0.25))) ;
    } else if (uStyle < 1.5) {
      // dub: franjas rasta onduladas que respiran y un parlante que bombea en el medio
      float w = uv.y + sin(uv.x * 6.0 + uT * 0.9) * 0.05 + sin(uv.x * 13.0 - uT * 0.6) * 0.02;
      vec3 r = vec3(0.85, 0.12, 0.1), y = vec3(1.0, 0.8, 0.12), g = vec3(0.1, 0.6, 0.2);
      col = w > 0.66 ? r : w > 0.33 ? y : g;
      col *= 0.55 + 0.15 * sin(uT * 0.5);
      float d = length(p), cone = 0.2 + 0.035 * k;
      float ring = smoothstep(0.012, 0.0, abs(d - cone)) + smoothstep(0.01, 0.0, abs(d - cone * 0.55)) * 0.7;
      col = mix(col, vec3(0.04), smoothstep(cone + 0.01, cone, d) * 0.85);
      col += vec3(1.0, 0.92, 0.6) * ring;
      col += vec3(0.6, 0.55, 0.4) * smoothstep(cone * 0.25, 0.0, d) * (0.4 + 0.6 * k);
      // ondas de sonido que salen del parlante
      col += vec3(1.0, 0.85, 0.4) * 0.25 * smoothstep(0.02, 0.0, abs(fract(d * 3.0 - uT * 0.75) - 0.5) - 0.48) * smoothstep(cone, cone + 0.1, d);
    } else if (uStyle < 2.5) {
      // deep house: seda rosa y violeta que fluye, anillos suaves con cada golpe
      float f = fbm(p * 1.8 + vec2(uT * 0.08, -uT * 0.05));
      float s = sin(p.x * 3.0 + f * 5.0 + uT * 0.4) * 0.5 + 0.5;
      col = mix(vec3(0.22, 0.03, 0.28), vec3(1.0, 0.35, 0.72), s * s);
      col += vec3(1.0, 0.75, 0.55) * pow(f, 3.0) * 0.6;
      float d = length(p);
      col += vec3(1.0, 0.5, 0.85) * smoothstep(0.02, 0.0, abs(d - (0.08 + fract(bt) * 0.7))) * (1.0 - fract(bt)) * 0.9;
    } else if (uStyle < 3.5) {
      // infierno: fuego que sube y un pentagrama que se prende con el bombo
      vec2 q = vec2(p.x * 2.2, uv.y * 2.0 - uT * 0.9);
      float f = fbm(q + fbm(q * 1.5 + uT * 0.2));
      float heat = clamp(f * 1.6 - uv.y * 0.95 + 0.15 + k * 0.2, 0.0, 1.0);
      col = mix(vec3(0.05, 0.0, 0.0), vec3(1.0, 0.25, 0.02), smoothstep(0.1, 0.6, heat));
      col = mix(col, vec3(1.0, 0.85, 0.35), smoothstep(0.6, 0.95, heat));
      float r = length(p - vec2(0.0, 0.04)), a = atan(p.y - 0.04, p.x);
      float circle = smoothstep(0.01, 0.0, abs(r - 0.3));
      float star = 0.0;
      for (int i = 0; i < 5; i++) {
        float a0 = 1.5708 + float(i) * 2.5133, a1 = a0 + 2.5133 * 2.0;
        vec2 A = 0.3 * vec2(cos(a0), sin(a0)), B = 0.3 * vec2(cos(a1), sin(a1)), pa = p - vec2(0.0, 0.04) - A, ba = B - A;
        float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        star = max(star, smoothstep(0.009, 0.0, length(pa - ba * hh)));
      }
      col += vec3(1.0, 0.1, 0.05) * (circle + star) * (0.25 + 1.4 * k);
    } else {
      // psytrance: caleidoscopio de seis gajos que hace zoom para adentro, colores que giran
      float r = length(p), a = atan(p.y, p.x);
      float seg = 6.2832 / 6.0; a = mod(a, seg); a = abs(a - seg * 0.5);
      vec2 q = vec2(cos(a), sin(a)) * r;
      float z = 1.0 / max(r, 0.04) + uT * 0.9;
      float pat = sin(q.x * 14.0 + uT) * sin(q.y * 14.0 - uT * 1.3) + sin(z * 2.0 + a * 4.0);
      col = hue(pat * 0.25 + uT * 0.07 + r * 0.6) * (0.55 + 0.45 * smoothstep(-0.2, 0.8, pat));
      col *= 0.75 + 0.6 * k * smoothstep(0.5, 0.0, r);
      col += vec3(1.0) * smoothstep(0.03, 0.0, abs(fract(z * 0.5) - 0.5) - 0.47) * 0.3;
    }
    // viñeta, líneas de LED y el texto (nombre de la sala)
    col *= 0.92 + 0.08 * sin(uv.y * 900.0);
    col *= mix(0.55, 1.0, smoothstep(0.75, 0.3, length((uv - 0.5) * vec2(1.0, 1.25))));
    vec4 c = texture2D(tCap, uv);
    col = mix(col, c.rgb, c.a);
    gl_FragColor = vec4(col, 1.0);
  }`;

// club: el Club (world/club.js) con su grupo actual (el de la sala que se está armando) y su lista de animaciones
export function bunkerScreen(club, id) {
  const def = SCREEN_BY_ID[id], style = BUNKER_SCREENS[id];
  if (!def || !style) return null;
  const nx = Math.sin(def.yaw), nz = Math.cos(def.yaw), [x, y, z] = def.c;
  // marco: una caja negra apenas más grande, pegada atrás de la imagen, con un filo que brilla del color de la sala
  club.deco('black', x - nx * 0.06, y, z - nz * 0.06, def.w + 0.18, def.h + 0.18, 0.08, { yaw: def.yaw });
  club.deco('darkgray', x - nx * 0.035, y - def.h / 2 - 0.1, z - nz * 0.035, def.w + 0.2, 0.025, 0.1, { yaw: def.yaw });
  if (!HAS_DOM) return null;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uBeat: { value: 0 }, uKick: { value: 0 }, uStyle: { value: STYLE_N[style] }, uAspect: { value: def.w / def.h }, tCap: { value: caption(style) } },
    vertexShader: VERT, fragmentShader: FRAG, toneMapped: false,
  });
  // un poco atrás del agujero de YouTube (que se dibuja primero y gana por profundidad cuando hay un video)
  const m = club.mesh(new THREE.PlaneGeometry(def.w, def.h), mat, x - nx * 0.012, y, z - nz * 0.012, { yaw: def.yaw });
  m.receiveShadow = false; m.name = 'bunker-screen-' + id;
  club.anim.push((t, dt, B) => {
    const u = mat.uniforms;
    u.uT.value = t % 1000;
    u.uBeat.value = (B?.beat || 0) % 1024;
    u.uKick.value = B ? Math.exp(-B.f * 5) : 0;
  });
  return m;
}
