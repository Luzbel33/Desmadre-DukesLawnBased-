"""3) Textura de la sabana: lino sucio, sangre donde estan las heridas, rugosidad y normal.
   blender -b --factory-startup -P 03_texture.py -- h5"""
import numpy as np, os, sys, json
SRC = os.path.dirname(os.path.abspath(__file__))
HERE = os.environ.get('CORPSE_WORK') or os.path.join(SRC, 'work')
sys.path.insert(0, SRC)
from pngw import write_png, down2
tag = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'h3'
S = np.load(os.path.join(HERE, f'sheet_A{tag}.npz'))
P = S['P']; NX = int(S['NX']); NY = int(S['NY']); LX = float(S['LX']); LY = float(S['LY']); CX = float(S['CX'])
P = P.reshape(NX + 1, NY + 1, 3)
W, H = 2048, 1024            # u (largo) x v (ancho)
rng = np.random.default_rng(11)

def fbm(shape, beta=2.0, seed=0, aniso=(1.0, 1.0)):
    r = np.random.default_rng(seed)
    h, w = shape
    fy = np.fft.fftfreq(h)[:, None] * aniso[1]; fx = np.fft.fftfreq(w)[None, :] * aniso[0]
    f = np.sqrt(fx ** 2 + fy ** 2); f[0, 0] = 1
    spec = (r.normal(size=shape) + 1j * r.normal(size=shape)) / f ** (beta / 2)
    spec[0, 0] = 0
    a = np.fft.ifft2(spec).real
    return (a - a.mean()) / (a.std() + 1e-9)

def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

# mapa de posiciones (x, y, z del estado A) por texel, con interpolacion bilineal de la grilla
uu = (np.arange(W) + 0.5) / W; vv = (np.arange(H) + 0.5) / H
fi = np.clip(uu * NX, 0, NX - 1e-6); fj = np.clip(vv * NY, 0, NY - 1e-6)
i0 = fi.astype(int); j0 = fj.astype(int); ti = (fi - i0)[None, :]; tj = (fj - j0)[:, None]      # forma (H, W)
def bil(c):
    a = P[i0][:, j0][..., c].T          # (H, W) para i0, j0
    b = P[i0 + 1][:, j0][..., c].T
    c_ = P[i0][:, j0 + 1][..., c].T
    d = P[i0 + 1][:, j0 + 1][..., c].T
    return a * (1 - ti) * (1 - tj) + b * ti * (1 - tj) + c_ * (1 - ti) * tj + d * ti * tj
X = bil(0); Y = bil(1); Z = bil(2)
np.save(os.path.join(HERE, 'posmap_xy.npy'), np.stack([X, Y, Z], -1).astype(np.float32))

# ---- color base: lino sucio
base = np.array([0.60, 0.565, 0.49])
n1 = fbm((H, W), 2.4, 1); n2 = fbm((H, W), 1.2, 2, (1, 3)); n3 = fbm((H, W), 0.6, 3)
lum = 1 + 0.045 * n1 + 0.03 * n2 + 0.02 * n3
col = base[None, None, :] * lum[..., None]
# tintes: humedad amarronada y mugre hacia los bordes del pano
edge = np.minimum.reduce([uu[None, :] * np.ones((H, 1)), (1 - uu)[None, :] * np.ones((H, 1)), vv[:, None] * np.ones((1, W)), (1 - vv)[:, None] * np.ones((1, W))])
edge_m = np.minimum(edge * np.array([LX, LX, LY, LY]).max(), 1)   # aproximado, solo para modular
stain_a = sstep(0.35, 1.3, fbm((H, W), 2.8, 4)) * 0.55
col = col * (1 - stain_a[..., None] * np.array([0.10, 0.20, 0.36])[None, None, :])
grime = sstep(0.16, 0.0, edge) * (0.5 + 0.5 * sstep(-0.5, 1.0, n1))
col = col * (1 - grime[..., None] * 0.30)

# ---- sangre
blood = np.zeros((H, W))      # cuanta sangre hay (0..1)
core = np.zeros((H, W))       # zonas mas oscuras/frescas
def stain(cx, cy, rx, ry, seed, strength=1.0, cz=None, rz=0.15):
    global blood, core
    d = np.sqrt(((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 + (((Z - cz) / rz) ** 2 if cz is not None else 0))
    nz = 0.85 * fbm((H, W), 3.2, seed) + 0.3 * fbm((H, W), 1.6, seed + 7)
    dd = d * (1 + 0.22 * nz)
    a = sstep(1.05, 0.62, dd) * strength
    halo = sstep(2.0, 1.0, dd) * 0.42 * strength * (0.6 + 0.4 * sstep(-0.4, 0.8, fbm((H, W), 1.4, seed + 50)))
    blood = np.maximum(blood, np.maximum(a, halo))
    core = np.maximum(core, sstep(0.55, 0.12, dd) * strength)
stain(-0.40, -0.07, 0.17, 0.15, 21)
stain(-0.14, 0.01, 0.11, 0.10, 22)
stain(-0.585, -0.12, 0.07, 0.06, 23, 0.9)
stain(-0.76, -0.12, 0.055, 0.05, 24, 0.8)
stain(-0.26, -0.13, 0.06, 0.05, 25, 0.7)
stain(0.15, -0.22, 0.05, 0.07, 26, 0.6)
# empapado del borde de la sabana junto al brazo que cuelga (Y negativo del Blender = +Z del mundo)
stain(-0.47, -0.50, 0.15, 0.09, 27, 1.0)
stain(-0.33, -0.45, 0.10, 0.08, 28, 0.85)
stain(-0.64, -0.46, 0.07, 0.07, 29, 0.7)
# salpicaduras sueltas
for k in range(46):
    cx = -0.4 + rng.normal(0, 0.22); cy = rng.normal(0, 0.24); r = 0.006 + 0.014 * rng.random()
    d = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2) / r
    blood = np.maximum(blood, sstep(1.0, 0.6, d) * (0.6 + 0.4 * rng.random()))
blood = np.clip(blood, 0, 1)
# color de la sangre: fresca oscura en el centro, seca/marron en los bordes
fresh = np.array([0.30, 0.018, 0.024]); dried = np.array([0.36, 0.075, 0.05]); rim = np.array([0.46, 0.11, 0.08])
bc = dried[None, None, :] * (1 - core[..., None]) + fresh[None, None, :] * core[..., None]
bc = bc * (1 - sstep(0.5, 0.05, blood)[..., None] * 0.4) + rim[None, None, :] * (sstep(0.5, 0.05, blood)[..., None] * 0.4)
bc = np.clip(bc, 0, 1)
w = sstep(0.0, 0.55, blood)[..., None] * 0.94
col = col * (1 - w) + bc * w
col = np.clip(col, 0, 1)
srgb = col
write_png(os.path.join(HERE, 'corpse_albedo.png'), (np.clip(srgb, 0, 1) * 255).astype(np.uint8)[::-1])

# ---- rugosidad (canal G) y metalico (canal B = 0): sangre humeda brilla mas
rough = 0.92 - 0.55 * sstep(0.25, 0.9, blood) - 0.03 * n3
orm = np.zeros((H, W, 3), np.uint8)
orm[..., 0] = 255; orm[..., 1] = (np.clip(rough, 0.05, 1) * 255).astype(np.uint8); orm[..., 2] = 0
write_png(os.path.join(HERE, 'corpse_mr.png'), down2(orm.astype(np.float32)).astype(np.uint8)[::-1])

# ---- normal: arrugas medianas + grano de la tela + relieve de la sangre seca
hgt = 0.60 * fbm((H, W), 3.0, 31) + 0.40 * fbm((H, W), 2.4, 32, (1.0, 3.5)) + 0.10 * fbm((H, W), 1.6, 33)
hgt = hgt + 0.25 * blood * fbm((H, W), 2.0, 35)
gx = np.gradient(hgt, axis=1); gy = np.gradient(hgt, axis=0)
sc = 2.2
nx_, ny_, nz_ = -gx * sc, -gy * sc, np.ones_like(hgt)
ln = np.sqrt(nx_ ** 2 + ny_ ** 2 + nz_ ** 2)
nm = np.stack([nx_ / ln, ny_ / ln, nz_ / ln], -1) * 0.5 + 0.5
write_png(os.path.join(HERE, 'corpse_normal.png'), (down2(nm) * 255).astype(np.uint8)[::-1])
# donde cuelga el borde mas bajo del lado -Y (punto de goteo)
lo = P[:, :NY // 2]      # lado Y negativo
idx = np.unravel_index(np.argmin(np.where((np.abs(P[:NX + 1, :NY // 2, 0] + 0.24) < 0.3), lo[..., 2], 9)), lo.shape[:2])
print('drip hem point (blender x,y,z):', P[idx[0], idx[1]].round(3))
print('zmin A', P[..., 2].min().round(3), 'x range', P[..., 0].min().round(3), P[..., 0].max().round(3), 'y range', P[..., 1].min().round(3), P[..., 1].max().round(3))
print('TEX_OK')
