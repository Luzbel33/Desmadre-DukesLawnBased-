// Personal third-person framing. The default preserves the existing camera side.
const KEY = 'dukes.camera.shoulder';
const SIDES = ['left', 'center', 'right'];
export function readCameraShoulder(storage) {
  try { const value = storage?.getItem(KEY); if (SIDES.includes(value)) return value; } catch {}
  return 'left';
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
