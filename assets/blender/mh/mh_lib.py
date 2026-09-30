"""MakeHuman (CC0) sin MakeHuman: cuerpo base, deformaciones, articulaciones, pesos y ropa ajustada (mhclo).

Solo numpy. Lo usa build_npc.py (Blender) para armar los personajes del Búnker con el esqueleto del juego.
Datos: el repositorio makehumancommunity/makehuman (makehuman/data), assets CC0 desde 2020.
Unidades: MakeHuman trabaja en decímetros; acá todo sale en metros (Y arriba, el personaje mira a +Z).
"""
import json
import os

import numpy as np

MH = os.environ.get('MH_DATA', '/home/user/makehumancommunity/makehuman/makehuman/data')
SCALE = 0.1


def read_obj(path):
    """Vértices, UV y caras (con el grupo de cada cara)."""
    V, VT, faces = [], [], []
    group = None
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('v '):
                V.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                VT.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('g '):
                group = line.split(None, 1)[1].strip()
            elif line.startswith('f '):
                vs, ts = [], []
                for tok in line.split()[1:]:
                    p = tok.split('/')
                    vs.append(int(p[0]) - 1)
                    ts.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
                faces.append((vs, ts, group))
    return np.array(V, dtype=np.float64), np.array(VT, dtype=np.float64), faces


def read_target(path):
    idx, d = [], []
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if not line.strip() or line[0] == '#':
                continue
            p = line.split()
            idx.append(int(p[0]))
            d.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, dtype=np.int64), np.array(d, dtype=np.float64)


def _tri(v):
    """Reparto en min/average/max de un valor 0..1 (0.5 = promedio), como los modificadores de MakeHuman."""
    if v < 0.5:
        return {'min': (0.5 - v) * 2, 'average': 1 - (0.5 - v) * 2, 'max': 0.0}
    return {'min': 0.0, 'average': 1 - (v - 0.5) * 2, 'max': (v - 0.5) * 2}


def morph(V, gender=0.0, muscle=0.5, weight=0.5, height=0.5, proportions=0.5, cup=0.5, firmness=0.5,
          race=None, extra=None, age=0.5):
    """Aplica los modificadores macro. gender: 0 mujer, 1 hombre. age: 0.5 adulto joven .. 1 viejo (mezcla young/old,
    como MakeHuman). extra: [(target, peso)]."""
    V = V.copy()
    T = os.path.join(MH, 'targets')
    g = {'female': 1 - gender, 'male': gender}
    mu = _tri(muscle)
    we = _tri(weight)
    race = race or {'caucasian': 1.0}
    def add(rel, w):
        if w <= 1e-4:
            return
        p = os.path.join(T, rel)
        if not os.path.exists(p):
            return
        i, d = read_target(p)
        if len(i):
            V[i] += d * w
    wo = min(1.0, max(0.0, (age - 0.5) * 2))
    ages = {'young': 1 - wo, 'old': wo}
    for gn, gw0 in g.items():
      for an, aw in ages.items():
        if aw <= 1e-4:
            continue
        gw = gw0 * aw
        for mn, mw in mu.items():
            for wn, ww in we.items():
                base = f'{gn}-{an}-{mn}muscle-{wn}weight'
                w = gw * mw * ww
                add(f'macrodetails/universal-{base}.target', w)
                h = height
                if h > 0.5:
                    add(f'macrodetails/height/{base}-maxheight.target', w * (h - 0.5) * 2)
                elif h < 0.5:
                    add(f'macrodetails/height/{base}-minheight.target', w * (0.5 - h) * 2)
                if proportions > 0.5:
                    add(f'macrodetails/proportions/{base}-idealproportions.target', w * (proportions - 0.5) * 2)
                elif proportions < 0.5:
                    add(f'macrodetails/proportions/{base}-uncommonproportions.target', w * (0.5 - proportions) * 2)
                if gn == 'female':
                    cu = _tri(cup)
                    fi = _tri(firmness)
                    for cn, cw in cu.items():
                        for fn, fw in fi.items():
                            if cn == 'average' and fn == 'average':
                                continue
                            add(f'breast/{base}-{cn}cup-{fn}firmness.target', w * cw * fw)
        for rn, rw in race.items():
            add(f'macrodetails/{rn}-{gn}-{an}.target', gw * rw)
    for rel, w in (extra or []):
        add(rel, w)
    return V


def skeleton():
    with open(os.path.join(MH, 'rigs', 'default.mhskel'), encoding='utf-8') as f:
        return json.load(f)


def joints(V, skel):
    """Posición de cada articulación: el promedio de sus vértices de referencia."""
    return {k: V[np.array(v)].mean(axis=0) for k, v in skel['joints'].items()}


def weights():
    with open(os.path.join(MH, 'rigs', 'default_weights.mhw'), encoding='utf-8') as f:
        return json.load(f)['weights']


def read_mhclo(path):
    """Ropa/ojos ajustados al cuerpo: cada vértice = combinación de 3 vértices del cuerpo + desplazamiento escalado."""
    refs, scales, obj, material = [], {}, None, None
    in_verts = False
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith('#'):
                continue
            p = s.split()
            if p[0] == 'verts':
                in_verts = True
                continue
            if in_verts and len(p) >= 9 and p[0].lstrip('-').isdigit():
                refs.append([int(p[0]), int(p[1]), int(p[2]), float(p[3]), float(p[4]), float(p[5]), float(p[6]), float(p[7]), float(p[8])])
                continue
            if in_verts and len(p) == 1 and p[0].isdigit():  # un solo vértice de referencia
                refs.append([int(p[0]), int(p[0]), int(p[0]), 1, 0, 0, 0, 0, 0])
                continue
            in_verts = False
            if p[0] in ('x_scale', 'y_scale', 'z_scale'):
                scales[p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
            elif p[0] == 'obj_file':
                obj = p[1]
            elif p[0] == 'material':
                material = p[1]
    return np.array(refs), scales, obj, material


def fit_mhclo(V, refs, scales):
    """Posiciones de la ropa sobre el cuerpo V (en las mismas unidades que V)."""
    i1, i2, i3 = refs[:, 0].astype(int), refs[:, 1].astype(int), refs[:, 2].astype(int)
    w = refs[:, 3:6]
    d = refs[:, 6:9].copy()
    for k, ax in (('x', 0), ('y', 1), ('z', 2)):
        if k in scales:
            a, b, ref = scales[k]
            d[:, ax] *= abs(V[a, ax] - V[b, ax]) / ref
    return V[i1] * w[:, :1] + V[i2] * w[:, 1:2] + V[i3] * w[:, 2:3] + d


def vnoise(p, scale, seed=0):
    """Ruido de valor 3D suave (0..1) en los puntos p (N,3)."""
    q = p * scale + seed * 17.13
    i = np.floor(q); f = q - i; f = f * f * (3 - 2 * f)
    def h(ix, iy, iz):
        n = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)
        n = (n ^ (n >> 13)) * 1274126177
        return ((n ^ (n >> 16)) & 0xffff) / 65535.0
    ix, iy, iz = i[:, 0].astype(np.int64), i[:, 1].astype(np.int64), i[:, 2].astype(np.int64)
    acc = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                acc = acc + w * h(ix + dx, iy + dy, iz + dz)
    return acc


