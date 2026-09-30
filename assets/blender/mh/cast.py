"""El elenco del Búnker: cuerpo (modificadores de MakeHuman), piel, cara, ropa y accesorios de cada uno.

body: gender 0 mujer / 1 hombre; muscle, weight, height, proportions, cup, firmness (0..1, 0.5 = promedio); race.
Los GLB salen en public/assets/chars/npc/ (los carga human.js como cualquier personaje).
"""
import numpy as np

from outfits import (Layer, w_torso, w_legs, w_lower, w_arms, w_head, solid, fishnet, glossy, fabric, lacing, hair_paint,
                     luchador, luchador_holes, skull_paint, inset, smooth, FOOT, LEG, HAND)

PALE = [0.86, 0.72, 0.66]
OLIVE = [0.72, 0.55, 0.42]
TAN = [0.62, 0.44, 0.32]
DARK = [0.36, 0.23, 0.17]
PINK = [0.93, 0.6, 0.62]


def boots(ctx, top, col, rough=0.25, push=0.006):
    layer = Layer(lambda p, n, d: inset(d, FOOT | LEG) * smooth(top + 0.02, top - 0.01, p[:, 1]), glossy(col, rough), push)
    layer.is_boots = True
    return layer


# ------------------------------------------------------------------ vestuarios
def o_lilith(C, ctx):
    # corsé de látex negro con cordones, bombacha, medias de red, botas bucaneras, guantes largos y pelo negro
    return [
        Layer(w_legs(ctx, ctx.ankleY, ctx.hipY - 0.12), fishnet([0.02, 0.02, 0.02], 0.4, 85, 0.2), 0.001),
        Layer(w_torso(ctx, ctx.crotchY - 0.03, ctx.hipY + 0.035), glossy([0.02, 0.02, 0.025]), 0.004),
        *([] if C.get('topless') else [Layer(w_torso(ctx, ctx.hipY + 0.02, ctx.bustY + 0.06), lacing([0.03, 0.02, 0.03], [0.6, 0.05, 0.08]), 0.006)]),
        boots(ctx, ctx.kneeY + 0.12, [0.03, 0.02, 0.025], 0.18, 0.008),
        Layer(w_arms(ctx, 0.6, 2.01), glossy([0.02, 0.02, 0.025]), 0.003),
        Layer(w_head(ctx, False), hair_paint([0.03, 0.02, 0.03], [0.55, 0.02, 0.06]), 0.018),
    ]


def o_bunny(C, ctx):
    # conejita gótica: body negro de una pieza, cuello blanco, puños, medias de red y tacos
    return [
        Layer(w_legs(ctx, ctx.ankleY, ctx.hipY - 0.03), fishnet([0.01, 0.01, 0.01], 0.4, 95, 0.16), 0.001),
        Layer(w_torso(ctx, ctx.crotchY - 0.04, ctx.hipY + 0.025 if C.get('topless') else ctx.bustY + 0.055), glossy([0.02, 0.02, 0.02], 0.2), 0.005),
        Layer(lambda p, n, d: inset(d, {'neck'}) * smooth(ctx.neckY - 0.01, ctx.neckY + 0.01, p[:, 1]) * smooth(ctx.neckY + 0.04, ctx.neckY + 0.025, p[:, 1]), solid([0.95, 0.95, 0.93], 0.7), 0.004),
        Layer(w_arms(ctx, 1.78, 1.92), solid([0.95, 0.95, 0.93], 0.7), 0.004),
        boots(ctx, ctx.ankleY + 0.1, [0.5, 0.02, 0.05], 0.2),
        Layer(w_head(ctx, False), hair_paint([0.85, 0.82, 0.78]), 0.012),
    ]


def o_pig(C, ctx):
    # el portero: cabeza de chancho (máscara rosa), traje negro, camisa, guantes negros
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.02, ctx.waistY), fabric([0.03, 0.03, 0.035], 0.8), 0.008),
        Layer(w_torso(ctx, ctx.waistY - 0.12, ctx.neckY + 0.02, arms=True), fabric([0.04, 0.04, 0.045], 0.75), 0.01),
        Layer(lambda p, n, d: w_torso(ctx, ctx.waistY - 0.1, ctx.neckY)(p, n, d) * (np.abs(p[:, 0]) < 0.05) * (n[:, 2] > 0.5), solid([0.9, 0.9, 0.9], 0.7), 0.011),
        Layer(w_arms(ctx, 0.0, 1.97), fabric([0.04, 0.04, 0.045], 0.75), 0.01),
        Layer(w_arms(ctx, 1.97, 2.01), glossy([0.02, 0.02, 0.02], 0.35), 0.003),
        boots(ctx, ctx.ankleY + 0.07, [0.02, 0.02, 0.02], 0.2),
        Layer(w_head(ctx, True), fabric([0.92, 0.56, 0.6], 0.6, 120), 0.006),
    ]


def o_dj(C, ctx):
    # DJ calavera: buzo con capucha bajada, jogging, zapatillas, cara pintada de calavera
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.02, ctx.waistY), fabric([0.08, 0.08, 0.1]), 0.008),
        Layer(w_torso(ctx, ctx.waistY - 0.1, ctx.neckY + 0.03, arms=True), fabric([0.12, 0.02, 0.18]), 0.012),
        Layer(w_arms(ctx, 0.0, 1.92), fabric([0.12, 0.02, 0.18]), 0.012),
        boots(ctx, ctx.ankleY + 0.05, [0.9, 0.9, 0.9], 0.6),
        Layer(lambda p, n, d: inset(d, {'head', 'jaw'}) * (n[:, 2] > 0.15) * smooth(ctx.chin[1] - 0.01, ctx.chin[1] + 0.01, p[:, 1]) * smooth(ctx.eyeL[1] + 0.06, ctx.eyeL[1] + 0.04, p[:, 1]), skull_paint(ctx), 0.0),
        Layer(w_head(ctx, False), hair_paint([0.02, 0.02, 0.02]), 0.01),
    ]


def pattern_shirt(base, spots):
    base = np.array(base); spots = [np.array(c) for c in spots]
    def f(pos, n, d, uv):
        from mh_lib import vnoise
        c = np.broadcast_to(base, (len(pos), 3)).copy()
        for i, sc in enumerate(spots):
            m = vnoise(pos, 45, 11 + i) > 0.68
            c[m] = sc
        return c, np.full(len(pos), 0.85), np.ones(len(pos))
    return f


def tattoo(skin):
    skin = np.array(skin)
    def f(pos, n, d, uv):
        from mh_lib import vnoise
        v = vnoise(pos, 70, 21)
        a = ((np.abs(v - 0.5) < 0.05) | (vnoise(pos, 140, 22) > 0.8)).astype(np.float64) * 0.9
        return np.broadcast_to(np.array([0.08, 0.12, 0.18]), (len(pos), 3)).copy(), np.full(len(pos), 0.5), a
    return f


def o_gogo_pink(C, ctx):
    return [
        Layer(w_torso(ctx, ctx.crotchY - 0.03, ctx.hipY + 0.02), glossy([1.0, 0.1, 0.55], 0.15), 0.004),
        *([] if C.get('topless') else [Layer(w_torso(ctx, ctx.bustY - 0.17, ctx.bustY + 0.055), glossy([1.0, 0.1, 0.55], 0.15), 0.006)]),
        Layer(w_arms(ctx, 1.55, 1.95), fishnet([0.2, 1.0, 0.4], 0.4, 90, 0.2), 0.001),
        boots(ctx, ctx.kneeY - 0.05, [0.95, 0.95, 0.95], 0.2),
        Layer(w_head(ctx, False), hair_paint([1.0, 0.25, 0.7]), 0.018),
    ]


def o_gogo_green(C, ctx):
    return [
        Layer(w_legs(ctx, ctx.ankleY, ctx.hipY), fishnet([0.2, 1.0, 0.3], 0.4, 80, 0.2), 0.001),
        Layer(w_torso(ctx, ctx.crotchY - 0.03, ctx.hipY + 0.03), glossy([0.02, 0.02, 0.02], 0.2), 0.004),
        *([] if C.get('topless') else [Layer(w_torso(ctx, ctx.bustY - 0.17, ctx.bustY + 0.055), glossy([0.02, 0.02, 0.02], 0.2), 0.006)]),
        boots(ctx, ctx.ankleY + 0.12, [0.1, 0.9, 0.3], 0.25),
        Layer(w_head(ctx, False), hair_paint([0.15, 0.95, 0.35]), 0.018),
    ]


def o_bartender(C, ctx):
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.02, ctx.waistY), fabric([0.04, 0.04, 0.045]), 0.008),
        Layer(w_torso(ctx, ctx.waistY - 0.12, ctx.neckY + 0.02, arms=True), fabric([0.9, 0.9, 0.88], 0.8), 0.009),
        Layer(w_arms(ctx, 0.0, 1.25), fabric([0.9, 0.9, 0.88], 0.8), 0.009),
        Layer(w_arms(ctx, 1.25, 1.95), tattoo(C['skin']), 0.0),
        Layer(lambda p, n, d: w_torso(ctx, ctx.waistY - 0.12, ctx.chestY)(p, n, d) * (np.abs(p[:, 0]) > 0.035), fabric([0.08, 0.02, 0.03], 0.6), 0.012),
        boots(ctx, ctx.ankleY + 0.05, [0.03, 0.03, 0.03], 0.3),
    ]


def o_luchador(color, trim):
    def f(C, ctx):
        return [
            Layer(w_lower(ctx, ctx.kneeY - 0.02, ctx.waistY - 0.02), glossy(color, 0.3), 0.005),
            boots(ctx, ctx.kneeY - 0.06, trim, 0.3),
            Layer(w_arms(ctx, 1.85, 2.01), solid(trim, 0.5), 0.003),
            Layer(luchador_holes(ctx), luchador(color, trim, ctx), 0.004),
        ]
    return f


def o_metal(C, ctx):
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.02, ctx.waistY), fabric([0.12, 0.16, 0.3], 0.9), 0.008),
        Layer(w_torso(ctx, ctx.waistY - 0.12, ctx.neckY + 0.02, arms=True), fabric([0.02, 0.02, 0.02]), 0.009),
        Layer(w_arms(ctx, 0.0, 0.5), fabric([0.02, 0.02, 0.02]), 0.009),
        boots(ctx, ctx.ankleY + 0.15, [0.03, 0.03, 0.03], 0.3),
        Layer(w_head(ctx, False), hair_paint([0.06, 0.04, 0.03]), 0.02),
    ]


def o_emo(C, ctx):
    return [
        Layer(w_legs(ctx, ctx.ankleY, ctx.hipY), fabric([0.02, 0.02, 0.02], 0.8), 0.003),
        Layer(w_torso(ctx, ctx.crotchY - 0.05, ctx.hipY + 0.05), pattern_shirt([0.15, 0.02, 0.05], [[0.02, 0.02, 0.02]]), 0.008),
        *([] if C.get('topless') else [Layer(w_torso(ctx, ctx.hipY + 0.03, ctx.neckY + 0.02, arms=True), fabric([0.02, 0.02, 0.02]), 0.009)]),
        Layer(w_arms(ctx, 0.0, 1.8), fabric([0.9, 0.2, 0.5]), 0.006),
        boots(ctx, ctx.ankleY + 0.13, [0.02, 0.02, 0.02], 0.4),
        Layer(w_head(ctx, False), hair_paint([0.02, 0.02, 0.03], [1.0, 0.2, 0.6]), 0.018),
    ]


def o_raver(C, ctx):
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.02, ctx.waistY), fabric([0.95, 0.85, 0.1], 0.6), 0.008),
        Layer(w_torso(ctx, ctx.waistY - 0.12, ctx.chestY + 0.05), fabric([0.1, 0.9, 1.0], 0.5), 0.008),
        boots(ctx, ctx.ankleY + 0.06, [1.0, 0.3, 0.8], 0.4),
    ]


def o_hawaii(C, ctx):
    return [
        Layer(w_lower(ctx, ctx.kneeY - 0.05, ctx.waistY), fabric([0.85, 0.8, 0.65], 0.9), 0.009),
        Layer(w_torso(ctx, ctx.waistY - 0.12, ctx.neckY + 0.02, arms=True), pattern_shirt([0.0, 0.55, 0.65], [[0.95, 0.4, 0.2], [0.98, 0.9, 0.3]]), 0.01),
        Layer(w_arms(ctx, 0.0, 0.6), pattern_shirt([0.0, 0.55, 0.65], [[0.95, 0.4, 0.2], [0.98, 0.9, 0.3]]), 0.01),
        boots(ctx, ctx.ankleY + 0.02, [0.45, 0.3, 0.18], 0.7),
    ]


OUTFITS = {'lilith': o_lilith, 'bunny': o_bunny, 'pig': o_pig, 'dj': o_dj, 'gogo_pink': o_gogo_pink, 'gogo_green': o_gogo_green,
           'bartender': o_bartender, 'toro': o_luchador([0.7, 0.02, 0.04], [0.95, 0.75, 0.15]), 'chacal': o_luchador([0.05, 0.15, 0.6], [0.85, 0.85, 0.9]),
           'metal': o_metal, 'emo': o_emo, 'raver': o_raver, 'hawaii': o_hawaii}

# ------------------------------------------------------------------ el elenco
CAST = {
    'portero': {'body': {'gender': 1, 'muscle': 0.95, 'weight': 0.8, 'height': 0.95}, 'skin': TAN, 'outfit': 'pig', 'shoes': True, 'acc': [{'k': 'pig'}, {'k': 'shades'}], 'out': 'public/assets/chars/npc/portero.glb'},
    'lilith': {'body': {'gender': 0, 'muscle': 0.55, 'weight': 0.42, 'height': 0.65, 'proportions': 1, 'cup': 0.85}, 'skin': PALE, 'topless': True, 'baseSkin': True, 'lips': [0.35, 0.02, 0.06], 'eyeshadow': [0.05, 0.02, 0.05], 'hairColor': [0.03, 0.02, 0.03], 'nails': [0.1, 0.0, 0.02], 'outfit': 'lilith', 'shoes': True, 'acc': [{'k': 'horns', 'color': [0.35, 0.02, 0.03]}], 'hair': 'long', 'out': 'public/assets/chars/npc/lilith.glb'},
    'coneja': {'body': {'gender': 0, 'muscle': 0.5, 'weight': 0.5, 'height': 0.55, 'proportions': 1, 'cup': 0.75, 'race': {'african': 1.0}}, 'skin': DARK, 'topless': True, 'baseSkin': True, 'lips': [0.45, 0.08, 0.14], 'eyeshadow': [0.25, 0.05, 0.3], 'hairColor': [0.85, 0.82, 0.78], 'nails': [0.6, 0.02, 0.05], 'outfit': 'bunny', 'shoes': True, 'acc': [{'k': 'bunny'}], 'hair': 'shoulder', 'out': 'public/assets/chars/npc/coneja.glb'},
    'venus': {'body': {'gender': 0, 'muscle': 0.55, 'weight': 0.45, 'height': 0.6, 'proportions': 1, 'cup': 0.8}, 'skin': TAN, 'topless': True, 'baseSkin': True, 'lips': [0.8, 0.1, 0.4], 'eyeshadow': [0.9, 0.2, 0.6], 'hairColor': [1.0, 0.25, 0.7], 'nails': [1.0, 0.1, 0.55], 'outfit': 'gogo_pink', 'shoes': True, 'hair': 'long', 'out': 'public/assets/chars/npc/venus.glb'},
    'raven': {'body': {'gender': 0, 'muscle': 0.6, 'weight': 0.4, 'height': 0.7, 'proportions': 1, 'cup': 0.7, 'race': {'asian': 1.0}}, 'skin': OLIVE, 'topless': True, 'baseSkin': True, 'lips': [0.05, 0.3, 0.1], 'eyeshadow': [0.1, 0.8, 0.3], 'hairColor': [0.15, 0.95, 0.35], 'nails': [0.1, 0.9, 0.3], 'outfit': 'gogo_green', 'shoes': True, 'hair': 'bob', 'out': 'public/assets/chars/npc/raven.glb'},
    'bartender': {'body': {'gender': 1, 'muscle': 0.7, 'weight': 0.6, 'height': 0.6}, 'skin': PALE, 'beard': [0.25, 0.12, 0.06], 'brows': [0.25, 0.12, 0.06], 'outfit': 'bartender', 'shoes': True, 'acc': [{'k': 'bowtie'}], 'hair': 'short', 'out': 'public/assets/chars/npc/bartender.glb'},
    'toro': {'body': {'gender': 1, 'muscle': 1.0, 'weight': 0.85, 'height': 0.75}, 'skin': TAN, 'outfit': 'toro', 'shoes': True, 'out': 'public/assets/chars/npc/toro.glb'},
    'chacal': {'body': {'gender': 1, 'muscle': 0.95, 'weight': 0.35, 'height': 0.55, 'race': {'african': 0.5, 'caucasian': 0.5}}, 'skin': DARK, 'outfit': 'chacal', 'shoes': True, 'out': 'public/assets/chars/npc/chacal.glb'},
    'metalero': {'body': {'gender': 1, 'muscle': 0.45, 'weight': 0.65, 'height': 0.6}, 'skin': PALE, 'beard': [0.1, 0.07, 0.05], 'hairColor': [0.06, 0.04, 0.03], 'outfit': 'metal', 'shoes': True, 'hair': 'long', 'out': 'public/assets/chars/npc/metalero.glb'},
    'emo': {'body': {'gender': 0, 'muscle': 0.4, 'weight': 0.4, 'height': 0.4, 'proportions': 0.8, 'cup': 0.5}, 'skin': PALE, 'topless': True, 'baseSkin': True, 'lips': [0.1, 0.02, 0.05], 'eyeshadow': [0.02, 0.02, 0.02], 'hairColor': [0.02, 0.02, 0.03], 'nails': [0.02, 0.02, 0.02], 'outfit': 'emo', 'shoes': True, 'hair': 'bob', 'out': 'public/assets/chars/npc/emo.glb'},
    'raver': {'body': {'gender': 1, 'muscle': 0.6, 'weight': 0.3, 'height': 0.5, 'race': {'asian': 1.0}}, 'skin': OLIVE, 'outfit': 'raver', 'shoes': True, 'acc': [{'k': 'mohawk', 'color': [0.2, 1.0, 0.3]}, {'k': 'shades'}], 'out': 'public/assets/chars/npc/raver.glb'},
    'gordo': {'body': {'gender': 1, 'muscle': 0.2, 'weight': 1.0, 'height': 0.35}, 'skin': PINK, 'beard': [0.35, 0.2, 0.1], 'outfit': 'hawaii', 'shoes': True, 'acc': [{'k': 'shades'}], 'hair': 'short', 'out': 'public/assets/chars/npc/gordo.glb'},
    'dj': {'body': {'gender': 1, 'muscle': 0.4, 'weight': 0.35, 'height': 0.6}, 'skin': OLIVE, 'outfit': 'dj', 'shoes': True, 'hairColor': [0.02, 0.02, 0.02], 'acc': [{'k': 'headphones'}], 'hair': 'short', 'out': 'public/assets/chars/npc/dj.glb'},
}

# los del castillo y el resto del mapa (villagers_cast.py)
from villagers_cast import V_OUTFITS, V_CAST  # noqa: E402
OUTFITS.update(V_OUTFITS)
CAST.update(V_CAST)
