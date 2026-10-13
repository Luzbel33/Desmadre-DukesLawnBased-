// Personal third-person framing. The default preserves the existing camera side.
const KEY = 'dukes.camera.shoulder';
const SIDES = ['left', 'center', 'right'];
export function readCameraShoulder(storage) {
  try { const value = storage?.getItem(KEY); if (SIDES.includes(value)) return value; } catch {}
  return 'left';
}
// la rueda de vistas (Y sostenida) elige el hombro sin pasar por la pausa: queda igual que si lo elegías ahí
export function setCameraShoulder(value, control, options, storage) {
  if (!SIDES.includes(value)) return false;
  options.cameraShoulder = value;
  if (control) control.value = value;
  try { storage?.setItem(KEY, value); } catch {}
  return true;
}
export function setupCameraShoulder(control, options, storage) {
  if (!control) return;
  options.cameraShoulder = readCameraShoulder(storage);
  control.value = options.cameraShoulder;
  control.addEventListener('change', () => {
    if (!SIDES.includes(control.value)) { control.value = options.cameraShoulder; return; }
    options.cameraShoulder = control.value;
    try { storage?.setItem(KEY, control.value); } catch {}
  });
}

const MOTION_KEY = 'dukes.camera.motion';
const MOTION_MODES = ['auto', 'full', 'reduced'];

export function readCameraMotion(storage) {
  try { const value = storage?.getItem(MOTION_KEY); if (MOTION_MODES.includes(value)) return value; } catch {}
  return 'auto';
}

// The system preference remains live until the player explicitly overrides it.
export function setupCameraMotion(control, options, storage, media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)'), root = globalThis.document?.documentElement) {
  options.cameraMotion = readCameraMotion(storage);
  const apply = () => {
    options.reducedCameraMotion = options.cameraMotion === 'reduced' || (options.cameraMotion === 'auto' && !!media?.matches);
    if (root) root.dataset.cameraMotion = options.reducedCameraMotion ? 'reduced' : 'full';
    if (control) control.value = options.cameraMotion;
  };
  const change = () => {
    if (MOTION_MODES.includes(control.value)) {
      options.cameraMotion = control.value;
      try { storage?.setItem(MOTION_KEY, control.value); } catch {}
    }
    apply();
  };
  apply();
  control?.addEventListener('change', change);
  media?.addEventListener('change', apply);
  return () => { control?.removeEventListener('change', change); media?.removeEventListener('change', apply); };
}
