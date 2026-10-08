// Cuadros animados de la sala psicodélica: arte propio inspirado en los collages 3D de capas con ciclos de gradiente
// completos (marcos apilados que sobresalen como escalones, guardas aztecas, olas japonesas, rayos y túneles).
// Todo es shader (ni una textura): cada cuadro es un plano con un "motivo" y su marco 3D es una sola malla de anillos
// apilados que comparten un material (el anillo y el cuadro van en el atributo aF). Laten con la música (uBeat).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PSY_ART = { sol: 0, portal: 1, cuadros: 2, tunel: 3, atrapasuenos: 4, hongo: 5 };

const COMMON = /* glsl */ `
  #define TAU 6.2831853
  uniform float uT, uBeat;
  vec3 pal(float t){ return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67))); }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
  // 1 adentro (d < 0), 0 afuera, con el borde suavizado al tamaño del pixel
  float fill(float d){ float w = fwidth(d) * 0.75 + 1e-5; return smoothstep(w, -w, d); }
  float line(float d, float th){ return fill(abs(d) - th); }
  // los colores se piensan en sRGB: van a lineal y three los convierte a la salida (directo a pantalla o por el post)
  #define out_(c) gl_FragColor = vec4(pow(max(c, 0.0) * (0.82 + 0.18 * exp(-fract(uBeat) * 3.0)), vec3(2.2)), 1.0); gl_FragColor = linearToOutputTexel(gl_FragColor)
  // una banda de marco: u a lo ancho (0 = borde de afuera), s a lo largo (en anchos de banda), k = dibujo, h = tono
  vec3 band(float u, float s, float k, float h){
    vec3 fg = pal(h), bg = pal(h + 0.5) * 0.22 + 0.02, c;
    float m = mod(floor(k + 0.5), 5.0);
    if (m < 0.5) { float st = floor(abs(fract(s * 0.5) - 0.5) * 8.0) / 4.0; c = mix(bg, fg, fill(u - 0.15 - st * 0.7)); } // escalones
    else if (m < 1.5) c = mix(bg, fg, fill(-sin(s * TAU * 0.5) * sin(u * TAU * 0.5 + 1.57))); // tablero
    else if (m < 2.5) c = mix(bg, pal(h + 0.3), fill(length(vec2(fract(s) - 0.5, u - 0.5)) - 0.3)); // puntos
    else if (m < 3.5) c = pal(h + floor(s * 2.0) * 0.08) * (0.55 + 0.45 * u); // escalera de arcoíris
    else c = fg * (1.2 - u * 0.85); // biselado
    return c * (0.25 + 0.75 * smoothstep(0.0, 0.1, min(u, 1.0 - u)));
  }
`;

const PAINT_FRAG = /* glsl */ `
  uniform float uKind, uSeed; uniform vec2 uHalf; varying vec2 vUv;
  float H0;

  // piedra del sol: anillos que giran para lados opuestos y una cara que saca la lengua
  vec3 sol(vec2 q){
    float r = length(q), a = atan(q.y, q.x), da = a / TAU;
    vec3 col = mix(vec3(0.03, 0.05, 0.35), vec3(0.22, 0.02, 0.45), 0.5 + 0.5 * q.y);
    float ra = (a + uT * 0.1) * 32.0;
    col += pal(H0 + 0.5 + floor(ra / TAU) * 0.03) * 0.35 * fill(-sin(ra));
    if (r > 0.975) return col;
    vec3 c;
    if (r > 0.8) { // glifos
      float aa = da + uT * 0.012, id = floor(aa * 20.0);
      vec2 g = vec2((fract(aa * 20.0) - 0.5) * 1.6, (r - 0.8) / 0.175 - 0.5);
      float b = max(abs(g.x), abs(g.y)) - 0.36;
      c = pal(H0 + id * 0.05) * 0.35;
      c = mix(c, pal(H0 + id * 0.11 + 0.2), fill(b));
      c = mix(c, vec3(0.02), line(b + 0.1, 0.025));
      c = mix(c, pal(H0 + id * 0.11 + 0.6), fill(length(g) - 0.1 - 0.06 * hash(vec2(id, 3.0))));
    } else if (r > 0.62) { // rayos triangulares
      float aa = da - uT * 0.02, t = abs(fract(aa * 16.0) - 0.5) * 2.0;
      c = mix(pal(H0 + 0.5) * 0.25, pal(H0 + floor(aa * 16.0) * 0.0625), fill((r - 0.62) / 0.18 - (1.0 - t)));
    } else if (r > 0.47) { // anillo de cuentas
      float aa = da + uT * 0.03;
      vec2 g = vec2((fract(aa * 26.0) - 0.5) * r * TAU / 26.0, r - 0.545);
      c = mix(pal(H0 + 0.25) * 0.3, pal(H0 + 0.75 + floor(aa * 26.0) * 0.04), fill(length(g) - 0.045));
    } else if (r > 0.33) { // rombos
      float aa = da - uT * 0.04;
      vec2 g = vec2((fract(aa * 8.0) - 0.5) * 2.0, (r - 0.4) / 0.07);
      c = mix(pal(H0 + 0.1) * 0.3, pal(H0 + 0.4), fill(abs(g.x) + abs(g.y) * 0.5 - 0.8));
      c = mix(c, pal(H0 + 0.9), fill(abs(g.x) + abs(g.y) * 0.5 - 0.35));
    } else { // la cara
      vec2 f = q / 0.33;
      c = pal(H0 + 0.15) * 0.85 + 0.12;
      c = mix(c, pal(H0 + 0.65), fill(abs(length(f) - 0.9) - 0.07));
      vec2 e = vec2(abs(f.x) - 0.36, f.y - 0.22);
      c = mix(c, vec3(0.98), fill(length(e * vec2(1.0, 1.4)) - 0.17));
      c = mix(c, vec3(0.02), fill(length(e - vec2(0.04 * sin(uT * 0.7), 0.0)) - 0.08));
      c = mix(c, pal(H0 + 0.4), fill(max(abs(f.x) - 0.06 + f.y * 0.12, abs(f.y + 0.02) - 0.12))); // nariz
      c = mix(c, vec3(0.05), fill(max(abs(f.x) - 0.3, abs(f.y + 0.3) - 0.08)));
      vec2 tq = f - vec2(0.0, -0.36);
      float tl = 0.45 + 0.08 * sin(uT * 2.0);
      c = mix(c, vec3(0.95, 0.12, 0.3), fill(max(abs(tq.x) - 0.12 - tq.y * 0.25, max(tq.y, -tq.y - tl))));
    }
    float sep = max(max(line(r - 0.8, 0.007), line(r - 0.62, 0.007)), max(line(r - 0.47, 0.007), line(r - 0.33, 0.007)));
    c = mix(c, vec3(0.01), sep);
    return mix(c, pal(H0 + 0.5), line(r - 0.965, 0.012));
  }

  // portal: rayos ondulados, dos columnas de ADN con cúpulas, un aro de arcoíris y un túnel de oro y plata
  vec3 portal(vec2 q){
    vec2 o = q - vec2(0.0, 1.2);
    float w = atan(o.x, -o.y) * 9.0 + sin(length(o) * 12.0 - uT * 2.0) * 0.35;
    vec3 col = pal(H0 + floor(w) * 0.09 + 0.3) * (0.55 + 0.45 * fract(w));
    col *= 0.3 + 0.7 * smoothstep(0.0, 0.08, min(fract(w), 1.0 - fract(w)));
    float x = abs(q.x) - 0.83, ph = q.y * 10.0 + uT * 1.5;
    if (abs(x) < 0.15 && q.y > -1.0 && q.y < 0.55) {
      col = mix(col, vec3(0.02, 0.0, 0.06), 0.75 * fill(abs(x) - 0.13));
      float hx = 0.09 * sin(ph);
      col = mix(col, vec3(0.9), fill(abs(x) - abs(hx)) * line(fract(q.y * 12.0) - 0.5, 0.07) * 0.7);
      col = mix(col, pal(H0 + q.y), line(x - hx, 0.014));
      col = mix(col, pal(H0 + q.y + 0.5), line(x + hx, 0.014));
    }
    vec2 dm = vec2(x, q.y - 0.66);
    float dome = max(length(dm * vec2(1.0, 0.85)) - 0.13, -dm.y - 0.1);
    dome = min(dome, max(abs(dm.x) - 0.12 + dm.y * 0.4 - 0.12, abs(dm.y - 0.18) - 0.08));
    col = mix(col, pal(H0 + 0.6 + dm.y * 2.0) * (0.6 + 0.4 * smoothstep(-0.1, 0.12, -dm.x * sign(q.x))), fill(dome));
    col = mix(col, vec3(0.02), line(dome, 0.005));
    float r = length(q);
    if (r < 0.8) {
      if (r > 0.6) col = pal(H0 + floor((r - 0.6) / 0.2 * 7.0) / 7.0 - uT * 0.05);
      else {
        float L = log(max(r, 1e-3)) / log(0.82) - uT * 0.8;
        vec3 metal = mix(vec3(1.0, 0.75, 0.22), vec3(0.85, 0.88, 0.96), 0.5 + 0.5 * sin(uT * 0.4));
        col = metal * (0.25 + 0.75 * fract(L)) * smoothstep(0.0, 0.14, r);
        col = mix(col, vec3(0.02), fill(fract(L) - 0.06) * 0.8);
        col = mix(col, vec3(1.0), fill(r - 0.035));
      }
      col = mix(col, vec3(0.01), max(line(r - 0.6, 0.008), line(r - 0.8, 0.01)));
    }
    vec2 ec = q - vec2(0.0, 0.9);
    col = mix(col, vec3(0.95), fill(length(ec) - 0.075));
    col = mix(col, vec3(0.01), fill(length(ec - vec2(0.03 * sin(uT * 0.5), 0.0)) - 0.065));
    return col;
  }

  // cuadros dentro de cuadros que se meten para siempre, con una palmera sobre una loma de arcoíris en el fondo
  vec3 cuadros(vec2 q){
    float m = max(abs(q.x), abs(q.y));
    if (m > 0.22) {
      float L = log(m) / log(0.8) + uT * 0.35, bi = floor(L);
      float s = (abs(q.x) > abs(q.y) ? q.y : q.x) / m * 3.0;
      return band(fract(L), s, bi, uSeed * 0.31 + bi * 0.11 - uT * 0.03);
    }
    vec2 f = q / 0.22;
    vec3 col = pal(H0 + 0.55 + f.y * 0.15) * 0.8;
    vec2 sc = f - vec2(0.45, 0.5);
    float sr = length(sc);
    if (sr < 0.28) col = pal(H0 + floor(sr * 30.0) * 0.07 - uT * 0.2);
    float hr = length(f - vec2(0.0, -1.5));
    if (hr < 1.15) col = pal(H0 + floor(hr * 14.0) * 0.07 + uT * 0.1) * 0.9;
    float tx = -0.15 + 0.2 * (f.y + 0.4) + 0.06 * sin(f.y * 3.0);
    vec2 top = vec2(-0.15 + 0.2 * 1.05 + 0.06 * sin(1.95), 0.65);
    float palm = max(abs(f.x - tx) - 0.05 + f.y * 0.012, max(-0.5 - f.y, f.y - 0.66));
    for (int k = 0; k < 6; k++) {
      float ang = -0.25 + float(k) * 0.72 + 0.06 * sin(uT * 1.3 + float(k));
      vec2 l = rot(-ang) * (f - top);
      l.y += 0.55 * l.x * l.x;
      palm = min(palm, length(vec2((l.x - 0.3) / 0.32, l.y / 0.07)) * 0.07 - 0.07);
    }
    col = mix(col, vec3(0.03, 0.01, 0.05), fill(palm));
    col = mix(col, pal(H0 + 0.2), line(palm, 0.01));
    return mix(col, vec3(0.01), line(m / 0.22 - 1.0, 0.02));
  }

  // túnel op-art: cuadrados anidados que se retuercen
  vec3 tunel(vec2 q){
    vec3 col = vec3(0.01);
    float tw = sin(uT * 0.35) * 0.1;
    q = rot(uT * 0.05) * q;
    for (int i = 0; i < 40; i++) {
      float fi = float(i), s = pow(0.93, fi);
      vec2 p = rot(fi * tw) * q;
      float d = max(abs(p.x), abs(p.y)) - s;
      col = mix(col, pal(H0 + fi * 0.025 - uT * 0.05) * (0.45 + 0.55 * s), line(d, 0.004 + 0.006 * s));
    }
    return col;
  }

  // atrapasueños: tela de araña que gira, aro de arcoíris, plumas que se hamacan y cielo con estrellas
  vec3 atrapasuenos(vec2 q){
    vec3 col = mix(vec3(0.12, 0.04, 0.34), vec3(0.02, 0.24, 0.34), 0.5 - 0.5 * q.y);
    vec2 sg = floor(q * 14.0), sf = fract(q * 14.0) - 0.5;
    float st = hash(sg);
    col += vec3(1.0) * step(0.86, st) * fill(length(sf) - 0.07 * (0.5 + 0.5 * sin(uT * 3.0 + st * 40.0)));
    vec2 ca = q - vec2(0.0, 0.05);
    float ra = length(ca);
    if (ca.y > 0.0 && ra > 0.7 && ra < 0.92) col = pal(H0 + floor((ra - 0.7) / 0.22 * 7.0) / 7.0 - uT * 0.05);
    for (int k = 0; k < 3; k++) {
      float fx = (float(k) - 1.0) * 0.3, sw = 0.04 * sin(uT * 1.2 + float(k) * 2.0);
      float top = -0.5 + abs(fx) * 0.3;
      vec2 sp = q - vec2(fx, 0.0);
      float t = clamp((top - q.y) / 0.32, 0.0, 1.0);
      col = mix(col, vec3(0.9), line(sp.x - sw * t, 0.006) * step(q.y, top) * step(top - 0.32, q.y));
      vec2 fp = q - vec2(fx + sw, top - 0.47);
      float fe = length(fp / vec2(0.065, 0.15)) - 1.0;
      col = mix(col, pal(H0 + floor(fp.y * 40.0) * 0.06 + float(k) * 0.3), fill(fe * 0.065));
      col = mix(col, vec3(0.02), line(fp.x, 0.004) * fill(fe * 0.065));
    }
    float r = length(q), a = atan(q.y, q.x) + uT * 0.06;
    if (r < 0.57) {
      if (r > 0.5) {
        col = pal(H0 + a / TAU * 2.0 - uT * 0.15);
        col *= 0.6 + 0.4 * smoothstep(0.0, 0.03, min(r - 0.5, 0.57 - r));
      } else {
        col = mix(col, vec3(0.03, 0.01, 0.08), 0.6);
        float sec = TAU / 16.0, am = mod(a, sec) - sec * 0.5;
        float rp = r * cos(am) / cos(sec * 0.5);
        float L = log(max(rp, 1e-3) / 0.5) / log(0.78) - uT * 0.3;
        col = mix(col, pal(H0 + floor(L) * 0.12 + 0.3), line(fract(L + 0.5) - 0.5, 0.05));
        col = mix(col, vec3(0.92), line(r * sin(abs(am)), 0.003));
        col = mix(col, vec3(0.0), fill(r - 0.06));
        col = mix(col, pal(H0), line(r - 0.06, 0.008));
      }
      for (int k = 0; k < 4; k++) {
        float ba = float(k) * 1.5708 + 0.785 + uT * 0.06;
        col = mix(col, pal(H0 + float(k) * 0.25 + 0.5), fill(length(q - 0.535 * vec2(cos(ba), sin(ba))) - 0.035));
      }
    }
    return col;
  }

  // olas japonesas (seigaiha): escamas de anillos; la fila de más abajo tapa a la de arriba
  vec3 olas(vec2 q, float top){
    vec2 p = q / 0.16;
    p.x += uT * 0.3;
    float jy = floor(p.y / 0.25), tp = top / 0.16;
    for (int k = -2; k <= 2; k++) {
      float j = jy + float(k);
      if (j * 0.25 > tp) continue;
      float off = mod(j, 2.0) * 0.5;
      vec2 c = vec2(floor(p.x - off + 0.5) + off, j * 0.25);
      float d = length(p - c);
      if (d < 0.5) {
        float v = fract(d * 6.0);
        vec3 fg = pal(H0 + j * 0.05 + 0.5 - uT * 0.04), bg = pal(H0 + j * 0.05 - uT * 0.04) * 0.3;
        vec3 c3 = mix(bg, fg, smoothstep(0.35, 0.5, v) * smoothstep(0.95, 0.8, v));
        return c3 * (0.35 + 0.65 * smoothstep(0.5, 0.42, d));
      }
    }
    return vec3(-1.0);
  }

  // hongo que brilla sobre olas, remolinos en el cielo y un orbe partido que gira
  vec3 hongo(vec2 q){
    vec3 col = mix(vec3(0.02, 0.0, 0.08), vec3(0.2, 0.03, 0.32), 0.5 + 0.5 * q.y);
    vec2 cg = q * 2.6 + vec2(uT * 0.05, 0.0), id = floor(cg), f = fract(cg) - 0.5;
    float hs = hash(id), fr = length(f);
    if (hs > 0.55) col = mix(col, pal(H0 + hs) * 0.75, fill(fr - 0.34) * fill(-sin(atan(f.y, f.x) + fr * 26.0 - uT)) * 0.85);
    vec2 o = q - vec2(0.56, 0.6);
    float od = length(o) - 0.15, side = dot(o, vec2(cos(uT * 0.5), sin(uT * 0.5)));
    vec3 orb = mix(pal(H0 + 0.5), pal(H0), fill(-side)) * (0.75 + 0.5 * smoothstep(0.15, 0.0, length(o - vec2(-0.05, 0.05))));
    col = mix(col, orb, fill(od));
    col = mix(col, vec3(0.95), line(od, 0.006));
    vec3 w = olas(q, -0.5);
    if (w.r >= 0.0) col = w;
    vec2 hc = (q - vec2(0.0, 0.02)) * vec2(1.0, 1.4);
    col += pal(H0 + 0.2) * 0.45 * exp(-max(0.0, length(hc) - 0.42) * 7.0) * (0.8 + 0.2 * sin(uT * 2.0));
    float stem = max(abs(q.x) - 0.075 - 0.03 * (-q.y), abs(q.y + 0.27) - 0.27);
    col = mix(col, vec3(0.95, 0.9, 0.82) * (0.7 + 0.3 * smoothstep(-0.07, 0.05, q.x)), fill(stem));
    col = mix(col, vec3(0.02), line(stem, 0.005));
    vec2 cq = q - vec2(0.0, -0.02);
    float cap = max((length(cq / vec2(0.46, 0.34)) - 1.0) * 0.34, -cq.y);
    vec3 cc = pal(H0 + floor(length(cq * vec2(1.0, 1.35)) * 14.0) * 0.07 - uT * 0.12);
    for (int k = 0; k < 6; k++) {
      float fk = float(k);
      vec2 sp = vec2(sin(fk * 2.4) * 0.3, 0.06 + fract(fk * 0.37) * 0.22);
      cc = mix(cc, vec3(0.98), fill(length(cq - sp) - 0.035 - 0.015 * fract(fk * 0.61)));
    }
    col = mix(col, cc, fill(cap));
    col = mix(col, vec3(0.02), line(cap, 0.006));
    return col;
  }

  void main(){
    H0 = uSeed * 0.3 - uT * 0.06;
    vec2 p = (vUv - 0.5) * 2.0 * uHalf, ap = abs(p);
    float ex = uHalf.x - ap.x, ey = uHalf.y - ap.y, e = min(ex, ey), bw = 0.065, nb = 2.0;
    vec3 col;
    if (e < bw * nb) {
      float bi = floor(e / bw), dir = mod(bi, 2.0) * 2.0 - 1.0;
      float s = (ex < ey ? p.y : p.x) / bw;
      col = band(fract(e / bw), s + dir * uT * 0.8, bi + uSeed * 2.0, uSeed * 0.31 + bi * 0.13 - uT * 0.07);
    } else {
      vec2 q = p / (min(uHalf.x, uHalf.y) - bw * nb);
      if (uKind < 0.5) col = sol(q);
      else if (uKind < 1.5) col = portal(q);
      else if (uKind < 2.5) col = cuadros(q);
      else if (uKind < 3.5) col = tunel(q);
      else if (uKind < 4.5) col = atrapasuenos(q);
      else col = hongo(q);
    }
    out_(col);
  }
`;

const FRAME_FRAG = /* glsl */ `
  varying vec3 vP, vN; varying vec4 vF;
  void main(){
    float layer = mod(vF.x + 0.5, 10.0) - 0.5, seed = floor((vF.x + 0.5) / 10.0);
    float h = seed * 0.31 + layer * 0.14 - uT * 0.08, dir = mod(layer, 2.0) * 2.0 - 1.0;
    vec2 ap = abs(vP.xy);
    float ex = vF.y - ap.x, ey = vF.z - ap.y, s = (ex < ey ? vP.y : vP.x) / vF.w;
    vec3 col;
    // de frente, la guarda; los costados son rayas de arcoíris apiladas (los "ciclos de gradiente" de las capas)
    if (abs(vN.z) > 0.5) col = band(clamp(min(ex, ey) / vF.w, 0.0, 1.0), s + dir * uT * 0.6, layer + seed, h) * 1.1;
    else col = pal(h + floor(vP.z / 0.014) * 0.09 - uT * 0.1) * (0.45 + 0.35 * fract(vP.z / 0.014));
    col += vec3(0.9) * pow(max(0.0, sin(s * 0.25 + vP.z * 8.0 - uT * 1.6 + layer * 0.7)), 30.0) * 0.4; // brillo cromado que corre
    out_(col);
  }
`;

const UV_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const FRAME_VERT = 'attribute vec4 aF; varying vec3 vP, vN; varying vec4 vF; void main(){ vP = position; vN = normal; vF = aF; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

// anim: la lista de animaciones del ala ((t, dt, B) => ...); todos los cuadros comparten los tiempos
export function psyArtKit(anim) {
  const time = { uT: { value: 0 }, uBeat: { value: 0 } };
  anim.push((t, dt, B) => { time.uT.value = t % 1000; time.uBeat.value = (B?.beat || 0) % 1024; });
  const frameMat = new THREE.ShaderMaterial({ uniforms: time, vertexShader: FRAME_VERT, fragmentShader: COMMON + FRAME_FRAG });
  return {
    // el lienzo (plano de 2·hw x 2·hh mirando a +z)
    painting(kind, seed, hw, hh) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...time, uKind: { value: kind }, uSeed: { value: seed }, uHalf: { value: new THREE.Vector2(hw, hh) } },
        vertexShader: UV_VERT, fragmentShader: COMMON + PAINT_FRAG,
      });
      return new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hh * 2), mat);
    },
    // marco 3D: anillos apilados desde la pared (z = 0) hacia +z; los de adentro sobresalen más, como escalones
    frame(seed, hw, hh, { layers = 4, rw = 0.085, d0 = 0.05, dd = 0.05 } = {}) {
      const geos = [];
      for (let i = 0; i < layers; i++) {
        const ho = hw + (layers - i) * rw, vo = hh + (layers - i) * rw, dep = d0 + i * dd;
        for (const [x, y, w, h] of [[0, vo - rw / 2, ho * 2, rw], [0, -vo + rw / 2, ho * 2, rw], [ho - rw / 2, 0, rw, (vo - rw) * 2], [-ho + rw / 2, 0, rw, (vo - rw) * 2]]) {
          const g = new THREE.BoxGeometry(w, h, dep);
          g.translate(x, y, dep / 2);
          const n = g.attributes.position.count, f = new Float32Array(n * 4);
          for (let k = 0; k < n; k++) f.set([i + seed * 10, ho, vo, rw], k * 4);
          g.setAttribute('aF', new THREE.BufferAttribute(f, 4));
          geos.push(g);
        }
      }
      const g = mergeGeometries(geos, false);
      for (const x of geos) x.dispose();
      return new THREE.Mesh(g, frameMat);
    },
  };
}
