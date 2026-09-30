"""Gruñidos del Diablo (al escupir fuego): síntesis propia, sin grabaciones de terceros.

Voz grave con carraspeo (vocal fry: subarmónico a f0/2 que traquetea), formantes que van de "aaa" a "ooo",
aliento de ruido que pasa por los mismos formantes, saturación y un poco de eco de cueva.

Uso (Python con numpy, scipy, soundfile e imageio-ffmpeg):
    python assets/audio/gen_growl.py public/assets/sfx/diablo
"""
import os
import subprocess
import sys

import imageio_ffmpeg
import numpy as np
import soundfile as sf
from scipy.signal import butter, lfilter, sosfilt

SR = 44100


def formant(x, f, bw):
    # resonador de dos polos (pasabanda angosto) con f y ancho de banda en Hz
    r = np.exp(-np.pi * bw / SR)
    out = np.zeros_like(x)
    y1 = y2 = 0.0
    for i in range(len(x)):
        th = 2 * np.pi * f[i] / SR
        y = (1 - r) * x[i] + 2 * r * np.cos(th) * y1 - r * r * y2
        out[i] = y
        y2, y1 = y1, y
    return out


def growl(dur, seed, f0a=58, f0b=78, f0c=46, fry=0.7):
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    # contorno de tono: sube al arrancar y cae al final, con temblor (jitter) de voz ronca
    f0 = np.interp(u, [0, 0.25, 0.7, 1], [f0a, f0b, f0b * 0.92, f0c])
    jitter = np.cumsum(rng.normal(0, 1, n)) / np.sqrt(SR) * 0.9
    jitter = lfilter(*butter(1, 12 / (SR / 2)), jitter)
    f0 = f0 * (1 + 0.06 * jitter / (np.abs(jitter).max() + 1e-9))
    ph = np.cumsum(f0) / SR
    # pulso glótico (Rosenberg simplificado) + subarmónico: el traqueteo del carraspeo
    frac = ph % 1.0
    pulse = np.where(frac < 0.6, np.sin(np.pi * frac / 0.6) ** 2, 0.0)
    pulse = np.diff(pulse, prepend=0) * 40
    sub = np.where((ph % 2.0) < 1.0, 1.0, 1 - fry)  # cada otro pulso más débil = f0/2
    src = pulse * sub
    # aliento: ruido que sigue a los pulsos
    noise = rng.normal(0, 1, n)
    breath = noise * (0.35 + 0.65 * np.clip(pulse, 0, None) / (np.clip(pulse, 0, None).max() + 1e-9))
    x = src + 0.35 * breath
    # formantes: de "a" (abierta) a "o" (redonda), la F1 baja con la boca que se cierra
    F1 = np.interp(u, [0, 0.4, 1], [720, 620, 430])
    F2 = np.interp(u, [0, 0.4, 1], [1150, 1000, 780])
    F3 = np.full(n, 2450.0)
    v = formant(x, F1, 110) * 1.0 + formant(x, F2, 150) * 0.55 + formant(x, F3, 220) * 0.18
    # garganta: un grave de pecho que retumba
    chest = sosfilt(butter(2, 160 / (SR / 2), output='sos'), src) * 0.6
    v = v + chest
    # rugosidad (modulación rápida) y envolvente
    v *= 1 + 0.35 * np.sin(2 * np.pi * (26 + 6 * rng.random()) * t)
    env = np.clip(t / 0.09, 0, 1) * np.clip((dur - t) / 0.35, 0, 1)
    env *= 0.8 + 0.2 * np.sin(np.pi * u)
    v *= env
    v /= np.abs(v).max() + 1e-9
    v = np.tanh(v * 3.2) / np.tanh(3.2)  # saturación: rasposo
    # eco corto de cueva
    ir_n = int(0.35 * SR)
    ir = rng.normal(0, 1, ir_n) * np.exp(-np.arange(ir_n) / (0.07 * SR))
    ir[0] = 6.0
    wet = np.convolve(v, ir)[:n + ir_n // 2]
    out = np.concatenate([v, np.zeros(ir_n // 2)]) * 0.8 + wet / np.abs(wet).max() * 0.35
    # sin DC ni graves inaudibles
    out = sosfilt(butter(2, 35 / (SR / 2), btype='high', output='sos'), out)
    return (out / np.abs(out).max() * 0.92).astype(np.float32)


def main(outdir):
    os.makedirs(outdir, exist_ok=True)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    variants = [(1.1, 11, 60, 82, 48, 0.7), (1.5, 23, 52, 70, 42, 0.85), (0.8, 37, 66, 90, 55, 0.6)]
    for k, (dur, seed, a, b, c, fry) in enumerate(variants, 1):
        wav = os.path.join(outdir, f'_grunido-{k}.wav')
        sf.write(wav, growl(dur, seed, a, b, c, fry), SR)
        ogg = os.path.join(outdir, f'grunido-{k}.ogg')
        subprocess.run([ff, '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-c:a', 'libvorbis', '-q:a', '4', ogg], check=True)
        os.remove(wav)
        print(ogg, os.path.getsize(ogg))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/assets/sfx/diablo')
