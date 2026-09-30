# Voces propias para modelos especiales, derivadas de las grabaciones CC0 de public/assets/sfx/vo:
#   demon  (El Diablo): una octava y pico abajo, capa sub-grave, saturación y eco de cripta
#   cookie (La Galleta): acelerada y aguda, de dibujito
# Uso: python gen_voices.py   (numpy, scipy, soundfile)
import numpy as np, soundfile as sf, os
from scipy.signal import resample_poly, butter, sosfilt

VO = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sfx', 'vo')
SR = 44100

def load(name):
    x, sr = sf.read(os.path.join(VO, name), always_2d=True)
    x = x.mean(axis=1)
    if sr != SR: x = resample_poly(x, SR, sr)
    return x

def speed(x, k):
    # k < 1: más lento y grave; k > 1: más rápido y agudo (como cambiar la velocidad de la cinta)
    from fractions import Fraction
    f = Fraction(k).limit_denominator(50)
    return resample_poly(x, f.denominator, f.numerator)

def norm(x, peak=0.89):
    m = np.max(np.abs(x)) or 1
    return x / m * peak

def fade(x, ms=12):
    n = int(SR * ms / 1000)
    if len(x) > 2 * n:
        x[:n] *= np.linspace(0, 1, n); x[-n:] *= np.linspace(1, 0, n)
    return x

def demon(x):
    a = speed(x, 0.66)
    b = speed(x, 0.5)[:len(a)]
    b = np.pad(b, (0, len(a) - len(b)))
    y = a + 0.55 * b
    y = np.tanh(y / (np.max(np.abs(y)) or 1) * 3.2)            # saturación
    y = sosfilt(butter(2, 3200, 'low', fs=SR, output='sos'), y)
    # eco de cripta: reflexiones que se apagan
    out = np.pad(y, (0, int(SR * 0.9)))
    for d, g in [(0.083, 0.42), (0.161, 0.3), (0.27, 0.2), (0.41, 0.12), (0.6, 0.07)]:
        n = int(SR * d); out[n:n + len(y)] += g * y
    return fade(norm(out))

def cookie(x):
    y = speed(x, 1.55)
    y = sosfilt(butter(2, 260, 'high', fs=SR, output='sos'), y)
    return fade(norm(y, 0.85))

PLAN = {
    'hurt': ['vo-hurt-m3-%d.ogg' % i for i in range(1, 6)],
    'scream': ['vo-scream-m3-%d.ogg' % i for i in range(1, 5)],
    'death': ['vo-death-m4-%d.ogg' % i for i in range(1, 4)],
}
for voice, fx in (('demon', demon), ('cookie', cookie)):
    for kind, files in PLAN.items():
        for i, f in enumerate(files, 1):
            y = fx(load(f))
            sf.write(os.path.join(VO, f'vo-{kind}-{voice}-{i}.ogg'), y.astype(np.float32), SR, format='OGG', subtype='VORBIS')
            print(voice, kind, i, round(len(y) / SR, 2), 's')
