"""Piel, cara, ropa y accesorios de los personajes del Búnker (todo procedural, numpy).

Cada capa de ropa sabe dónde va (máscara por posición/hueso en el cuerpo), cómo se pinta (color, rugosidad y
transparencia del dibujo, p. ej. la red de las medias) y cuánto se separa de la piel (push, metros).
Las posiciones están en metros, Y arriba, el personaje mira a +Z; x > 0 es su izquierda.
Regla: lo que se pinta encima del pecho y de la entrepierna siempre es opaco (nada de desnudos).
"""
import numpy as np

from mh_lib import vnoise


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


class Ctx:
    """Alturas y puntos de referencia del cuerpo (para las máscaras)."""
    def __init__(self, J, P, head_top):
        self.J, self.P = J, P
        h = lambda b: J[f'{b}____head']  # noqa: E731
        self.top = head_top
        self.hipY = h('upperleg01.L')[1]
        self.crotchY = self.hipY - 0.07
        self.waistY = h('spine03')[1]
        self.bustY = h('breast.L')[1] if 'breast.L____head' in J else h('spine02')[1] + 0.05
        self.chestY = h('spine01')[1]
        self.neckY = h('neck01')[1]
        self.headY = h('head')[1]
        self.kneeY = h('lowerleg01.L')[1]
        self.ankleY = h('foot.L')[1]
        self.eyeL, self.eyeR = h('eye.L'), h('eye.R')
        self.mouth = (h('oris03.L') + h('oris03.R')) / 2
        self.shL, self.shR = h('upperarm01.L'), h('upperarm01.R')
        self.elL, self.elR = h('lowerarm01.L'), h('lowerarm01.R')
        self.wrL, self.wrR = h('wrist.L'), h('wrist.R')
        self.chin = self.mouth - np.array([0, 0.05, 0])

    def arm_t(self, pos):
        """Parámetro a lo largo del brazo: 0 hombro, 1 codo, 2 muñeca (para cada lado según x)."""
        out = np.zeros(len(pos))
        for s in (1, -1):
            sel = pos[:, 0] * s > 0
            sh, el, wr = (self.shL, self.elL, self.wrL) if s > 0 else (self.shR, self.elR, self.wrR)
            p = pos[sel]
            t1 = np.clip(((p - sh) @ (el - sh)) / (np.dot(el - sh, el - sh) + 1e-9), 0, 1)
            t2 = np.clip(((p - el) @ (wr - el)) / (np.dot(wr - el, wr - el) + 1e-9), 0, 1)
            out[sel] = np.where(t1 < 1, t1, 1 + t2)
        return out


ARM = {'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'shoulder_l', 'shoulder_r'}
HAND = {b for b in [f'{f}_0{k}_{s}' for f in ['thumb', 'index', 'middle', 'ring', 'pinky'] for k in (1, 2, 3) for s in 'lr']} | {'hand_l', 'hand_r'}
LEG = {'upperleg_l', 'upperleg_r', 'lowerleg_l', 'lowerleg_r'}
FOOT = {'foot_l', 'foot_r', 'ball_l', 'ball_r'}
HEAD = {'head', 'jaw', 'eye_l', 'eye_r', 'neck'}


def inset(dom, names):
    return np.isin(dom, list(names)).astype(np.float64)


def solid(col, rough=0.6):
    col = np.array(col, np.float64)
    return lambda pos, n, d, uv: (np.broadcast_to(col, (len(pos), 3)).copy(), np.full(len(pos), rough), np.ones(len(pos)))


class Layer:
    def __init__(self, where, paint, push=0.0):
        self._where, self._paint, self.push = where, paint, push
    def mask(self, pos, n, d):
        return np.clip(self._where(pos, n, d), 0, 1)
    def paint(self, pos, n, d, uv):
        return self._paint(pos, n, d, uv)


# ------------------------------------------------------------------ piel y cara
def skin_color(C, ctx, pos, n, d):
    base = np.array(C.get('skin', [0.78, 0.6, 0.5]))
    nz = vnoise(pos, 60, 1) * 0.6 + vnoise(pos, 220, 2) * 0.4
    col = base[None, :] * (0.9 + 0.16 * nz[:, None])
    # un poco más roja en mejillas, rodillas, codos y nudillos; sombra suave donde mira abajo
    ruddy = np.zeros(len(pos))
    for c in (ctx.eyeL + np.array([0.012, -0.035, 0.01]), ctx.eyeR + np.array([-0.012, -0.035, 0.01])):
        ruddy += smooth(0.035, 0.0, np.linalg.norm(pos - c, axis=1)) * 0.6
    col = col * (1 - 0.18 * ruddy[:, None]) + np.array([0.75, 0.25, 0.22]) * 0.18 * ruddy[:, None]
    col *= (1 - 0.14 * smooth(-0.2, -0.8, n[:, 1]))[:, None]
    rough = np.full(len(pos), 0.55)
    face = inset(d, HEAD) * (n[:, 2] > 0.1)
    # labios
    lips = smooth(0.026, 0.012, np.hypot((pos[:, 0] - ctx.mouth[0]) * 0.75, (pos[:, 1] - ctx.mouth[1]) * 1.6)) * face * (pos[:, 2] > ctx.mouth[2] - 0.01)
    lc = np.array(C.get('lips', [0.55, 0.18, 0.2]))
    col = col * (1 - lips[:, None]) + lc * lips[:, None]
    rough = rough * (1 - lips) + 0.25 * lips
    # cejas
    for e in (ctx.eyeL, ctx.eyeR):
        dx = (pos[:, 0] - e[0]); dy = pos[:, 1] - (e[1] + 0.021 + dx * np.sign(e[0]) * 0.1)
        brow = smooth(0.006, 0.002, np.abs(dy)) * smooth(0.028, 0.02, np.abs(dx + np.sign(e[0]) * 0.003)) * face
        bc = np.array(C.get('brows', C.get('hairColor', [0.08, 0.06, 0.05])))
        col = col * (1 - brow[:, None]) + bc * brow[:, None]
        # sombra de ojos / delineado gótico
        if C.get('eyeshadow'):
            es = smooth(0.022, 0.008, np.hypot(pos[:, 0] - e[0], (pos[:, 1] - e[1] - 0.004) * 1.3)) * face
            col = col * (1 - es[:, None] * 0.85) + np.array(C['eyeshadow']) * es[:, None] * 0.85
    # barba
    if C.get('beard'):
        bz = inset(d, {'jaw', 'head'}) * smooth(ctx.mouth[1] + 0.01, ctx.mouth[1] - 0.01, pos[:, 1]) * (pos[:, 1] > ctx.chin[1] - 0.03) * (n[:, 2] > -0.3)
        bz *= 0.55 + 0.45 * vnoise(pos, 900, 4)
        bz *= 1 - lips
        col = col * (1 - bz[:, None]) + np.array(C['beard']) * bz[:, None]
        rough = rough * (1 - bz) + 0.9 * bz
    # uñas pintadas
    if C.get('nails'):
        tip = inset(d, {f'{f}_03_{s}' for f in ['thumb', 'index', 'middle', 'ring', 'pinky'] for s in 'lr'})
        col = col * (1 - tip[:, None]) + np.array(C['nails']) * tip[:, None]
    return col, rough


# ------------------------------------------------------------------ piezas de ropa (máscaras)
def w_torso(ctx, y0, y1, soft=0.01, arms=False):
    return lambda p, n, d: smooth(y0 - soft, y0 + soft, p[:, 1]) * smooth(y1 + soft, y1 - soft, p[:, 1]) * (1 - inset(d, HEAD | HAND | FOOT)) * (1 if arms else 1 - inset(d, ARM - {'shoulder_l', 'shoulder_r'}))


def w_legs(ctx, y0, y1, soft=0.01):
    return lambda p, n, d: smooth(y0 - soft, y0 + soft, p[:, 1]) * smooth(y1 + soft, y1 - soft, p[:, 1]) * (inset(d, LEG | FOOT | {'hip'}))


def w_lower(ctx, y0, y1, soft=0.01):
    """pantalón: piernas y cadera hasta y1 (sin dejar piel en la cintura)"""
    return lambda p, n, d: np.maximum(w_legs(ctx, y0, y1, soft)(p, n, d), w_torso(ctx, y0, y1, soft)(p, n, d))


def w_arms(ctx, t0, t1):
    return lambda p, n, d: (inset(d, ARM | HAND)) * smooth(t0 - 0.05, t0 + 0.05, ctx.arm_t(p)) * smooth(t1 + 0.05, t1 - 0.05, ctx.arm_t(p)) + inset(d, HAND) * (t1 >= 2)


def w_head(ctx, face=True):
    """Toda la cabeza (máscara) o sin la cara (pelo: frente despejada, orejas afuera, hasta la nuca)."""
    def f(p, n, d):
        hd = inset(d, {'head', 'jaw', 'neck'}) * smooth(ctx.neckY + 0.02, ctx.neckY + 0.05, p[:, 1])
        if face:
            return hd
        ey = ctx.eyeL[1]
        front = n[:, 2] > 0.3
        hair = np.where(front, smooth(ey + 0.045, ey + 0.058, p[:, 1]),
                        np.where(n[:, 2] < -0.15, smooth(ctx.mouth[1] - 0.03, ctx.mouth[1] - 0.01, p[:, 1]),
                                 smooth(ey - 0.02, ey - 0.005, p[:, 1])))
        ears = (np.abs(p[:, 0]) > 0.068) & (p[:, 1] < ey + 0.025) & (p[:, 1] > ey - 0.06) & (n[:, 2] > -0.5)
        return np.clip(hd * hair * ~ears * (1 - inset(d, {'jaw'})), 0, 1)
    return f


def fishnet(col, rough=0.5, freq=70, width=0.18):
    col = np.array(col)
    def f(pos, n, d, uv):
        a = pos[:, 0] * 0.7 + pos[:, 2] * 0.7
        u1 = np.abs((a + pos[:, 1]) * freq % 1 - 0.5) < width / 2
        u2 = np.abs((a - pos[:, 1]) * freq % 1 - 0.5) < width / 2
        alpha = (u1 | u2).astype(np.float64)
        return np.broadcast_to(col, (len(pos), 3)).copy(), np.full(len(pos), rough), alpha
    return f


def glossy(col, rough=0.14):
    col = np.array(col)
    def f(pos, n, d, uv):
        v = 0.9 + 0.1 * vnoise(pos, 40, 7)
        return col[None, :] * v[:, None], np.full(len(pos), rough), np.ones(len(pos))
    return f


def fabric(col, rough=0.85, grain=300):
    col = np.array(col)
    def f(pos, n, d, uv):
        v = 0.86 + 0.14 * vnoise(pos, grain, 3)
        return col[None, :] * v[:, None], np.full(len(pos), rough), np.ones(len(pos))
    return f


def lacing(base, lace=(0.85, 0.8, 0.75), ctx=None):
    base = np.array(base); lace = np.array(lace)
    def f(pos, n, d, uv):
        c = np.broadcast_to(base, (len(pos), 3)).copy()
        front = n[:, 2] > 0.4
        x = np.abs(pos[:, 0])
        cross = (np.abs(((pos[:, 1] * 40) % 1) - x * 40) < 0.12) & (x < 0.018) & front
        edge = (np.abs(x - 0.02) < 0.003) & front
        c[cross | edge] = lace
        return c, np.where(cross, 0.8, 0.2), np.ones(len(pos))
    return f


def hair_paint(col, streak=None):
    col = np.array(col)
    def f(pos, n, d, uv):
        strands = 0.75 + 0.25 * vnoise(pos * np.array([1, 0.15, 1]), 380, 9)
        c = col[None, :] * strands[:, None]
        if streak is not None:
            s = (np.abs(pos[:, 0] - 0.03) < 0.012)
            c[s] = np.array(streak)[None, :] * strands[s, None]
        return c, np.full(len(pos), 0.45), np.ones(len(pos))
    return f


def luchador(base, trim, ctx):
    base = np.array(base); trim = np.array(trim)
    def f(pos, n, d, uv):
        c = np.broadcast_to(base, (len(pos), 3)).copy()
        # llamas alrededor de los ojos y la boca, y una franja en la frente
        for e in (ctx.eyeL, ctx.eyeR):
            r = np.hypot(pos[:, 0] - e[0], (pos[:, 1] - e[1]) * 0.8)
            c[(r > 0.016) & (r < 0.026)] = trim
        m = np.hypot(pos[:, 0] - ctx.mouth[0], (pos[:, 1] - ctx.mouth[1]) * 1.2)
        c[(m > 0.02) & (m < 0.028)] = trim
        c[np.abs(pos[:, 0]) < 0.006] = trim
        return c, np.full(len(pos), 0.35), np.ones(len(pos))
    return f


def luchador_holes(ctx):
    """la máscara deja ver ojos y boca"""
    def f(p, n, d):
        m = w_head(ctx, True)(p, n, d)
        for e in (ctx.eyeL, ctx.eyeR):
            m = m * (np.hypot(p[:, 0] - e[0], (p[:, 1] - e[1]) * 0.8) > 0.016)
        return m * (np.hypot(p[:, 0] - ctx.mouth[0], (p[:, 1] - ctx.mouth[1]) * 1.2) > 0.02)
    return f


def skull_paint(ctx):
    def f(pos, n, d, uv):
        c = np.full((len(pos), 3), 0.92)
        for e in (ctx.eyeL, ctx.eyeR):
            r = np.hypot(pos[:, 0] - e[0], (pos[:, 1] - e[1] + 0.004) * 0.9)
            c[r < 0.024] = 0.02
        nose = (np.abs(pos[:, 0]) < 0.01) & (pos[:, 1] < ctx.eyeL[1] - 0.02) & (pos[:, 1] > ctx.mouth[1] + 0.015)
        c[nose] = 0.03
        teeth = (np.abs(pos[:, 1] - ctx.mouth[1]) < 0.012) & (np.abs(pos[:, 0]) < 0.03)
        c[teeth & ((pos[:, 0] * 180) % 1 < 0.15)] = 0.05
        c[np.abs(pos[:, 1] - ctx.mouth[1]) < 0.0015] = 0.05
        return c, np.full(len(pos), 0.5), np.ones(len(pos))
    return f


def paint_layers(C, ctx):
    """Las capas de ropa del personaje (de adentro para afuera)."""
    from cast import OUTFITS
    return OUTFITS[C['outfit']](C, ctx)


# ------------------------------------------------------------------ accesorios (geometría)
def _cone(base, tip, r, seg=12):
    base, tip = np.array(base, float), np.array(tip, float)
    ax = tip - base; L = np.linalg.norm(ax); ax /= L
    u = np.cross(ax, [0, 0, 1] if abs(ax[2]) < 0.9 else [1, 0, 0]); u /= np.linalg.norm(u); w = np.cross(ax, u)
    V = [base + (u * np.cos(a) + w * np.sin(a)) * r for a in np.linspace(0, 2 * np.pi, seg, endpoint=False)]
    V.append(tip)
    F = [[i, (i + 1) % seg, seg] for i in range(seg)] + [[(i + 1) % seg, i, seg + 1] for i in range(seg)]
    V.append(base)
    return np.array(V), F


def _bent_horn(root, dirs, r0, seg=10, rings=6):
    """cuerno curvo: anillos a lo largo de una curva que se afina"""
    pts = [np.array(root, float)]
    for dd in dirs:
        pts.append(pts[-1] + np.array(dd, float))
    V, F = [], []
    n = len(pts)
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]); t /= np.linalg.norm(t)
        u = np.cross(t, [0, 0, 1]); u /= np.linalg.norm(u) + 1e-9; w = np.cross(t, u)
        r = r0 * (1 - i / n) + 0.002
        for a in np.linspace(0, 2 * np.pi, seg, endpoint=False):
            V.append(p + (u * np.cos(a) + w * np.sin(a)) * r)
    for i in range(n - 1):
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            F.append([a, b, b + seg, a + seg])
    V.append(pts[-1] + (pts[-1] - pts[-2]) * 0.3)
    tipi = len(V) - 1
    for k in range(seg):
        F.append([(n - 1) * seg + k, (n - 1) * seg + (k + 1) % seg, tipi])
    return np.array(V), F


def _sphere(c, r, sx=1, sy=1, sz=1, seg=12, rings=8):
    V, F = [], []
    for i in range(rings + 1):
        th = np.pi * i / rings
        for k in range(seg):
            ph = 2 * np.pi * k / seg
            V.append(np.array(c) + np.array([np.sin(th) * np.cos(ph) * r * sx, np.cos(th) * r * sy, np.sin(th) * np.sin(ph) * r * sz]))
    for i in range(rings):
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            F.append([a, a + seg, b + seg, b])
    return np.array(V), F


def _box(c, sx, sy, sz):
    c = np.array(c, float)
    V = np.array([[x, y, z] for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]) / 2 + c
    F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
    return V, F


def accessories(C, ctx):
    out = []
    hd = ctx.J['head____head']
    top = ctx.top
    for a in C.get('acc', []):
        k = a['k']
        if k == 'horns':
            for s in (1, -1):
                v, f = _bent_horn([s * 0.045, top - 0.035, hd[2] + 0.03], [[s * 0.02, 0.03, 0.0], [s * 0.015, 0.035, -0.01], [s * 0.0, 0.03, -0.025], [-s * 0.01, 0.015, -0.03]], a.get('r', 0.016))
                out.append({'v': v, 'f': f, 'bone': 'head', 'color': a.get('color', [0.12, 0.02, 0.02]), 'rough': 0.35})
        elif k == 'bunny':
            for s in (1, -1):
                v, f = _sphere([s * 0.035, top + 0.1, hd[2] + 0.005], 0.1, 0.22, 1.0, 0.1, 10, 8)
                out.append({'v': v, 'f': f, 'bone': 'head', 'color': a.get('color', [0.02, 0.02, 0.02]), 'rough': 0.3})
        elif k == 'pig':
            v, f = _sphere([0, ctx.mouth[1] + 0.028, ctx.mouth[2] + 0.045], 0.036, 1.0, 0.8, 0.9, 14, 8)
            out.append({'v': v, 'f': f, 'bone': 'head', 'color': [0.93, 0.55, 0.6], 'rough': 0.6})
            for s in (1, -1):
                v, f = _sphere([s * 0.012, ctx.mouth[1] + 0.028, ctx.mouth[2] + 0.078], 0.007, 1, 1.3, 0.5, 8, 6)
                out.append({'v': v, 'f': f, 'bone': 'head', 'color': [0.25, 0.06, 0.08], 'rough': 0.6})
                v, f = _cone([s * 0.07, top - 0.03, hd[2] - 0.005], [s * 0.1, top + 0.03, hd[2] + 0.01], 0.035, 8)
                out.append({'v': v, 'f': f, 'bone': 'head', 'color': [0.9, 0.52, 0.58], 'rough': 0.6})
        elif k == 'headphones':
            for s in (1, -1):
                v, f = _sphere([s * 0.085, ctx.eyeL[1] - 0.005, hd[2] - 0.015], 0.04, 0.45, 1, 1, 12, 6)
                out.append({'v': v, 'f': f, 'bone': 'head', 'color': [0.05, 0.05, 0.06], 'rough': 0.3})
            v, f = _box([0, top + 0.004, hd[2] - 0.01], 0.17, 0.016, 0.03)
            out.append({'v': v, 'f': f, 'bone': 'head', 'color': [0.9, 0.1, 0.25], 'rough': 0.3})
        elif k == 'ponytail':
            pts = [[0, top - 0.04, hd[2] - 0.085]]
            v, f = _bent_horn(pts[0], [[0, -0.05, -0.04], [0, -0.07, -0.02], [0, -0.08, -0.0], [0, -0.07, 0.01]], a.get('r', 0.03))
            out.append({'v': v, 'f': f, 'bone': 'head', 'color': C.get('hairColor', [0.05, 0.04, 0.04]), 'rough': 0.45})
        elif k == 'mohawk':
            for i in range(7):
                z = hd[2] + 0.07 - i * 0.03
                y = top + 0.0 - abs(i - 2.5) * 0.008
                v, f = _cone([0, y - 0.02, z], [0, y + 0.07, z - 0.01], 0.014, 6)
                out.append({'v': v, 'f': f, 'bone': 'head', 'color': a.get('color', [0.1, 0.9, 0.3]), 'rough': 0.5})
        elif k == 'bowtie':
            n = ctx.J['neck01____head']
            for s in (1, -1):
                v, f = _cone([0, n[1] - 0.005, n[2] + 0.07], [s * 0.04, n[1] - 0.005, n[2] + 0.065], 0.018, 4)
                out.append({'v': v, 'f': f, 'bone': 'spine_03', 'color': [0.6, 0.02, 0.04], 'rough': 0.4})
        elif k == 'shades':
            v, f = _box([0, ctx.eyeL[1], ctx.eyeL[2] + 0.018], 0.13, 0.03, 0.01)
            out.append({'v': v, 'f': f, 'bone': 'head', 'color': [0.01, 0.01, 0.01], 'rough': 0.08})
    return out
