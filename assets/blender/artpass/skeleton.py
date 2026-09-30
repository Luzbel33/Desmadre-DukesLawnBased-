"""Esqueletos y calaveras de verdad: el esqueleto anatómico CC0 de "Human Base Meshes" (Blender Studio) posado hueso por
hueso (cada pieza gira en su articulación), reducido para el juego y con un material de hueso viejo horneado
(color con manchas y mugre en las cavidades, rugosidad, normal).
  blender -b --factory-startup -P skeleton.py -- sit|hang|noose|lie|skull|pile
Salidas en public/assets/props/art/: skeleton_<pose>.glb, skull.glb, bones_pile.glb (origen en el piso; frente -Y de
Blender = +Z del juego)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *
import numpy as np

BUNDLE = os.path.join(SRC, 'human-base-meshes-bundle-v1.4.1', 'human_base_meshes_bundle.blend')
RENDERS = os.path.join(SRC, 'renders')
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)


def append_skeleton():
    with bpy.data.libraries.load(BUNDLE, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith('GEO-skeletion')]
    objs = [o for o in dst.objects if o]
    for o in objs:
        bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.update()
    by = {o.name.replace('GEO-skeletion.', ''): o for o in objs}
    # centrar en el origen (el esqueleto viene corrido en x) y con los pies en el piso
    hip = by['hip']
    off = Vector((-hip.matrix_world.translation.x, 0, 0))
    hip.matrix_world = Matrix.Translation(off) @ hip.matrix_world
    bpy.context.view_layer.update()
    # la caja torácica cuelga de la cadera: la pasamos a la columna (T12) para que se doble con ella
    rib = by['ripcage']
    mw = rib.matrix_world.copy()
    rib.parent = by['spine_thoracic_t12']
    rib.matrix_world = mw
    bpy.context.view_layer.update()
    return by


def rot(o, axis, deg, pivot=None):
    """Gira el hueso o (y sus hijos) en el espacio del mundo alrededor de su articulación (su origen) o de pivot."""
    bpy.context.view_layer.update()
    p = Vector(pivot) if pivot is not None else o.matrix_world.translation.copy()
    R = Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-p)
    o.matrix_world = R @ o.matrix_world
    bpy.context.view_layer.update()


def aim(by, bone, child, d, also=()):
    """Gira el hueso en su articulación hasta que el vector articulación -> articulación hija apunte a d (mundo)."""
    bpy.context.view_layer.update()
    o = by[bone]
    p = o.matrix_world.translation.copy()
    c = by[child].matrix_world.translation.copy()
    q = (c - p).normalized().rotation_difference(Vector(d).normalized())
    R = Matrix.Translation(p) @ q.to_matrix().to_4x4() @ Matrix.Translation(-p)
    for k in (bone,) + tuple(also):
        by[k].matrix_world = R @ by[k].matrix_world
    bpy.context.view_layer.update()


def limbs(by, fem, tib, hum, fore):
    """fem/tib/hum/fore: dict lado -> dirección (L = +X)."""
    for s in ('L', 'R'):
        aim(by, 'leg_femur.' + s, 'leg_tibula.' + s, fem[s])
        aim(by, 'leg_tibula.' + s, 'foot_talus.' + s, tib[s])
        aim(by, 'arm_humerus.' + s, 'arm_radius.' + s, hum[s])
        aim(by, 'arm_radius.' + s, 'hand_center.' + s, fore[s], also=('arm_ulna.' + s,))


def torso(by, low, up, neck_d):
    aim(by, 'spine_lumbar_l5', 'spine_thoracic_t12', low)
    aim(by, 'spine_thoracic_t12', 'spine_thoracic_t1', up)
    aim(by, 'spine_cervical_c7', 'skull', neck_d)


def pose_sit(by):
    """Sentado en el piso contra la pared (detrás, +Y): piernas estiradas y abiertas, la cabeza caída adelante."""
    rot(by['hip'], X, -22)                     # la pelvis se echa atrás al sentarse
    torso(by, (0, 0.32, 1), (0.05, 0.1, 1), (0.22, -0.62, 0.72))
    rot(by['skull'], X, 16); rot(by['skull'], Y, 12)
    limbs(by,
          fem={'L': (0.22, -1, -0.05), 'R': (-0.2, -1, -0.05)},
          tib={'L': (0.14, -1, -0.12), 'R': (-0.1, -1, -0.12)},
          hum={'L': (0.25, 0.08, -1), 'R': (-0.22, 0.02, -1)},
          fore={'L': (0.18, -0.8, -0.55), 'R': (-0.22, -0.55, -0.8)})
    for s, sg in (('L', 1), ('R', -1)):
        rot(by['foot_talus.' + s], Y, sg * 30)


def pose_hang(by):
    """Parado y vencido (adentro de una jaula colgada): rodillas flojas, espalda encorvada, cabeza colgando."""
    torso(by, (0, -0.1, 1), (0.04, -0.32, 1), (0.18, -0.85, 0.5))
    rot(by['skull'], X, 12)
    limbs(by,
          fem={'L': (0.06, -0.22, -1), 'R': (-0.05, -0.18, -1)},
          tib={'L': (0.03, 0.22, -1), 'R': (-0.02, 0.2, -1)},
          hum={'L': (0.14, -0.08, -1), 'R': (-0.12, -0.12, -1)},
          fore={'L': (0.05, -0.18, -1), 'R': (-0.04, -0.3, -1)})


def pose_noose(by):
    """Ahorcado: colgando derecho del cuello, la cabeza quebrada hacia un costado (lejos del nudo, que va detrás de la
    oreja izquierda), hombros caídos, brazos colgando, rodillas apenas flojas y las puntas de los pies para abajo."""
    torso(by, (0.02, 0.03, 1), (0.03, -0.02, 1), (-0.42, 0.08, 0.9))
    rot(by['skull'], Y, -24); rot(by['skull'], X, 10)
    limbs(by,
          fem={'L': (0.05, -0.08, -1), 'R': (-0.04, -0.03, -1)},
          tib={'L': (0.02, 0.12, -1), 'R': (-0.03, 0.08, -1)},
          hum={'L': (0.1, 0.02, -1), 'R': (-0.12, 0.05, -1)},
          fore={'L': (0.06, -0.12, -1), 'R': (-0.05, -0.08, -1)})
    for s in ('L', 'R'):
        rot(by['foot_talus.' + s], X, -48)      # puntas para abajo


def pose_lie(by):
    """Boca arriba, brazos abiertos, la cabeza girada de costado."""
    torso(by, (0, 0.04, 1), (0, 0.02, 1), (0.3, 0.05, 1))
    rot(by['skull'], Z, 55)
    limbs(by,
          fem={'L': (0.14, 0, -1), 'R': (-0.1, 0.02, -1)},
          tib={'L': (0.05, 0, -1), 'R': (-0.08, 0.02, -1)},
          hum={'L': (0.8, 0.05, -0.6), 'R': (-0.9, 0.1, -0.35)},
          fore={'L': (0.6, -0.1, -0.8), 'R': (-0.55, -0.3, 0.2)})
    for s, sg in (('L', 1), ('R', -1)):
        rot(by['foot_talus.' + s], Z, sg * 35)
    rot(by['hip'], X, -90)                     # se acuesta: el frente mira arriba


def bone_material():
    m = bpy.data.materials.new('bone'); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    # color base de hueso viejo con variación grande y chica
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 7; n1.inputs['Detail'].default_value = 6
    nt.links.new(tc.outputs['Object'], n1.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.3; ramp.color_ramp.elements[0].color = (0.36, 0.29, 0.19, 1)
    ramp.color_ramp.elements[1].position = 0.72; ramp.color_ramp.elements[1].color = (0.70, 0.62, 0.47, 1)
    nt.links.new(n1.outputs['Fac'], ramp.inputs['Fac'])
    # mugre en las cavidades (oclusión) y manchas oscuras
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.03; ao.samples = 16
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
    nt.links.new(ramp.outputs['Color'], mul.inputs['A'])
    aor = nt.nodes.new('ShaderNodeValToRGB')
    aor.color_ramp.elements[0].position = 0.0; aor.color_ramp.elements[0].color = (0.18, 0.14, 0.1, 1)
    aor.color_ramp.elements[1].position = 0.85; aor.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(ao.outputs['AO'], aor.inputs['Fac'])
    nt.links.new(aor.outputs['Color'], mul.inputs['B'])
    mul.inputs['Factor'].default_value = 1.0
    n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 26; n2.inputs['Detail'].default_value = 3
    nt.links.new(tc.outputs['Object'], n2.inputs['Vector'])
    st = nt.nodes.new('ShaderNodeMapRange'); st.inputs['From Min'].default_value = 0.6; st.inputs['From Max'].default_value = 0.75
    nt.links.new(n2.outputs['Fac'], st.inputs['Value'])
    stain = nt.nodes.new('ShaderNodeMix'); stain.data_type = 'RGBA'; stain.blend_type = 'MIX'
    nt.links.new(mul.outputs['Result'], stain.inputs['A'])
    stain.inputs['B'].default_value = (0.20, 0.13, 0.07, 1)
    sk = nt.nodes.new('ShaderNodeMath'); sk.operation = 'MULTIPLY'; sk.inputs[1].default_value = 0.55
    nt.links.new(st.outputs['Result'], sk.inputs[0])
    nt.links.new(sk.outputs[0], stain.inputs['Factor'])
    nt.links.new(stain.outputs['Result'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.72
    # poros y rajaduras finas
    n3 = nt.nodes.new('ShaderNodeTexNoise'); n3.inputs['Scale'].default_value = 180; n3.inputs['Detail'].default_value = 2
    nt.links.new(tc.outputs['Object'], n3.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.002
    nt.links.new(n3.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m


def finish(objs, name, target_tris, tex=1024, keep_names=()):
    """Aplica subdivisión, une, reduce a target_tris, UV para hornear y hornea el material de hueso."""
    for o in objs:
        for md in o.modifiers:
            if md.type in ('SUBSURF', 'MULTIRES'):
                try:
                    md.levels = 1
                    if hasattr(md, 'render_levels'): md.render_levels = 1
                except Exception:
                    pass
    mesh_objs = [o for o in objs if o.type == 'MESH']
    for o in mesh_objs:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        if o.data.users > 1:
            o.data = o.data.copy()
    for o in mesh_objs:
        select([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        for md in list(o.modifiers):
            if md.type == 'MULTIRES':
                o.modifiers.remove(md)
                continue
            try:
                bpy.ops.object.modifier_apply(modifier=md.name)
            except Exception as e:
                print('mod', o.name, md.name, e)
    j = join(mesh_objs, name)
    t0 = tris(j)
    if t0 > target_tris:
        md = j.modifiers.new('dec', 'DECIMATE'); md.ratio = target_tris / t0; md.use_collapse_triangulate = True
        select([j]); bpy.ops.object.modifier_apply(modifier='dec')
    print(name, 'tris', t0, '->', tris(j))
    # apoyar en el piso y centrar en x/y
    ws = [j.matrix_world @ v.co for v in j.data.vertices]
    zmin = min(v.z for v in ws)
    off = Vector((-(min(v.x for v in ws) + max(v.x for v in ws)) / 2, -(min(v.y for v in ws) + max(v.y for v in ws)) / 2, -zmin))
    j['off'] = tuple(off)
    j.location += off
    select([j]); bpy.ops.object.transform_apply(location=True)
    j.data.materials.clear(); j.data.materials.append(bone_material())
    me = j.data
    for l in list(me.uv_layers):
        me.uv_layers.remove(l)
    me.uv_layers.new(name='UVMap')
    select([j]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    smooth(j, 60)
    bake_textures(j, name, res=tex, samples=16)
    return j


def main():
    what = (args() or ['sit'])[0]
    reset()
    if what == 'skull':
        with bpy.data.libraries.load(BUNDLE, link=False) as (src, dst):
            dst.objects = [n for n in src.objects if n == 'Skull - Realistic']
        objs = [o for o in dst.objects if o]
        for o in objs:
            bpy.context.scene.collection.objects.link(o)
        bpy.context.view_layer.update()
        for o in objs:
            print('pieza', o.name, [round(x, 3) for x in o.dimensions])
        j = finish(objs, 'skull', 5000, tex=1024)
        # la calavera real mide ~22 cm de largo: escalar si el asset viene en otra escala
        d = max(j.dimensions)
        if d > 0.01 and abs(d - 0.21) > 0.03:
            k = 0.21 / d; j.scale = (k, k, k); select([j]); bpy.ops.object.transform_apply(scale=True)
        export([j], 'skull', tex_res=1024)
        preview(os.path.join(RENDERS, 'skull_prev.png'), (0.25, -0.45, 0.2), (0, 0, 0.1), lens=50, w=700, h=600)
        return
    by = append_skeleton()
    {'sit': pose_sit, 'hang': pose_hang, 'noose': pose_noose, 'lie': pose_lie}[what](by)
    # el cuello (entre C2 y C3): ahí va el lazo del ahorcado
    neck = (by['spine_cervical_c2'].matrix_world.translation + by['spine_cervical_c3'].matrix_world.translation) / 2 if what == 'noose' else None
    j = finish(list(by.values()), 'skeleton_' + what, 14000, tex=1024)
    objs = [j]
    if neck is not None:
        nd = bpy.data.objects.new('neck', None); bpy.context.scene.collection.objects.link(nd)
        nd.location = neck + Vector(j['off'])
        print('cuello', [round(c, 3) for c in nd.location])
        objs.append(nd)
    export(objs, 'skeleton_' + what, tex_res=1024)
    preview(os.path.join(RENDERS, f'skeleton_{what}_prev.png'), (1.3, -2.2, 1.3), (0, 0, 0.6 if what != 'lie' else 0.1), lens=40, w=800, h=800)


if __name__ == '__main__':
    main()
