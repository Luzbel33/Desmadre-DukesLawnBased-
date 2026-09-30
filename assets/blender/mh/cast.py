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
    return Layer(lambda p, n, d: inset(d, FOOT | LEG) * smooth(top + 0.02, top - 0.01, p[:, 1]), glossy(col, rough), push)


# ------------------------------------------------------------------ vestuarios
def o_lilith(C, ctx):
    # corsé de látex negro con cordones, bombacha, medias de red, botas bucaneras, guantes largos y pelo negro
    return [
        Layer(w_legs(ctx, ctx.ankleY, ctx.hipY - 0.12), fishnet([0.02, 0.02, 0.02], 0.4, 85, 0.2), 0.001),
        Layer(w_torso(ctx, ctx.crotchY - 0.03, ctx.hipY + 0.035), glossy([0.02, 0.02, 0.025]), 0.004),
        Layer(w_torso(ctx, ctx.hipY + 0.02, ctx.bustY + 0.06), lacing([0.03, 0.02, 0.03], [0.6, 0.05, 0.08]), 0.006),
        boots(ctx, ctx.kneeY + 0.12, [0.03, 0.02, 0.025], 0.18, 0.008),
        Layer(w_arms(ctx, 0.6, 2.01), glossy([0.02, 0.02, 0.025]), 0.003),
        Layer(w_head(ctx, False), hair_paint([0.03, 0.02, 0.03], [0.55, 0.02, 0.06]), 0.018),
    ]


def o_bunny(C, ctx):
    # conejita gótica: body negro de una pieza, cuello blanco, puños, medias de red y tacos
    return [
        Layer(w_legs(ctx, ctx.ankleY, ctx.hipY - 0.03), fishnet([0.01, 0.01, 0.01], 0.4, 95, 0.16), 0.001),
        Layer(w_torso(ctx, ctx.crotchY - 0.04, ctx.bustY + 0.055), glossy([0.02, 0.02, 0.02], 0.2), 0.005),
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


OUTFITS = {'lilith': o_lilith, 'bunny': o_bunny, 'pig': o_pig, 'dj': o_dj}

# ------------------------------------------------------------------ el elenco
CAST = {
    'portero': {'body': {'gender': 1, 'muscle': 0.95, 'weight': 0.8, 'height': 0.95}, 'skin': TAN, 'outfit': 'pig', 'shoes': True, 'acc': [{'k': 'pig'}, {'k': 'shades'}], 'out': 'public/assets/chars/npc/portero.glb'},
    'lilith': {'body': {'gender': 0, 'muscle': 0.55, 'weight': 0.42, 'height': 0.65, 'proportions': 1, 'cup': 0.85}, 'skin': PALE, 'lips': [0.35, 0.02, 0.06], 'eyeshadow': [0.05, 0.02, 0.05], 'hairColor': [0.03, 0.02, 0.03], 'nails': [0.1, 0.0, 0.02], 'outfit': 'lilith', 'shoes': True, 'acc': [{'k': 'horns', 'color': [0.35, 0.02, 0.03]}, {'k': 'ponytail'}], 'out': 'public/assets/chars/npc/lilith.glb'},
    'coneja': {'body': {'gender': 0, 'muscle': 0.5, 'weight': 0.5, 'height': 0.55, 'proportions': 1, 'cup': 0.75, 'race': {'african': 1.0}}, 'skin': DARK, 'lips': [0.45, 0.08, 0.14], 'eyeshadow': [0.25, 0.05, 0.3], 'hairColor': [0.85, 0.82, 0.78], 'nails': [0.6, 0.02, 0.05], 'outfit': 'bunny', 'shoes': True, 'acc': [{'k': 'bunny'}], 'out': 'public/assets/chars/npc/coneja.glb'},
    'dj': {'body': {'gender': 1, 'muscle': 0.4, 'weight': 0.35, 'height': 0.6}, 'skin': OLIVE, 'outfit': 'dj', 'shoes': True, 'hairColor': [0.02, 0.02, 0.02], 'acc': [{'k': 'headphones'}], 'out': 'public/assets/chars/npc/dj.glb'},
}
