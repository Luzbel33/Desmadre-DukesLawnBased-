"""Quién es quién (NPC que NO son las bailarinas): cuerpo de MakeHuman y piezas del paquete de recursos de sistema de
MakeHuman (CC0): piel, ropa, zapatos, sombrero, peinado, cejas, pestañas, ojos, dientes y lengua.
tint: color que multiplica la textura (ropa o pelo) para variar sin pintar nada a mano.
Las bailarinas (lilith, coneja, venus, raven, emo) NO están acá: no se tocan.
"""

BASE = {'eyebrows': 'eyebrow001', 'eyelashes': 'eyelashes01', 'eyes': 'darkbrown', 'teeth': 'teeth_base', 'tongue': 'tongue01'}


def npc(out, body, skin, clothes, hair=None, hat=None, **kw):
    d = dict(BASE)
    d.update({'out': f'public/assets/chars/npc/{out}.glb', 'body': body, 'skin': skin, 'clothes': clothes, 'hair': hair, 'hat': hat})
    d.update(kw)
    return d


CAST2 = {
    # --- el Búnker
    'portero': npc('portero', {'gender': 1, 'muscle': 0.95, 'weight': 0.8, 'height': 0.95, 'race': {'african': 0.6, 'caucasian': 0.4}},
                   'middleage_african_male', [('male_elegantsuit01', (0.32, 0.32, 0.34)), ('shoes04', None)], eyebrows='eyebrow006'),
    'bartender': npc('bartender', {'gender': 1, 'muscle': 0.7, 'weight': 0.6, 'height': 0.6},
                     'middleage_caucasian_male', [('male_casualsuit03', None), ('shoes02', None)], hair=('short02', (0.55, 0.42, 0.32)), eyebrows='eyebrow004', eyes='blue'),
    'dj': npc('dj', {'gender': 1, 'muscle': 0.4, 'weight': 0.35, 'height': 0.6},
              'young_caucasian_male2', [('male_casualsuit05', (0.5, 0.5, 0.55)), ('shoes04', None)], hair=('short02', (0.25, 0.22, 0.22)), eyes='bluegreen'),
    'toro': npc('toro', {'gender': 1, 'muscle': 1.0, 'weight': 0.85, 'height': 0.75},
                'middleage_caucasian_male', [('male_casualsuit06', ((1.0, 0.3, 0.28), 'light')), ('shoes05', None)], hair=('short04', (0.3, 0.25, 0.2)), eyebrows='eyebrow007'),
    'chacal': npc('chacal', {'gender': 1, 'muscle': 0.95, 'weight': 0.35, 'height': 0.55, 'race': {'african': 0.8, 'caucasian': 0.2}},
                  'young_african_male', [('male_casualsuit04', (0.25, 0.25, 0.28)), ('shoes06', None)], hair=('afro01', None)),
    'metalero': npc('metalero', {'gender': 1, 'muscle': 0.45, 'weight': 0.65, 'height': 0.6},
                    'young_caucasian_male', [('male_casualsuit06', ((0.14, 0.14, 0.15), 'light')), ('shoes03', None)], hair=('long01', (0.35, 0.3, 0.28)), eyes='grey'),
    'raver': npc('raver', {'gender': 1, 'muscle': 0.6, 'weight': 0.3, 'height': 0.5, 'race': {'asian': 1.0}},
                 'young_asian_male', [('male_casualsuit02', None), ('shoes05', None)], hair=('short03', (0.3, 0.3, 0.3))),
    'gordo': npc('gordo', {'gender': 1, 'muscle': 0.2, 'weight': 1.0, 'height': 0.35},
                 'young_caucasian_male2', [('male_casualsuit03', (1.0, 0.85, 0.6)), ('shoes01', None)], hair=('short02', (0.7, 0.55, 0.4)), eyes='blue'),
    # --- la gente del castillo y del mapa
    'v_bruja': npc('v_bruja', {'gender': 0, 'muscle': 0.35, 'weight': 0.35, 'height': 0.55, 'proportions': 0.4, 'cup': 0.4, 'age': 0.85},
                   'old_caucasian_female', [('female_elegantsuit01', (0.45, 0.32, 0.5)), ('shoes03', None)], hair=('long01', (0.45, 0.42, 0.45)), eyes='green'),
    'v_parrillero': npc('v_parrillero', {'gender': 1, 'muscle': 0.5, 'weight': 0.85, 'height': 0.5},
                        'middleage_caucasian_male', [('male_casualsuit06', None), ('shoes02', None)], hair=('short02', (0.4, 0.3, 0.22)), eyes='brownlight'),
    'v_tabernero': npc('v_tabernero', {'gender': 1, 'muscle': 0.6, 'weight': 0.7, 'height': 0.65},
                       'young_caucasian_male2', [('male_casualsuit03', (0.8, 0.75, 0.7)), ('shoes01', None)], hair=('short04', (0.75, 0.42, 0.25)), eyebrows='eyebrow004', eyes='brownlight'),
    'v_sepulturero': npc('v_sepulturero', {'gender': 1, 'muscle': 0.3, 'weight': 0.15, 'height': 0.95, 'age': 0.8},
                         'old_caucasian_male', [('male_worksuit01', (0.32, 0.3, 0.3)), ('shoes03', None)], hair=('short01', (0.75, 0.75, 0.75)), eyes='grey'),
    'v_guardia': npc('v_guardia', {'gender': 1, 'muscle': 0.8, 'weight': 0.55, 'height': 0.8, 'race': {'african': 0.3, 'caucasian': 0.7}},
                     'middleage_caucasian_male', [('male_elegantsuit01', (0.32, 0.38, 0.62)), ('shoes04', None)], hair=('short01', (0.25, 0.22, 0.2)), hat=('fedora_cocked', (0.2, 0.22, 0.3)), eyes='deepblue'),
    'v_granjero': npc('v_granjero', {'gender': 1, 'muscle': 0.65, 'weight': 0.55, 'height': 0.6, 'age': 0.65},
                      'old_caucasian_male', [('male_worksuit01', None), ('shoes03', None)], hair=('short01', (0.6, 0.55, 0.5)), hat=('fedora01', (1.0, 0.85, 0.55)), eyes='blue'),
    'v_aldeana': npc('v_aldeana', {'gender': 0, 'muscle': 0.45, 'weight': 0.55, 'height': 0.45, 'proportions': 0.8, 'cup': 0.6},
                     'young_caucasian_female', [('female_casualsuit01', None), ('shoes02', None)], hair=('braid01', (0.9, 0.6, 0.4)), eyebrows='eyebrow002', eyes='bluegreen'),
    'v_vecino': npc('v_vecino', {'gender': 1, 'muscle': 0.5, 'weight': 0.5, 'height': 0.55, 'race': {'african': 0.6, 'caucasian': 0.4}},
                    'middleage_african_male', [('male_casualsuit05', None), ('shoes01', None)], hair=('short01', (0.2, 0.18, 0.17))),
    'v_punk': npc('v_punk', {'gender': 0, 'muscle': 0.5, 'weight': 0.35, 'height': 0.55, 'proportions': 0.9, 'cup': 0.5},
                  'young_caucasian_female2', [('female_casualsuit02', (0.35, 0.35, 0.38)), ('shoes03', None)], hair=('bob02', (1.0, 0.45, 0.75)), eyebrows='eyebrow002', eyes='lightblue'),
    'v_abuela': npc('v_abuela', {'gender': 0, 'muscle': 0.25, 'weight': 0.6, 'height': 0.25, 'proportions': 0.3, 'cup': 0.5, 'age': 1.0},
                    'old_caucasian_female', [('female_elegantsuit01', (0.62, 0.48, 0.6)), ('shoes01', None)], hair=('bob02', (0.92, 0.92, 0.95)), eyes='grey'),
    'v_hincha': npc('v_hincha', {'gender': 1, 'muscle': 0.55, 'weight': 0.6, 'height': 0.5, 'race': {'caucasian': 0.7, 'african': 0.3}},
                    'young_caucasian_male', [('male_casualsuit04', (0.75, 0.95, 1.0)), ('shoes05', None)], hair=('short04', (0.3, 0.25, 0.2)), eyes='green'),
    'v_corredora': npc('v_corredora', {'gender': 0, 'muscle': 0.65, 'weight': 0.3, 'height': 0.6, 'proportions': 1, 'cup': 0.5, 'race': {'asian': 0.5, 'caucasian': 0.5}},
                       'young_asian_female', [('female_sportsuit01', None), ('shoes06', None)], hair=('ponytail01', (0.6, 0.45, 0.35)), eyebrows='eyebrow002'),
}
