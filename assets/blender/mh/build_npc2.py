"""NPC con ropa y pelo DE VERDAD (no pintados): cuerpo de MakeHuman + piezas del paquete de recursos de sistema de
MakeHuman (CC0: piel realista, ropa con normales y oclusión, zapatos, sombreros, peinados de mechones con alfa, cejas,
pestañas, ojos, dientes y lengua), todo ajustado al cuerpo con sus .mhclo, con el esqueleto del juego y UNA textura.

Etapa 1 (Python común, numpy + Pillow): geometría, pesos, huesos y el atlas -> output/npc2/<nombre>.npz + PNG.
Etapa 2 (Blender): export_npc2.py arma la malla, el esqueleto y el material y exporta el GLB del juego.
    python assets/blender/mh/build_npc2.py [NOMBRE ...]          (sin nombres: todos los de cast2.py)
    blender -b --factory-startup -P assets/blender/mh/export_npc2.py -- [NOMBRE ...] [--preview]

Datos de MakeHuman: MH_DATA (por defecto ../assets/makehuman/data, junto al repo): base.obj, targets, rigs del
repositorio makehumancommunity/makehuman + makehuman_system_assets_cc0.zip (files.makehumancommunity.org).
Atlas (2048, origen abajo a la izquierda como las UV): la cara tiene un cuarto entero (el juego baja las texturas de
los NPC a 1024 y la cara es lo que se mira de cerca).
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
os.environ.setdefault('MH_DATA', os.path.abspath(os.path.join(ROOT, '..', 'assets', 'makehuman', 'data')))
sys.path.insert(0, HERE)
import mh_lib as M  # noqa: E402
from build_npc import bone_positions, PARENTS, MH_TO_GAME  # noqa: E402
from cast2 import CAST2  # noqa: E402

OUT = os.path.join(ROOT, 'output', 'npc2')
A = 2048
RECT = {  # x0, y0, ancho, alto (píxeles del atlas, origen abajo a la izquierda)
    'body': (0, 0, 1024, 1024), 'head': (0, 1024, 1024, 1024), 'cloth': (1024, 0, 1024, 1024),
    'hat': (1024, 1024, 512, 512), 'hair': (1024, 1536, 512, 512), 'shoes': (1536, 1536, 512, 512),
    'eyes': (1536, 1280, 256, 256), 'teeth': (1792, 1280, 128, 128), 'tongue': (1920, 1280, 128, 128),
    'eyebrows': (1536, 1152, 512, 128), 'eyelashes': (1536, 1024, 512, 128),
}
ROUGH = {'body': 0.6, 'head': 0.55, 'cloth': 0.88, 'hat': 0.85, 'hair': 0.5, 'shoes': 0.55, 'eyes': 0.1, 'teeth': 0.3,
         'tongue': 0.45, 'eyebrows': 0.7, 'eyelashes': 0.7}
KEYWORDS = {'verts', 'delete_verts', 'material', 'obj_file', 'x_scale', 'y_scale', 'z_scale', 'z_depth', 'name', 'uuid', 'tag'}


def delete_verts(path):
    """Vértices del cuerpo que la prenda tapa (MakeHuman los esconde: así la piel no atraviesa la ropa)."""
    out, on = set(), False
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            s = line.strip()
            if s.startswith('delete_verts'):
                on = True
                continue
            if not on or not s or s.startswith('#'):
                continue
            toks = s.split()
            if toks[0] in KEYWORDS:
                on = False
                continue
            i = 0
            while i < len(toks):
                if not toks[i].lstrip('-').isdigit():
                    i += 1
                    continue
                a = int(toks[i])
                if i + 2 < len(toks) and toks[i + 1] == '-':
                    out.update(range(a, int(toks[i + 2]) + 1))
                    i += 3
                else:
                    out.add(a)
                    i += 1
    return out


def read_mhmat(path):
    m = {}
    if not path or not os.path.exists(path):
        return m
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            p = line.strip().split(None, 1)
            if len(p) == 2 and not p[0].startswith('#'):
                m[p[0]] = p[1].strip()
    return m


def proxy(kind, name, V):
    d = os.path.join(M.MH, kind, name)
    clo = os.path.join(d, name + '.mhclo')
    refs, scales, objf, mat = M.read_mhclo(clo)
    PV, PVT, PF = M.read_obj(os.path.join(d, objf))
    if len(refs) != len(PV):
        raise ValueError(f'{kind}/{name}: {len(refs)} referencias para {len(PV)} vértices')
    pos = M.fit_mhclo(V, refs, scales) * M.SCALE
    mm = read_mhmat(os.path.join(d, mat)) if mat else {}
    return {'pos': pos, 'vt': PVT, 'faces': PF, 'refs': refs, 'mat': mm, 'dir': d, 'delete': delete_verts(clo)}


def tex(path, size, tint=None, ao=None, alpha=False, darkbrown=False):
    im = Image.open(path).convert('RGBA')
    if darkbrown:  # el iris 'brown' de MakeHuman es rojizo: de lejos parecen ojos rojos. Marrón oscuro de verdad
        arr = np.asarray(im, np.float32)
        r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
        iris = np.clip((r - g - 12) / 40, 0, 1)
        lum = (r * 0.3 + g * 0.59 + b * 0.11)
        for k, f in enumerate((0.62, 0.42, 0.28)):
            arr[..., k] = arr[..., k] * (1 - iris) + lum * f * iris
        im = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    if ao and os.path.exists(ao):
        a = np.asarray(Image.open(ao).convert('L').resize(im.size), np.float32) / 255
        arr = np.asarray(im, np.float32)
        arr[..., :3] *= (0.35 + 0.65 * a)[..., None]
        im = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    if tint:
        # tint = (r, g, b) tiñe todo; ((r, g, b), 'light') tiñe solo lo claro y poco saturado (la remera blanca, no el jean)
        col, mode = (tint[0], tint[1]) if isinstance(tint[0], (tuple, list)) else (tint, None)
        arr = np.asarray(im, np.float32)
        k = np.ones(arr.shape[:2], np.float32)
        if mode == 'light':
            mx, mn = arr[..., :3].max(-1), arr[..., :3].min(-1)
            sat = (mx - mn) / np.maximum(mx, 1)
            k = np.clip((mx / 255 - 0.35) / 0.3, 0, 1) * np.clip((0.35 - sat) / 0.2, 0, 1)
        arr[..., :3] *= 1 - k[..., None] * (1 - np.array(col, np.float32))
        im = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    if not alpha:
        im.putalpha(255)
    return im.resize(size, Image.LANCZOS)


def paste(atlas, im, rect):
    x0, y0, w, h = rect
    atlas.paste(im, (x0, A - (y0 + h)))


def uv_into(uv, rect, sub=(0.0, 0.0, 1.0, 1.0)):
    """UV de la pieza (o de un recorte sub = u0, v0, u1, v1 de su textura) -> UV del atlas."""
    x0, y0, w, h = rect
    u0, v0, u1, v1 = sub
    u = (uv[..., 0] - u0) / (u1 - u0)
    v = (uv[..., 1] - v0) / (v1 - v0)
    return np.stack([(x0 + u * w) / A, (y0 + v * h) / A], -1)


def build(name):
    C = CAST2[name]
    V0, VT, F = M.read_obj(os.path.join(M.MH, '3dobjs', 'base.obj'))
    Vdm = M.morph(V0, **C['body'])
    Vm = Vdm * M.SCALE
    # pesos de MakeHuman -> huesos del juego (por vértice de la malla base, ayudantes incluidos)
    Wb = [dict() for _ in range(len(V0))]
    for mhb, lst in M.weights().items():
        gb = MH_TO_GAME.get(mhb)
        if gb is None:
            continue
        for v, w in lst:
            Wb[v][gb] = Wb[v].get(gb, 0.0) + w
    # piezas
    items = []  # (región, proxy, tinte, alfa)
    for cname, tint in C['clothes']:
        items.append(('shoes' if cname.startswith('shoes') else 'cloth', proxy('clothes', cname, Vdm), tint, False))
    if C.get('hat'):
        items.append(('hat', proxy('clothes', C['hat'][0], Vdm), C['hat'][1], False))
    if C.get('hair'):
        items.append(('hair', proxy('hair', C['hair'][0], Vdm), C['hair'][1], True))
    items.append(('eyebrows', proxy('eyebrows', C['eyebrows'], Vdm), None, True))
    items.append(('eyelashes', proxy('eyelashes', C['eyelashes'], Vdm), None, True))
    items.append(('eyes', proxy('eyes', 'high-poly', Vdm), None, False))
    items.append(('teeth', proxy('teeth', C['teeth'], Vdm), None, False))
    items.append(('tongue', proxy('tongue', C['tongue'], Vdm), None, False))
    hidden = set()
    for reg, P, _, _ in items:
        if reg in ('cloth', 'shoes', 'hat'):
            hidden |= P['delete']
    # cuerpo: solo el grupo 'body', sin lo que tapa la ropa
    body_faces = [f for f in F if f[2] == 'body' and not any(v in hidden for v in f[0])]
    used = sorted({v for f in body_faces for v in f[0]})
    remap = {v: i for i, v in enumerate(used)}
    verts = [Vm[used]]
    W = [Wb[v] for v in used]
    faces, fuvs, fregs = [], [], []
    # recorte de la cabeza en la piel (isla a la derecha de la textura)
    head_uv = [VT[t] for vs, ts, g in body_faces for t in ts if VT[ts].mean(0)[0] > 0.6 and 0.08 < VT[ts].mean(0)[1] < 0.92]
    hu = np.array(head_uv)
    sub = (hu[:, 0].min() - 0.004, hu[:, 1].min() - 0.004, min(1.0, hu[:, 0].max() + 0.004), hu[:, 1].max() + 0.004)
    for vs, ts, g in body_faces:
        uv = VT[ts]
        c = uv.mean(0)
        is_head = c[0] > 0.6 and 0.08 < c[1] < 0.92
        faces.append([remap[v] for v in vs])
        fuvs.append(uv_into(uv, RECT['head'], sub) if is_head else uv_into(uv, RECT['body']))
    off = len(used)
    for reg, P, tint, alpha in items:
        pf = P['faces']
        if reg == 'eyes':  # sin la córnea (transparente en MakeHuman; acá la dibujaría blanca)
            pf = [f for f in pf if P['vt'][f[1]][:, 0].min() < 0.8]
        verts.append(P['pos'])
        for row in P['refs']:
            i = [int(row[0]), int(row[1]), int(row[2])]
            w = np.clip(np.array(row[3:6], np.float64), 0, None)
            w = w / (w.sum() or 1)
            d = {}
            for k in range(3):
                for b, bw in Wb[i[k]].items():
                    d[b] = d.get(b, 0.0) + bw * w[k]
            W.append(d)
        for vs, ts, g in pf:
            faces.append([off + v for v in vs])
            fuvs.append(uv_into(P['vt'][ts], RECT[reg]))
        off += len(P['pos'])
    V = np.concatenate(verts)
    # parado en el piso (las suelas de los zapatos en y = 0) y huesos
    floor = V[:, 1].min()
    V[:, 1] -= floor
    Vj = Vm.copy(); Vj[:, 1] -= floor
    J = M.joints(Vj, M.skeleton())
    Pb = bone_positions(J)
    top = Vm[[v for f in F if f[2] == 'body' for v in f[0]]][:, 1].max() - floor
    Pb['head_end'] = (np.array([0, top, J['head____head'][2]]), np.array([0, top + 0.05, J['head____head'][2]]))
    # --- atlas: color (con alfa en pelo, cejas y pestañas), normales y rugosidad
    atlas = Image.new('RGBA', (A, A), (120, 110, 105, 255))
    nrm = Image.new('RGB', (A, A), (128, 128, 255))
    rough = Image.new('L', (A, A), 200)
    skin_m = read_mhmat(os.path.join(M.MH, 'skins', C['skin'], C['skin'] + '.mhmat'))
    skin_p = os.path.join(M.MH, 'skins', C['skin'], skin_m.get('diffuseTexture', '').split('/')[-1])
    skin = Image.open(skin_p).convert('RGBA')
    paste(atlas, skin.resize(RECT['body'][2:], Image.LANCZOS), RECT['body'])
    W2, H2 = skin.size
    crop = skin.crop((int(sub[0] * W2), int((1 - sub[3]) * H2), int(sub[2] * W2), int((1 - sub[1]) * H2)))
    paste(atlas, crop.resize(RECT['head'][2:], Image.LANCZOS), RECT['head'])
    for reg, P, tint, alpha in items:
        mm, d = P['mat'], P['dir']
        if reg == 'eyes':
            ek = 'brown' if C['eyes'] == 'darkbrown' else C['eyes']
            path = os.path.join(M.MH, 'eyes', 'materials', ek + '_eye.png')
        else:
            dt = mm.get('diffuseTexture', '')
            path = os.path.join(d, dt.split('/')[-1]) if dt else None
        if not path or not os.path.exists(path):
            print('  sin textura', reg, path)
            continue
        ao = os.path.join(d, mm['aomapTexture'].split('/')[-1]) if mm.get('aomapTexture') else None
        paste(atlas, tex(path, RECT[reg][2:], tint, ao, alpha, darkbrown=(reg == 'eyes' and C['eyes'] == 'darkbrown')), RECT[reg])
        nm = mm.get('normalmapTexture')
        if nm and os.path.exists(os.path.join(d, nm.split('/')[-1])):
            nrm.paste(Image.open(os.path.join(d, nm.split('/')[-1])).convert('RGB').resize(RECT[reg][2:], Image.LANCZOS), (RECT[reg][0], A - (RECT[reg][1] + RECT[reg][3])))
    for reg, rect in RECT.items():
        rough.paste(int(ROUGH[reg] * 255), (rect[0], A - (rect[1] + rect[3]), rect[0] + rect[2], A - rect[1]))
    os.makedirs(OUT, exist_ok=True)
    atlas.save(os.path.join(OUT, name + '_color.png'))
    nrm.save(os.path.join(OUT, name + '_normal.png'))
    rough.save(os.path.join(OUT, name + '_rough.png'))
    # --- datos para Blender
    bones = list(PARENTS)
    bi = {b: i for i, b in enumerate(bones)}
    wi = np.zeros((len(W), 4), np.int32)
    ww = np.zeros((len(W), 4), np.float32)
    for v, d in enumerate(W):
        top4 = sorted(d.items(), key=lambda kv: -kv[1])[:4]
        tot = sum(w for _, w in top4) or 1
        for k, (b, w) in enumerate(top4):
            wi[v, k] = bi[b]; ww[v, k] = w / tot
    sizes = np.array([len(f) for f in faces], np.int32)
    np.savez_compressed(os.path.join(OUT, name + '.npz'), verts=V.astype(np.float32), sizes=sizes,
                        fverts=np.concatenate([np.array(f, np.int32) for f in faces]),
                        fuvs=np.concatenate(fuvs).astype(np.float32), wi=wi, ww=ww)
    meta = {'bones': bones, 'parents': PARENTS, 'P': {k: [list(map(float, v[0])), list(map(float, v[1]))] for k, v in Pb.items()},
            'out': C['out'], 'double': bool(C.get('hair')), 'name': name}
    json.dump(meta, open(os.path.join(OUT, name + '.json'), 'w', encoding='utf-8'))
    print('ok', name, len(V), 'vértices', len(faces), 'caras', 'piezas', [r for r, *_ in items])


if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if not a.startswith('--')] or list(CAST2)
    for n in names:
        build(n)
