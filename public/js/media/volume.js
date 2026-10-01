import { clamp01 } from './youtube.js';
const KEY = 'dukes.youtube.volume';
export function readVideoVolume(fallback = .7, storage = undefined) {
  try { const raw = (storage === undefined ? globalThis.localStorage : storage)?.getItem(KEY); if (raw !== null && raw !== undefined && Number.isFinite(+raw)) return clamp01(+raw); } catch {}
  return clamp01(fallback);
}
export function mountVideoVolume(manager, slot) {
  if (!slot || manager.volumeUI) return;
  const doc = manager.doc, row = doc.createElement('div'); row.className = 'media-volume row';
  const label = doc.createElement('label'); label.htmlFor = 'media-volume'; label.textContent = 'YouTube · solo vos';
  const input = doc.createElement('input'); input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1'; input.id = 'media-volume'; input.setAttribute('aria-label', 'Volumen personal de YouTube');
  const output = doc.createElement('output'); output.htmlFor = input.id;
  const mute = doc.createElement('button'); mute.type = 'button'; mute.id = 'media-mute';
  Object.assign(row.style, { alignItems: 'center', flexWrap: 'wrap', gap: '10px' });
  Object.assign(label.style, { flex: '0 0 auto' }); Object.assign(input.style, { flex: '1', minWidth: '100px' });
  let previous = manager.videoVolume || .7;
  const refresh = () => { input.value = String(Math.round(manager.videoVolume * 100)); output.textContent = input.value + '%'; mute.textContent = manager.videoVolume ? 'Silenciar' : 'Activar'; mute.setAttribute('aria-pressed', String(manager.videoVolume === 0)); };
  const set = value => { manager.videoVolume = clamp01(value); manager.lastTick = -Infinity; try { globalThis.localStorage?.setItem(KEY, String(manager.videoVolume)); } catch {} refresh(); };
  input.addEventListener('input', () => set(+input.value / 100));
  mute.addEventListener('click', () => { if (manager.videoVolume) { previous = manager.videoVolume; set(0); } else { set(previous); manager.unlock(); } });
  row.append(label, input, output, mute); (doc.getElementById('media-status') || slot).after(row);
  manager.volumeUI = row; refresh();
}
