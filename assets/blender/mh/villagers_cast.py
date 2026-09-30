"""Los del castillo y el resto del mapa: vendedores de la feria, el tabernero, el parrillero, el sepulturero, guardias
y gente común (con ropa de acuerdo a dónde andan). Se suman al elenco de cast.py (mismo formato).
Salen en public/assets/chars/npc/v_<nombre>.glb.
"""
import numpy as np

from outfits import (Layer, w_torso, w_legs, w_lower, w_arms, w_head, solid, glossy, fabric, hair_paint, inset, smooth,
                     FOOT, LEG)

PALE = [0.86, 0.72, 0.66]
FAIR = [0.8, 0.62, 0.52]
OLIVE = [0.72, 0.55, 0.42]
TAN = [0.62, 0.44, 0.32]
DARK = [0.36, 0.23, 0.17]
OLD = [0.82, 0.68, 0.62]


def shoes(ctx, top, col, rough=0.5, push=0.006):
    return Layer(lambda p, n, d: inset(d, FOOT | LEG) * smooth(top + 0.02, top - 0.01, p[:, 1]), glossy(col, rough), push)


def front(where, zmin=0.25, half=0.15):
    """solo la parte de adelante y del medio (delantal, pechera)"""
    return lambda p, n, d: where(p, n, d) * smooth(zmin - 0.1, zmin + 0.05, n[:, 2]) * smooth(half + 0.01, half - 0.01, np.abs(p[:, 0]))


def plaid(a, b, freq=28):
    a, b = np.array(a), np.array(b)
    def f(pos, n, d, uv):
        gx = (np.sin(pos[:, 0] * freq * 6.283) > 0.3).astype(float)
        gy = (np.sin(pos[:, 1] * freq * 6.283) > 0.3).astype(float)
        k = np.clip(gx + gy, 0, 2)[:, None] / 2
        c = a * (1 - k) + b * k
        return c, np.full(len(pos), 0.9), np.ones(len(pos))
    return f


def stripes(a, b, freq=9):
    a, b = np.array(a), np.array(b)
    def f(pos, n, d, uv):
        k = (np.sin(pos[:, 0] * freq * 6.283) > 0).astype(float)[:, None]
        return a * (1 - k) + b * k, np.full(len(pos), 0.75), np.ones(len(pos))
    return f


def buttons(ctx, col, y0, y1, n=5):
    """fila de botones en el medio del pecho"""
    ys = np.linspace(y0, y1, n)
    def where(p, nn, d):
        m = np.zeros(len(p))
        for y in ys:
            m = np.maximum(m, smooth(0.011, 0.006, np.hypot(p[:, 0], p[:, 1] - y)))
        return m * (nn[:, 2] > 0.5)
    return Layer(where, glossy(col, 0.25), 0.012)


# ------------------------------------------------------------------ vestuarios
def o_witch(C, ctx):
    # la bruja de las pociones: vestido negro largo, chal violeta, botas
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.05, ctx.waistY), fabric([0.05, 0.03, 0.06], 0.9), 0.012),
        Layer(w_torso(ctx, ctx.waistY - 0.12, ctx.neckY + 0.03, arms=True), fabric([0.05, 0.03, 0.06], 0.9), 0.01),
        Layer(w_arms(ctx, 0.0, 1.9), fabric([0.05, 0.03, 0.06], 0.9), 0.01),
        Layer(w_torso(ctx, ctx.chestY - 0.05, ctx.neckY + 0.01, arms=True), fabric([0.3, 0.06, 0.34], 0.95, 180), 0.016),
        shoes(ctx, ctx.ankleY + 0.1, [0.05, 0.03, 0.03], 0.35),
        Layer(w_head(ctx, False), hair_paint([0.55, 0.55, 0.58]), 0.018),
    ]


def o_griller(C, ctx):
    # el parrillero: remera blanca manchada, delantal rojo, jean, alpargatas
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.02, ctx.waistY), fabric([0.12, 0.18, 0.32], 0.85), 0.008),
        Layer(w_torso(ctx, ctx.waistY - 0.12, ctx.neckY + 0.02, arms=True), fabric([0.88, 0.87, 0.82], 0.85), 0.009),
        Layer(w_arms(ctx, 0.0, 0.55), fabric([0.88, 0.87, 0.82], 0.85), 0.009),
        Layer(front(w_torso(ctx, ctx.crotchY - 0.2, ctx.chestY + 0.06)), fabric([0.55, 0.06, 0.05], 0.8), 0.016),
        shoes(ctx, ctx.ankleY + 0.03, [0.25, 0.2, 0.15], 0.8),
        Layer(w_head(ctx, False), hair_paint([0.1, 0.07, 0.05]), 0.012),
    ]


def o_innkeeper(C, ctx):
    # el tabernero: camisa blanca arremangada, chaleco marrón con botones, delantal largo, pantalón oscuro
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.02, ctx.waistY), fabric([0.12, 0.1, 0.09], 0.85), 0.008),
        Layer(w_torso(ctx, ctx.waistY - 0.12, ctx.neckY + 0.02, arms=True), fabric([0.9, 0.88, 0.8], 0.85), 0.009),
        Layer(w_arms(ctx, 0.0, 0.95), fabric([0.9, 0.88, 0.8], 0.85), 0.009),
        Layer(w_torso(ctx, ctx.waistY - 0.1, ctx.chestY + 0.08), fabric([0.35, 0.2, 0.1], 0.7), 0.014),
        buttons(ctx, [0.8, 0.65, 0.25], ctx.waistY - 0.05, ctx.chestY + 0.02, 4),
        Layer(front(w_torso(ctx, ctx.crotchY - 0.2, ctx.waistY + 0.02)), fabric([0.82, 0.78, 0.68], 0.9), 0.017),
        shoes(ctx, ctx.ankleY + 0.05, [0.12, 0.07, 0.04], 0.4),
        Layer(w_head(ctx, False), hair_paint([0.3, 0.17, 0.08]), 0.012),
    ]


def o_gravedigger(C, ctx):
    # el sepulturero: sobretodo negro largo, pantalón gris, botas embarradas
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.02, ctx.waistY), fabric([0.22, 0.22, 0.24], 0.85), 0.008),
        Layer(w_legs(ctx, ctx.kneeY - 0.05, ctx.hipY + 0.05), fabric([0.04, 0.04, 0.05], 0.8), 0.016),
        Layer(w_torso(ctx, ctx.crotchY - 0.3, ctx.neckY + 0.04, arms=True), fabric([0.04, 0.04, 0.05], 0.8), 0.016),
        Layer(w_arms(ctx, 0.0, 1.92), fabric([0.04, 0.04, 0.05], 0.8), 0.015),
        buttons(ctx, [0.5, 0.45, 0.35], ctx.waistY - 0.05, ctx.chestY + 0.05, 5),
        shoes(ctx, ctx.ankleY + 0.12, [0.16, 0.12, 0.08], 0.7),
        Layer(w_head(ctx, False), hair_paint([0.05, 0.05, 0.05]), 0.01),
    ]


def o_guard(C, ctx):
    # guardia del portón: casaca azul noche con botones dorados, cinto, pantalón con franja, botas altas
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.02, ctx.waistY), fabric([0.06, 0.07, 0.14], 0.8), 0.008),
        Layer(lambda p, n, d: w_legs(ctx, ctx.kneeY, ctx.hipY)(p, n, d) * smooth(0.01, 0.004, np.abs(np.abs(p[:, 0]) - 0.13)), solid([0.6, 0.05, 0.05], 0.6), 0.009),
        Layer(w_torso(ctx, ctx.crotchY - 0.08, ctx.neckY + 0.04, arms=True), fabric([0.07, 0.08, 0.2], 0.75), 0.013),
        Layer(w_arms(ctx, 0.0, 1.92), fabric([0.07, 0.08, 0.2], 0.75), 0.012),
        Layer(w_torso(ctx, ctx.waistY - 0.02, ctx.waistY + 0.03), glossy([0.08, 0.05, 0.03], 0.3), 0.016),
        buttons(ctx, [0.9, 0.7, 0.2], ctx.waistY + 0.05, ctx.chestY + 0.07, 5),
        shoes(ctx, ctx.kneeY - 0.02, [0.02, 0.02, 0.02], 0.2, 0.01),
    ]


def o_farmer(C, ctx):
    # granjero: camisa escocesa, mameluco de jean con pechera, botas de goma
    return [
        Layer(w_torso(ctx, ctx.waistY - 0.1, ctx.neckY + 0.02, arms=True), plaid([0.55, 0.12, 0.08], [0.15, 0.08, 0.06]), 0.009),
        Layer(w_arms(ctx, 0.0, 1.2), plaid([0.55, 0.12, 0.08], [0.15, 0.08, 0.06]), 0.009),
        Layer(w_lower(ctx, ctx.ankleY + 0.02, ctx.waistY), fabric([0.2, 0.3, 0.45], 0.9), 0.012),
        Layer(front(w_torso(ctx, ctx.waistY - 0.05, ctx.chestY + 0.08)), fabric([0.2, 0.3, 0.45], 0.9), 0.014),
        Layer(lambda p, n, d: w_torso(ctx, ctx.waistY, ctx.neckY - 0.02)(p, n, d) * smooth(0.02, 0.012, np.abs(np.abs(p[:, 0]) - 0.08)), fabric([0.2, 0.3, 0.45], 0.9), 0.014),
        shoes(ctx, ctx.kneeY - 0.12, [0.1, 0.22, 0.12], 0.3, 0.01),
        Layer(w_head(ctx, False), hair_paint([0.4, 0.3, 0.2]), 0.01),
    ]


def o_maid(C, ctx):
    # aldeana: vestido verde oscuro largo, delantal blanco, chal marrón
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.08, ctx.waistY), fabric([0.1, 0.25, 0.16], 0.9), 0.012),
        Layer(w_torso(ctx, ctx.waistY - 0.12, ctx.neckY + 0.0, arms=True), fabric([0.1, 0.25, 0.16], 0.9), 0.009),
        Layer(w_arms(ctx, 0.0, 1.6), fabric([0.1, 0.25, 0.16], 0.9), 0.009),
        Layer(front(w_torso(ctx, ctx.crotchY - 0.2, ctx.waistY + 0.02)), fabric([0.92, 0.9, 0.84], 0.9), 0.017),
        shoes(ctx, ctx.ankleY + 0.05, [0.15, 0.08, 0.04], 0.5),
        Layer(w_head(ctx, False), hair_paint([0.35, 0.18, 0.08]), 0.012),
    ]


def o_townsman(C, ctx):
    # tipo común: campera marrón, remera, jean, zapatillas
    return [
        Layer(w_lower(ctx, ctx.ankleY + 0.02, ctx.waistY), fabric([0.18, 0.24, 0.38], 0.85), 0.008),
        Layer(w_torso(ctx, ctx.waistY - 0.12, ctx.neckY + 0.02, arms=True), fabric([0.7, 0.68, 0.6], 0.85), 0.009),
        Layer(lambda p, n, d: w_torso(ctx, ctx.waistY - 0.1, ctx.neckY + 0.03, arms=True)(p, n, d) * (1 - (np.abs(p[:, 0]) < 0.06) * (n[:, 2] > 0.4)), fabric([0.32, 0.2, 0.1], 0.65), 0.014),
        Layer(w_arms(ctx, 0.0, 1.9), fabric([0.32, 0.2, 0.1], 0.65), 0.013),
        shoes(ctx, ctx.ankleY + 0.04, [0.9, 0.9, 0.88], 0.6),
        Layer(w_head(ctx, False), hair_paint([0.12, 0.08, 0.05]), 0.012),
    ]


def o_punk(C, ctx):
    # punk: campera de cuero, calza a cuadros rota, borceguíes
    return [
        Layer(w_legs(ctx, ctx.ankleY, ctx.hipY), plaid([0.6, 0.05, 0.08], [0.05, 0.02, 0.02], 22), 0.004),
        Layer(w_torso(ctx, ctx.crotchY - 0.04, ctx.hipY + 0.05), fabric([0.03, 0.03, 0.03]), 0.007),
        Layer(w_torso(ctx, ctx.hipY + 0.03, ctx.neckY + 0.03, arms=True), glossy([0.04, 0.04, 0.045], 0.3), 0.012),
        Layer(w_arms(ctx, 0.0, 1.85), glossy([0.04, 0.04, 0.045], 0.3), 0.011),
        shoes(ctx, ctx.ankleY + 0.13, [0.03, 0.03, 0.03], 0.3),
        Layer(w_head(ctx, False), hair_paint([0.95, 0.2, 0.6]), 0.014),
    ]


def o_granny(C, ctx):
    # abuela: saco de lana bordó, pollera gris larga, medias, zapatos
    return [
        Layer(w_legs(ctx, ctx.ankleY, ctx.hipY), solid([0.55, 0.45, 0.4], 0.7), 0.002),
        Layer(w_lower(ctx, ctx.kneeY - 0.12, ctx.waistY), fabric([0.35, 0.35, 0.37], 0.9), 0.013),
        Layer(w_torso(ctx, ctx.waistY - 0.15, ctx.neckY + 0.02, arms=True), fabric([0.42, 0.08, 0.12], 0.95, 160), 0.012),
        Layer(w_arms(ctx, 0.0, 1.85), fabric([0.42, 0.08, 0.12], 0.95, 160), 0.012),
        buttons(ctx, [0.85, 0.82, 0.75], ctx.waistY - 0.1, ctx.chestY + 0.05, 5),
        shoes(ctx, ctx.ankleY + 0.03, [0.12, 0.08, 0.06], 0.3),
        Layer(w_head(ctx, False), hair_paint([0.82, 0.82, 0.84]), 0.012),
    ]


def o_fan(C, ctx):
    # hincha: camiseta a bastones celeste y blanca, short negro, medias y botines
    return [
        Layer(w_legs(ctx, ctx.ankleY, ctx.kneeY - 0.02), fabric([0.95, 0.95, 0.95], 0.8), 0.004),
        Layer(w_lower(ctx, ctx.kneeY + 0.1, ctx.waistY), fabric([0.03, 0.03, 0.04], 0.7), 0.008),
        Layer(w_torso(ctx, ctx.waistY - 0.12, ctx.neckY + 0.02, arms=True), stripes([0.45, 0.72, 0.92], [0.97, 0.97, 0.97]), 0.009),
        Layer(w_arms(ctx, 0.0, 0.45), stripes([0.45, 0.72, 0.92], [0.97, 0.97, 0.97]), 0.009),
        shoes(ctx, ctx.ankleY + 0.03, [0.05, 0.05, 0.05], 0.4),
        Layer(w_head(ctx, False), hair_paint([0.08, 0.06, 0.05]), 0.01),
    ]


def o_jogger(C, ctx):
    # corredora: top deportivo, calza, zapatillas fluo
    return [
        Layer(w_lower(ctx, ctx.kneeY - 0.12, ctx.waistY), glossy([0.08, 0.08, 0.12], 0.45), 0.005),
        Layer(w_torso(ctx, ctx.waistY - 0.1, ctx.neckY, arms=True), fabric([0.12, 0.55, 0.62], 0.6), 0.008),
        shoes(ctx, ctx.ankleY + 0.04, [0.8, 1.0, 0.15], 0.5),
        Layer(w_head(ctx, False), hair_paint([0.55, 0.35, 0.15]), 0.014),
    ]


V_OUTFITS = {'witch': o_witch, 'griller': o_griller, 'innkeeper': o_innkeeper, 'gravedigger': o_gravedigger, 'guard': o_guard,
             'farmer': o_farmer, 'maid': o_maid, 'townsman': o_townsman, 'punk': o_punk, 'granny': o_granny, 'fan': o_fan,
             'jogger': o_jogger}

O = 'public/assets/chars/npc/'
V_CAST = {
    'v_bruja': {'body': {'gender': 0, 'muscle': 0.35, 'weight': 0.35, 'height': 0.55, 'proportions': 0.4, 'cup': 0.4, 'age': 0.85}, 'skin': OLD, 'lips': [0.3, 0.05, 0.25], 'eyeshadow': [0.2, 0.05, 0.25], 'hairColor': [0.55, 0.55, 0.58], 'nails': [0.1, 0.02, 0.1], 'outfit': 'witch', 'shoes': True, 'acc': [{'k': 'witchhat'}], 'hair': 'long', 'out': O + 'v_bruja.glb'},
    'v_parrillero': {'body': {'gender': 1, 'muscle': 0.5, 'weight': 0.85, 'height': 0.5}, 'skin': FAIR, 'beard': [0.12, 0.08, 0.05], 'hairColor': [0.1, 0.07, 0.05], 'outfit': 'griller', 'shoes': True, 'acc': [{'k': 'cap', 'color': [0.9, 0.9, 0.9], 'visor': [0.55, 0.06, 0.05]}], 'hair': 'short', 'out': O + 'v_parrillero.glb'},
    'v_tabernero': {'body': {'gender': 1, 'muscle': 0.6, 'weight': 0.7, 'height': 0.65}, 'skin': PALE, 'beard': [0.3, 0.17, 0.08], 'brows': [0.3, 0.17, 0.08], 'hairColor': [0.3, 0.17, 0.08], 'outfit': 'innkeeper', 'shoes': True, 'hair': 'short', 'out': O + 'v_tabernero.glb'},
    'v_sepulturero': {'body': {'gender': 1, 'muscle': 0.3, 'weight': 0.15, 'height': 0.95, 'age': 0.8}, 'skin': [0.78, 0.74, 0.72], 'brows': [0.05, 0.05, 0.05], 'outfit': 'gravedigger', 'shoes': True, 'acc': [{'k': 'tophat'}], 'hair': 'short', 'out': O + 'v_sepulturero.glb'},
    'v_guardia': {'body': {'gender': 1, 'muscle': 0.8, 'weight': 0.55, 'height': 0.8}, 'skin': OLIVE, 'beard': [0.06, 0.05, 0.04], 'hairColor': [0.06, 0.05, 0.04], 'outfit': 'guard', 'shoes': True, 'acc': [{'k': 'cap', 'color': [0.07, 0.08, 0.2], 'visor': [0.02, 0.02, 0.02]}], 'hair': 'short', 'out': O + 'v_guardia.glb'},
    'v_granjero': {'body': {'gender': 1, 'muscle': 0.65, 'weight': 0.55, 'height': 0.6, 'age': 0.65}, 'skin': TAN, 'beard': [0.4, 0.3, 0.2], 'hairColor': [0.4, 0.3, 0.2], 'outfit': 'farmer', 'shoes': True, 'acc': [{'k': 'strawhat'}], 'hair': 'short', 'out': O + 'v_granjero.glb'},
    'v_aldeana': {'body': {'gender': 0, 'muscle': 0.45, 'weight': 0.55, 'height': 0.45, 'proportions': 0.8, 'cup': 0.6}, 'skin': FAIR, 'lips': [0.6, 0.25, 0.25], 'hairColor': [0.35, 0.18, 0.08], 'outfit': 'maid', 'shoes': True, 'hair': 'shoulder', 'out': O + 'v_aldeana.glb'},
    'v_vecino': {'body': {'gender': 1, 'muscle': 0.5, 'weight': 0.5, 'height': 0.55, 'race': {'african': 0.4, 'caucasian': 0.6}}, 'skin': DARK, 'hairColor': [0.05, 0.04, 0.03], 'outfit': 'townsman', 'shoes': True, 'hair': 'short', 'out': O + 'v_vecino.glb'},
    'v_punk': {'body': {'gender': 0, 'muscle': 0.5, 'weight': 0.35, 'height': 0.55, 'proportions': 0.9, 'cup': 0.5}, 'skin': PALE, 'lips': [0.1, 0.02, 0.05], 'eyeshadow': [0.05, 0.02, 0.05], 'hairColor': [0.95, 0.2, 0.6], 'nails': [0.02, 0.02, 0.02], 'outfit': 'punk', 'shoes': True, 'acc': [{'k': 'mohawk', 'color': [0.95, 0.2, 0.6]}], 'out': O + 'v_punk.glb'},
    'v_abuela': {'body': {'gender': 0, 'muscle': 0.25, 'weight': 0.6, 'height': 0.25, 'proportions': 0.3, 'cup': 0.5, 'age': 1.0}, 'skin': OLD, 'lips': [0.55, 0.3, 0.32], 'hairColor': [0.82, 0.82, 0.84], 'outfit': 'granny', 'shoes': True, 'acc': [{'k': 'glasses'}], 'hair': 'short', 'out': O + 'v_abuela.glb'},
    'v_hincha': {'body': {'gender': 1, 'muscle': 0.55, 'weight': 0.6, 'height': 0.5, 'race': {'caucasian': 0.7, 'african': 0.3}}, 'skin': OLIVE, 'beard': [0.08, 0.06, 0.05], 'hairColor': [0.08, 0.06, 0.05], 'outfit': 'fan', 'shoes': True, 'hair': 'short', 'out': O + 'v_hincha.glb'},
    'v_corredora': {'body': {'gender': 0, 'muscle': 0.65, 'weight': 0.3, 'height': 0.6, 'proportions': 1, 'cup': 0.5, 'race': {'asian': 0.5, 'caucasian': 0.5}}, 'skin': OLIVE, 'lips': [0.6, 0.3, 0.3], 'hairColor': [0.55, 0.35, 0.15], 'outfit': 'jogger', 'shoes': True, 'hair': 'shoulder', 'out': O + 'v_corredora.glb'},
}
