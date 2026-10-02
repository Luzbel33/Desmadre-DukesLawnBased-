// Fumar y tomar con sonido (grabaciones CC0, ver assets/sfx/habitos/CREDITOS.txt):
// la pitada (con la brasa que chisporrotea), el humo que sale y a veces la tos; el sorbo con su glu-glu,
// el "ahh" de satisfacción con la voz de cada uno y, de vez en cuando, el eructo.
// Lo que va a pasar (tos, ahh, eructo) lo decide el que fuma o toma y viaja en el evento: todos oyen lo mismo.
const A = 'assets/sfx/habitos/';
const takes = (base, k) => Array.from({ length: k }, (_, i) => `${A}${base}-${i + 1}.ogg`);

export function habitManifest() {
  return {
    'smoke-in': takes('pitada', 3), 'bong-rip': takes('bong', 1), 'smoke-out': takes('exhalar', 4), cough: takes('tos', 6),
    sip: takes('sorbo', 3), gulp: takes('trago', 4),
    'ahh-m': takes('ahh-m', 2), 'ahh-f1': takes('ahh-f1', 2), 'ahh-f2': takes('ahh-f2', 2), 'ahh-f3': takes('ahh-f3', 2),
    'burp-m': takes('eructo-m', 5), 'burp-f': takes('eructo-f', 2),
  };
}

// qué tan seguido: el "ahh" casi siempre después de algo rico; el eructo, más con birra y fernet (tienen gas)
const FIZZY = new Set(['beer', 'fernet']);
export function drinkPlan(item) {
  const fizzy = FIZZY.has(item);
  return { ah: Math.random() < 0.6 ? 1 : 0, b: Math.random() < (fizzy ? 0.24 : 0.1) ? 1 : 0 };
}

// voz de vocals.js -> sus tomas: las tres mujeres tienen su "ahh"; los hombres comparten (cambia el tono)
function voiceTakes(voice) {
  const f = voice?.[0] === 'f';
  return { ahh: f ? `ahh-${voice === 'f' ? 'f1' : voice}` : 'ahh-m', burp: f ? 'burp-f' : 'burp-m' };
}

// kind: 'smoke' | 'bong' | 'drink'. where(): dónde suena (null = soy yo, sin espacializar).
// plan: { c: tose } para fumar; { ah, b } para tomar. vol baja todo (los parroquianos suenan más bajito).
export function playHabit(sfx, kind, plan = {}, { where = () => null, voice = 'm1', rate = 1, vol = 1, max = 18 } = {}) {
  if (!sfx) return;
  const at = (s, name, level, r = rate) => setTimeout(() => sfx.trigger(name, where(), level * vol, { rate: r, full: 2, max }), s * 1000);
  const v = voiceTakes(voice), coughRate = voice?.[0] === 'f' ? rate * 1.18 : rate; // la tos de ellas, más aguda
  if (kind === 'drink') {
    at(0.32, 'sip', 0.6, 1);
    if (plan.ah) at(1.3, v.ahh, 0.75);
    if (plan.b) at(plan.ah ? 2.05 : 1.45, v.burp, 0.8);
  } else if (kind === 'bong') {
    at(0.3, 'bong-rip', 0.6, 1);
    at(1.8, 'smoke-out', 0.6, 1);
    if (plan.c) at(2.45, 'cough', 0.75, coughRate);
  } else {
    at(0.22, 'smoke-in', 0.6, 1);
    at(0.92, 'smoke-out', 0.5, 1);
    if (plan.c) at(1.55, 'cough', 0.75, coughRate);
  }
}
