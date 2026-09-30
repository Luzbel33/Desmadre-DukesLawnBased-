"""Personajes del Búnker: cuerpos de MakeHuman (CC0) con el esqueleto del juego, ropa y accesorios, en un GLB.

Uso (Blender como módulo de Python, `pip install bpy`):
    python assets/blender/mh/build_npc.py NOMBRE [NOMBRE...]      (sin nombres: todos)
    python assets/blender/mh/build_npc.py --preview NOMBRE          (además, una foto en output/)

Cada personaje sale como UNA malla con UN material y una textura (atlas): así lo espera el juego (human.js), con el
mismo esqueleto de 68 huesos que la Galleta (hip, spine_01..03, neck, head, dedos, ojos, boca, pies).
La ropa ajustada es el mismo cuerpo empujado hacia afuera y pintado (corsé, medias de red, botas, guantes, máscara);
lo suelto (pelo, orejas, cuernos, trompa, auriculares) son piezas agregadas pegadas al hueso que corresponde.
Todo lo pintado es procedural (numpy): no hay texturas de terceros.
"""
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mh_lib as M  # noqa: E402
from cast import CAST  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
TEX = 2048
BODY_V = 0.875  # el cuerpo ocupa la textura de v = 0 a 0.875; arriba, ojos y colores de accesorios

# ------------------------------------------------------------------ esqueleto del juego <- MakeHuman
# nombre del hueso del juego -> huesos de MakeHuman cuyos pesos suma
BONE_MAP = {
    'hip': ['root', 'spine05', 'pelvis.L', 'pelvis.R'],
    'spine_01': ['spine04', 'spine03'],
    'spine_02': ['spine02', 'breast.L', 'breast.R'],
    'spine_03': ['spine01'],
    'neck': ['neck01', 'neck02', 'neck03'],
    'head': ['head', 'special01', 'special03', 'special04', 'special05.L', 'special05.R', 'special06.L', 'special06.R',
             'eye.L', 'eye.R', 'oculi01.L', 'oculi01.R', 'oculi02.L', 'oculi02.R', 'orbicularis03.L', 'orbicularis03.R',
             'orbicularis04.L', 'orbicularis04.R', 'temporalis01.L', 'temporalis01.R', 'temporalis02.L', 'temporalis02.R',
             'levator02.L', 'levator02.R', 'levator03.L', 'levator03.R', 'levator04.L', 'levator04.R', 'levator05.L',
             'levator05.R', 'levator06.L', 'levator06.R', 'oris02', 'oris03.L', 'oris03.R', 'oris04.L', 'oris04.R',
             'oris06', 'oris06.L', 'oris06.R', 'oris07.L', 'oris07.R', 'risorius02.L', 'risorius02.R', 'risorius03.L', 'risorius03.R'],
    'jaw': ['jaw', 'oris01', 'oris05', 'tongue00', 'tongue01', 'tongue02', 'tongue03', 'tongue04', 'tongue05.L', 'tongue05.R',
            'tongue06.L', 'tongue06.R', 'tongue07.L', 'tongue07.R'],
}
for s, S in (('l', 'L'), ('r', 'R')):
    BONE_MAP.update({
        f'shoulder_{s}': [f'clavicle.{S}', f'shoulder01.{S}'],
        f'upperarm_{s}': [f'upperarm01.{S}', f'upperarm02.{S}'],
        f'lowerarm_{s}': [f'lowerarm01.{S}', f'lowerarm02.{S}'],
        f'hand_{s}': [f'wrist.{S}'] + [f'metacarpal{i}.{S}' for i in range(1, 5)],
        f'upperleg_{s}': [f'upperleg01.{S}', f'upperleg02.{S}'],
        f'lowerleg_{s}': [f'lowerleg01.{S}', f'lowerleg02.{S}'],
        f'foot_{s}': [f'foot.{S}'],
        f'ball_{s}': [f'toe{i}-{k}.{S}' for i in range(1, 6) for k in range(1, 4)],
    })
    for fi, fname in enumerate(['thumb', 'index', 'middle', 'ring', 'pinky'], 1):
        for k in range(1, 4):
            BONE_MAP[f'{fname}_0{k}_{s}'] = [f'finger{fi}-{k}.{S}']
MH_TO_GAME = {mh: g for g, lst in BONE_MAP.items() for mh in lst}

PARENTS = {'hip': None, 'spine_01': 'hip', 'spine_02': 'spine_01', 'spine_03': 'spine_02', 'neck': 'spine_03', 'head': 'neck',
           'eye_l': 'head', 'eye_r': 'head', 'head_end': 'head', 'jaw': 'head', 'mouth_l': 'head', 'mouth_r': 'head'}
for s in 'lr':
    PARENTS.update({f'shoulder_{s}': 'spine_03', f'upperarm_{s}': f'shoulder_{s}', f'lowerarm_{s}': f'upperarm_{s}', f'hand_{s}': f'lowerarm_{s}',
                    f'upperleg_{s}': 'hip', f'lowerleg_{s}': f'upperleg_{s}', f'foot_{s}': f'lowerleg_{s}', f'ball_{s}': f'foot_{s}'})
    for f in ['index', 'middle', 'pinky', 'ring', 'thumb']:
        PARENTS.update({f'{f}_01_{s}': f'hand_{s}', f'{f}_02_{s}': f'{f}_01_{s}', f'{f}_03_{s}': f'{f}_02_{s}', f'{f}_end_{s}': f'{f}_03_{s}'})


def bone_positions(J):
    """(cabeza, cola) de cada hueso del juego en metros, a partir de las articulaciones de MakeHuman."""
    h = lambda b: J[f'{b}____head']  # noqa: E731
    t = lambda b: J[f'{b}____tail']  # noqa: E731
    P = {
        'hip': (h('spine05'), h('spine04')), 'spine_01': (h('spine04'), h('spine02')), 'spine_02': (h('spine02'), h('spine01')),
        'spine_03': (h('spine01'), h('neck01')), 'neck': (h('neck01'), h('head')), 'head': (h('head'), t('head')),
        'jaw': (h('jaw'), t('jaw')),
        'eye_l': (h('eye.L'), h('eye.L') + np.array([0, 0, 0.02])), 'eye_r': (h('eye.R'), h('eye.R') + np.array([0, 0, 0.02])),
    }
    for s, S in (('l', 'L'), ('r', 'R')):
        P[f'shoulder_{s}'] = (h(f'clavicle.{S}'), h(f'upperarm01.{S}'))
        P[f'upperarm_{s}'] = (h(f'upperarm01.{S}'), h(f'lowerarm01.{S}'))
        P[f'lowerarm_{s}'] = (h(f'lowerarm01.{S}'), h(f'wrist.{S}'))
        P[f'hand_{s}'] = (h(f'wrist.{S}'), h(f'finger3-1.{S}'))
        for fi, fname in enumerate(['thumb', 'index', 'middle', 'ring', 'pinky'], 1):
            for k in range(1, 4):
                a = h(f'finger{fi}-{k}.{S}')
                b = h(f'finger{fi}-{k + 1}.{S}') if k < 3 else t(f'finger{fi}-3.{S}')
                P[f'{fname}_0{k}_{s}'] = (a, b)
            e = t(f'finger{fi}-3.{S}')
            P[f'{fname}_end_{s}'] = (e, e + (e - h(f'finger{fi}-3.{S}')) * 0.5)
        P[f'upperleg_{s}'] = (h(f'upperleg01.{S}'), h(f'lowerleg01.{S}'))
        P[f'lowerleg_{s}'] = (h(f'lowerleg01.{S}'), h(f'foot.{S}'))
        P[f'foot_{s}'] = (h(f'foot.{S}'), h(f'toe3-1.{S}'))
        P[f'ball_{s}'] = (h(f'toe3-1.{S}'), t(f'toe3-3.{S}'))
        # comisuras de la boca
        P[f'mouth_{s}'] = (h(f'oris03.{S}'), h(f'oris03.{S}') + np.array([0, 0, 0.01]))
    return P


# ------------------------------------------------------------------ rasterizado en el espacio UV (numpy)
def raster(uv, tris, attrs, size):
    """Por cada píxel cubierto por un triángulo: índice del triángulo y baricéntricas. uv en [0,1]."""
    H = W = size
    tri_id = np.full((H, W), -1, np.int32)
    bary = np.zeros((H, W, 3), np.float32)
    P = uv * np.array([W, H])
    for ti, (a, b, c) in enumerate(tris):
        pa, pb, pc = P[a], P[b], P[c]
        x0 = int(max(0, math.floor(min(pa[0], pb[0], pc[0])))); x1 = int(min(W - 1, math.ceil(max(pa[0], pb[0], pc[0]))))
        y0 = int(max(0, math.floor(min(pa[1], pb[1], pc[1])))); y1 = int(min(H - 1, math.ceil(max(pa[1], pb[1], pc[1]))))
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1])
        if abs(d) < 1e-12:
            continue
        l1 = ((pb[1] - pc[1]) * (xs - pc[0]) + (pc[0] - pb[0]) * (ys - pc[1])) / d
        l2 = ((pc[1] - pa[1]) * (xs - pc[0]) + (pa[0] - pc[0]) * (ys - pc[1])) / d
        l3 = 1 - l1 - l2
        m = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
        if not m.any():
            continue
        yy, xx = (ys[m] - 0.5).astype(int), (xs[m] - 0.5).astype(int)
        tri_id[yy, xx] = ti
        bary[yy, xx] = np.stack([l1[m], l2[m], l3[m]], -1)
    return tri_id, bary


def dilate(img, mask, n=6):
    """Extiende los bordes de las islas para que no se vean costuras con el filtrado."""
    img = img.copy(); mask = mask.copy()
    for _ in range(n):
        acc = np.zeros_like(img); cnt = np.zeros(mask.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sm = np.roll(mask, (dy, dx), (0, 1)); si = np.roll(img, (dy, dx), (0, 1))
            acc[sm] += si[sm]; cnt[sm] += 1
        grow = (~mask) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][..., None]
        mask |= grow
    return img


# ------------------------------------------------------------------ construcción
def build(name, preview=False):
    import bpy
    C = CAST[name]
    V0, VT, F = M.read_obj(os.path.join(M.MH, '3dobjs', 'base.obj'))
    Vm = M.morph(V0, **C.get('body', {}))
    Vm_m = Vm * M.SCALE
    body_faces = [f for f in F if f[2] == 'body']
    used = np.unique(np.concatenate([np.array(f[0]) for f in body_faces]))
    floor = Vm_m[used, 1].min()
    Vm_m[:, 1] -= floor
    J = M.joints(Vm_m, M.skeleton())
    P = bone_positions(J)
    head_top = Vm_m[used][:, 1].max()
    P['head_end'] = (np.array([0, head_top, J['head____head'][2]]), np.array([0, head_top + 0.05, J['head____head'][2]]))
    # --- malla del cuerpo (vértices usados, re-indexados); triángulos con sus UV
    remap = -np.ones(len(Vm_m), np.int64); remap[used] = np.arange(len(used))
    verts = Vm_m[used].copy()
    loops_v, loops_uv, faces = [], [], []
    for vs, ts, g in body_faces:
        idx = [int(remap[v]) for v in vs]
        faces.append(idx)
        loops_uv.append([VT[t] * np.array([1, BODY_V]) for t in ts])
    # pesos: MakeHuman -> huesos del juego
    Wmh = M.weights()
    wmat = {}
    for mhb, lst in Wmh.items():
        gb = MH_TO_GAME.get(mhb)
        if gb is None:
            continue
        for v, w in lst:
            if remap[v] < 0:
                continue
            wmat.setdefault(int(remap[v]), {}).setdefault(gb, 0.0)
            wmat[int(remap[v])][gb] += w
    # --- normales por vértice (para empujar la ropa)
    nrm = np.zeros_like(verts)
    for f in faces:
        a, b, c = verts[f[0]], verts[f[1]], verts[f[2]]
        n = np.cross(b - a, c - a)
        for i in f:
            nrm[i] += n
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    dom = np.array([max(wmat.get(i, {'hip': 1}).items(), key=lambda kv: kv[1])[0] for i in range(len(verts))])
    # --- regiones de ropa por vértice y empuje
    from outfits import paint_layers, Ctx  # noqa: E402
    ctx = Ctx(J, P, head_top)
    push = np.zeros(len(verts))
    layers = paint_layers(C, ctx)
    for L in layers:
        m = L.mask(verts, nrm, dom)
        # con pelo de verdad (geometría), el pintado es solo cuero cabelludo: casi pegado (si no, casco)
        k = min(L.push, 0.003) if (C.get('hair') and getattr(L._where, 'is_hair', False)) else L.push
        push = np.maximum(push, m * k)
    # el borde de cada prenda (y del pelo) baja de a poco: sin escalones dentados
    nb = [[] for _ in range(len(verts))]
    for f in faces:
        for k in range(len(f)):
            nb[f[k]].append(f[(k + 1) % len(f)]); nb[f[k]].append(f[k - 1])
    nb_i = np.concatenate([np.array(x) for x in nb]); nb_o = np.repeat(np.arange(len(verts)), [len(x) for x in nb])
    cnt = np.bincount(nb_o, minlength=len(verts)).astype(np.float64)
    for _ in range(4):
        avg = np.bincount(nb_o, weights=push[nb_i], minlength=len(verts)) / np.maximum(cnt, 1)
        push = np.maximum(push * 0.5 + avg * 0.5, np.minimum(push, avg))
    verts_pushed = verts + nrm * push[:, None]
    # botas y zapatos: los dedos se juntan en una punta (si no, se marcan cinco dedos en el cuero)
    if C.get('shoes'):
        for s in 'lr':
            sel = np.isin(dom, [f'ball_{s}'])
            if sel.any():
                cx = verts_pushed[sel, 0].mean()
                verts_pushed[sel, 0] = cx + (verts_pushed[sel, 0] - cx) * 0.72
                verts_pushed[sel, 1] += 0.004
    # --- ojos (MakeHuman, CC0): ajustados a la cara con su mhclo; textura en la franja de arriba
    ev, ef, euv = eyes_mesh(Vm, floor)
    # --- accesorios (geometría pegada a un hueso)
    from outfits import accessories  # noqa: E402
    acc = accessories(C, ctx)
    # --- textura
    color, rough = paint_texture(C, ctx, verts, nrm, dom, faces, loops_uv, layers)
    # ubicar ojos y accesorios en la franja de arriba
    all_v = [verts_pushed]; all_f = [faces]; all_uv = [loops_uv]; all_w = [wmat]
    off = len(verts_pushed)
    eye_img = eye_texture()
    place_patch(color, rough, eye_img, 0, 0.5)  # ojo: cuadrado de 256 en la franja
    euv2 = [[np.array([u * (224 / TEX), BODY_V + 0.005 + v * (224 / TEX)]) for (u, v) in uvf] for uvf in euv]
    all_v.append(ev); all_f.append([[i + off for i in f] for f in ef]); all_uv.append(euv2)
    all_w.append({i + off: {'head': 1.0} for i in range(len(ev))})
    off += len(ev)
    slot = 0
    for a in acc:
        u0 = (300 + slot * 70) / TEX
        swatch(color, rough, slot, a['color'], a.get('rough', 0.5))
        all_v.append(a['v']); all_f.append([[i + off for i in f] for f in a['f']])
        all_uv.append([[np.array([u0 + 0.01, BODY_V + 0.02])] * len(f) for f in a['f']])
        all_w.append({i + off: {a['bone']: 1.0} for i in range(len(a['v']))})
        off += len(a['v']); slot += 1
    # --- pelo de verdad (geometría): la guía de pelo de MakeHuman ('helper-hair'), recortada según el peinado
    if C.get('hair'):
        hv, hfaces, huv = hair_mesh(Vm_m, F, ctx, C['hair'], J)
        if len(hv):
            hair_texture(color, rough, C.get('hairColor', [0.1, 0.07, 0.05]))
            all_v.append(hv); all_f.append([[i + off for i in f] for f in hfaces]); all_uv.append(huv)
            all_w.append({i + off: {'head': 1.0} for i in range(len(hv))})
            off += len(hv)
    V = np.concatenate(all_v); Fs = sum(all_f, []); UVs = sum(all_uv, []); W = {}
    for w in all_w:
        W.update(w)
    export(bpy, name, V, Fs, UVs, W, P, color, rough, C, preview)


def eyes_mesh(Vm_dm, floor_m):
    refs, scales, objf, _ = M.read_mhclo(os.path.join(M.MH, 'eyes', 'high-poly', 'high-poly.mhclo'))
    pos = M.fit_mhclo(Vm_dm, refs, scales) * M.SCALE
    pos[:, 1] -= floor_m
    EV, EVT, EF = M.read_obj(os.path.join(M.MH, 'eyes', 'high-poly', objf))
    # sin la córnea (en MakeHuman es transparente: acá la dibujaría blanca). Usa la esquina vacía de la textura
    keep = [f for f in EF if EVT[f[1]][:, 0].min() < 0.8]
    used = sorted({v for f in keep for v in f[0]})
    re = {v: i for i, v in enumerate(used)}
    faces = [[re[v] for v in f[0]] for f in keep]
    uvs = [[EVT[t] for t in f[1]] for f in keep]
    return pos[used], faces, uvs


def eye_texture():
    from PIL import Image
    img = Image.open(os.path.join(M.MH, 'eyes', 'materials', 'brown_eye.png')).convert('RGB').resize((224, 224))
    return np.asarray(img, np.float32) / 255.0


def place_patch(color, rough, img, x, _unused):
    h, w = img.shape[:2]
    y0 = int(BODY_V * TEX) + int(0.005 * TEX)
    # la imagen va con v hacia arriba: fila 0 de la textura = v 0
    color[y0:y0 + h, x:x + w] = img[::-1]
    rough[y0:y0 + h, x:x + w] = 0.15


HAIR_X0, HAIR_W, HAIR_H = 1680, 360, 230  # parche del pelo en la franja de arriba del atlas


def hair_texture(color, rough, col):
    """mechones: vetas verticales de brillo distinto, raíz más oscura y un reflejo"""
    y0 = int((BODY_V + 0.005) * TEX)
    rng = np.random.default_rng(5)
    cols = rng.random(HAIR_W)
    cols = np.convolve(cols, np.ones(3) / 3, 'same')
    k = 0.55 + 0.6 * cols[None, :] * np.ones((HAIR_H, 1))
    vv = np.linspace(0, 1, HAIR_H)[:, None]            # 0 puntas .. 1 raíz
    k *= 0.8 + 0.25 * np.exp(-((vv - 0.72) / 0.08) ** 2)  # reflejo
    k *= 1 - 0.3 * np.clip((vv - 0.9) * 10, 0, 1)        # raíz
    img = np.array(col, np.float32)[None, None, :] * k[..., None]
    color[y0:y0 + HAIR_H, HAIR_X0:HAIR_X0 + HAIR_W] = np.clip(img, 0, 1)
    rough[y0:y0 + HAIR_H, HAIR_X0:HAIR_X0 + HAIR_W] = 0.42


def hair_mesh(Vm, F, ctx, style, J):
    """la guía de pelo (mechones largos) recortada: largo según el estilo y sin nada delante de la cara; con las dos
    caras (el material del juego descarta la de atrás) y un poco despegada del cuero cabelludo"""
    eye = ctx.eyeL
    cut = {'short': eye[1] - 0.075, 'bob': eye[1] - 0.14, 'shoulder': eye[1] - 0.25, 'long': eye[1] - 0.42}.get(style, eye[1] - 0.14)
    hc = np.array(J['head____head']) + np.array([0, 0.07, 0])
    keep = []
    for vs, ts, g in F:
        if g != 'helper-hair':
            continue
        P = Vm[list(vs)]
        c = P.mean(0)
        if P[:, 1].min() < cut:
            continue
        # la cara despejada: nada adelante por debajo de las cejas
        if c[2] > eye[2] - 0.045 and c[1] < eye[1] + 0.03 and abs(c[0]) < 0.085:
            continue
        # sin flequillo: la frente despejada hasta el nacimiento del pelo
        if c[2] > eye[2] - 0.03 and c[1] < eye[1] + 0.075 and abs(c[0]) < 0.07:
            continue
        keep.append(list(vs))
    if not keep:
        return np.zeros((0, 3)), [], []
    vi = np.unique(np.concatenate([np.array(f) for f in keep]))
    rm = {int(v): i for i, v in enumerate(vi)}
    P = Vm[vi].copy()
    d = P - hc; d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
    P += d * 0.004
    ymin, ymax = P[:, 1].min(), P[:, 1].max()
    ang = np.arctan2(P[:, 0] - hc[0], P[:, 2] - hc[2])
    u = (HAIR_X0 + 4 + (ang + np.pi) / (2 * np.pi) * (HAIR_W - 8)) / TEX
    v = BODY_V + 0.005 + (4 + (P[:, 1] - ymin) / max(1e-6, ymax - ymin) * (HAIR_H - 8)) / TEX
    uvv = np.stack([u, v], 1)
    # la cara de atrás con sus propios vértices (si no, la normal compartida la deja negra)
    n = len(P)
    P = np.concatenate([P, P - d * 0.0015])
    uvv = np.concatenate([uvv, uvv])
    faces, uvs = [], []
    for f in keep:
        idx = [rm[int(x)] for x in f]
        faces.append(idx); uvs.append([uvv[i] for i in idx])
        back = [i + n for i in idx[::-1]]
        faces.append(back); uvs.append([uvv[i] for i in back])
    return P, faces, uvs


def swatch(color, rough, slot, col, r):
    y0 = int((BODY_V + 0.01) * TEX)
    x0 = 300 + slot * 70
    color[y0:y0 + 64, x0:x0 + 64] = np.array(col, np.float32)
    rough[y0:y0 + 64, x0:x0 + 64] = r


def paint_texture(C, ctx, verts, nrm, dom, faces, loops_uv, layers):
    from outfits import skin_color  # noqa: E402
    # triángulos (en abanico) con sus UV y vértices
    tri_v, tri_uv = [], []
    for f, uvs in zip(faces, loops_uv):
        for k in range(1, len(f) - 1):
            tri_v.append((f[0], f[k], f[k + 1]))
            tri_uv.append((uvs[0], uvs[k], uvs[k + 1]))
    tri_v = np.array(tri_v); tri_uv = np.array(tri_uv)
    uv_flat = tri_uv.reshape(-1, 2)
    tris = np.arange(len(uv_flat)).reshape(-1, 3)
    tid, bary = raster(uv_flat, tris, None, TEX)
    mask = tid >= 0
    t = tid[mask]
    b = bary[mask]
    tv = tri_v[t]
    pos = (verts[tv[:, 0]] * b[:, :1] + verts[tv[:, 1]] * b[:, 1:2] + verts[tv[:, 2]] * b[:, 2:3])
    nn = (nrm[tv[:, 0]] * b[:, :1] + nrm[tv[:, 1]] * b[:, 1:2] + nrm[tv[:, 2]] * b[:, 2:3])
    nn /= np.linalg.norm(nn, axis=1, keepdims=True) + 1e-9
    # hueso dominante del vértice más pesado del triángulo
    dd = dom[tv[np.arange(len(tv)), np.argmax(b, 1)]]
    uvp = np.stack(np.nonzero(mask)[::-1], -1) / TEX  # (u, v) del píxel
    col, rgh = skin_color(C, ctx, pos, nn, dd)
    for L in layers:
        m = L.mask(pos, nn, dd)
        if not m.any():
            continue
        c, r, alpha = L.paint(pos, nn, dd, uvp)
        m = m * alpha
        a = m[:, None]
        col = col * (1 - a) + c * a
        rgh = rgh * (1 - m) + r * m
    color = np.zeros((TEX, TEX, 3), np.float32)
    rough = np.ones((TEX, TEX), np.float32) * 0.6
    color[mask] = col
    rough[mask] = rgh
    color = dilate(color, mask, 8)
    rough = dilate(rough[..., None], mask, 8)[..., 0]
    return color, rough


def export(bpy, name, V, faces, uvs, W, P, color, rough, C, preview):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    to_b = lambda p: (float(p[0]), float(-p[2]), float(p[1]))  # noqa: E731  (MakeHuman Y arriba -> Blender Z arriba)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([to_b(v) for v in V], [], [list(f) for f in faces])
    mesh.update()
    uvl = mesh.uv_layers.new(name='UVMap')
    li = 0
    for poly, fuv in zip(mesh.polygons, uvs):
        for k, loop in enumerate(poly.loop_indices):
            uvl.data[loop].uv = (float(fuv[k][0]), float(fuv[k][1]))
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    # esqueleto
    arm = bpy.data.armatures.new(name + 'Rig')
    rig = bpy.data.objects.new(name + 'Rig', arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for bn in PARENTS:  # orden: padres antes que hijos
        h, t = P[bn]
        b = arm.edit_bones.new(bn)
        b.head = to_b(h); b.tail = to_b(t)
        if (b.tail - b.head).length < 1e-4:
            b.tail = (b.head[0], b.head[1], b.head[2] + 0.02)
        eb[bn] = b
    for bn, par in PARENTS.items():
        if par:
            eb[bn].parent = eb[par]
    bpy.ops.object.mode_set(mode='OBJECT')
    # pesos (normalizados, 4 como mucho)
    groups = {bn: obj.vertex_groups.new(name=bn) for bn in PARENTS}
    for vi, ws in W.items():
        items = sorted(ws.items(), key=lambda kv: -kv[1])[:4]
        tot = sum(w for _, w in items) or 1
        for bn, w in items:
            groups[bn].add([vi], w / tot, 'REPLACE')
    obj.parent = rig
    mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    # material: color + rugosidad (canal G del mapa metal/rugosidad de glTF)
    img = bpy.data.images.new(name + '_color', TEX, TEX, alpha=False)
    rgba = np.concatenate([np.clip(color, 0, 1), np.ones((TEX, TEX, 1), np.float32)], -1)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    mr = bpy.data.images.new(name + '_mr', TEX // 2, TEX // 2, alpha=False, is_data=True)
    mr.colorspace_settings.name = 'Non-Color'  # antes de cargar los píxeles (si no, Blender los borra)
    rr = rough[::2, ::2]
    mrp = np.stack([np.zeros_like(rr), rr, np.zeros_like(rr), np.ones_like(rr)], -1)
    mr.pixels.foreach_set(mrp.ravel().astype(np.float32))
    mr.update()
    mr.pack()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = img
    tm = nt.nodes.new('ShaderNodeTexImage'); tm.image = mr
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tm.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    obj.data.materials.append(mat)
    out = os.path.join(ROOT, C['out'])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_animations=False,
                              export_image_format='JPEG', export_jpeg_quality=88, export_yup=True, use_selection=False)
    print('OK', out, os.path.getsize(out) // 1024, 'KB', len(V), 'vértices')
    if preview:
        render_preview(bpy, obj, name)


def render_preview(bpy, obj, name):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = 600, 900
    cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); scene.collection.objects.link(co)
    hgt = max(v.co.z for v in obj.data.vertices)
    k = hgt / 1.7
    co.location = (0.9 * k, -3.2 * k, 1.05 * k); co.rotation_euler = (math.radians(88), 0, math.radians(16)); cam.lens = 50
    scene.camera = co
    for loc, e in (((2, -3, 3), 900), ((-3, -2, 2), 400), ((0, 3, 3), 600)):
        ld = bpy.data.lights.new('l', 'AREA'); ld.energy = e; ld.size = 3
        lo = bpy.data.objects.new('l', ld); lo.location = loc; scene.collection.objects.link(lo)
        lo.rotation_euler = (math.atan2(math.hypot(loc[0], loc[1]), loc[2]), 0, math.atan2(loc[0], -loc[1]))
    w = bpy.data.worlds.new('w'); w.color = (0.05, 0.05, 0.06); scene.world = w
    out = os.path.join(ROOT, 'output', f'npc_{name}.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('foto', out)


if __name__ == '__main__':
    args = sys.argv[1:]
    prev = '--preview' in args
    names = [a for a in args if not a.startswith('--')] or list(CAST)
    for n in names:
        build(n, preview=prev)
