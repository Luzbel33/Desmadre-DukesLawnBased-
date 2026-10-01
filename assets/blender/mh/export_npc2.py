"""Etapa 2 de build_npc2.py (Blender): malla + esqueleto del juego + material con el atlas -> GLB del NPC.
    blender -b --factory-startup -P assets/blender/mh/export_npc2.py -- [NOMBRE ...] [--preview]
El material lleva alfa (pelo, cejas, pestañas): el juego lo dibuja con recorte (alphaTest), no con mezcla.
"""
import json
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SRC = os.path.join(ROOT, 'output', 'npc2')


def to_b(p):  # MakeHuman (Y arriba, mira a +Z) -> Blender (Z arriba, mira a -Y)
    return (float(p[0]), float(-p[2]), float(p[1]))


def export(name, preview=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    meta = json.load(open(os.path.join(SRC, name + '.json'), encoding='utf-8'))
    D = np.load(os.path.join(SRC, name + '.npz'))
    V, sizes, fv, fuv, wi, ww = D['verts'], D['sizes'], D['fverts'], D['fuvs'], D['wi'], D['ww']
    faces, k = [], 0
    for n in sizes:
        faces.append(fv[k:k + n].tolist()); k += n
    me = bpy.data.meshes.new(name)
    me.from_pydata([to_b(v) for v in V], [], faces)
    me.update()
    uvl = me.uv_layers.new(name='UVMap')
    uvl.data.foreach_set('uv', fuv.reshape(-1).astype(np.float32))
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), bool))
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    # esqueleto (orden de PARENTS: padres antes que hijos)
    arm = bpy.data.armatures.new(name + 'Rig')
    rig = bpy.data.objects.new(name + 'Rig', arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for bn in meta['bones']:
        h, t = meta['P'][bn]
        b = arm.edit_bones.new(bn)
        b.head = to_b(h); b.tail = to_b(t)
        if (b.tail - b.head).length < 1e-4:
            b.tail = (b.head[0], b.head[1], b.head[2] + 0.02)
        eb[bn] = b
    for bn, par in meta['parents'].items():
        if par:
            eb[bn].parent = eb[par]
    bpy.ops.object.mode_set(mode='OBJECT')
    groups = [obj.vertex_groups.new(name=bn) for bn in meta['bones']]
    for v in range(len(V)):
        for j in range(4):
            if ww[v, j] > 1e-4:
                groups[wi[v, j]].add([v], float(ww[v, j]), 'REPLACE')
    obj.parent = rig
    mod = obj.modifiers.new('Armature', 'ARMATURE'); mod.object = rig
    # material: color con alfa + normal + rugosidad (en el canal G del mapa metal/rugosidad de glTF)
    col = bpy.data.images.load(os.path.join(SRC, name + '_color.png'))
    nor = bpy.data.images.load(os.path.join(SRC, name + '_normal.png')); nor.colorspace_settings.name = 'Non-Color'
    rgh = bpy.data.images.load(os.path.join(SRC, name + '_rough.png')); rgh.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = not meta['double']
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = col
    nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tc.outputs['Alpha'], bsdf.inputs['Alpha'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nor
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    tr = nt.nodes.new('ShaderNodeTexImage'); tr.image = rgh
    nt.links.new(tr.outputs['Color'], bsdf.inputs['Roughness'])
    bsdf.inputs['Metallic'].default_value = 0.0
    obj.data.materials.append(mat)
    out = os.path.join(ROOT, meta['out'])
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_animations=False,
                              export_image_format='WEBP', export_yup=True, use_selection=False)
    print('OK', out, os.path.getsize(out) // 1024, 'KB', len(V), 'vértices')
    if preview:
        render_preview(obj, name)


def render_preview(obj, name):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'
    sc.render.resolution_x, sc.render.resolution_y = 900, 900
    cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co)
    sc.camera = co
    for loc, e in (((2, -3, 3), 900), ((-3, -2, 2), 400), ((0, 3, 3), 600)):
        ld = bpy.data.lights.new('l', 'AREA'); ld.energy = e; ld.size = 3
        lo = bpy.data.objects.new('l', ld); lo.location = loc; sc.collection.objects.link(lo)
        lo.rotation_euler = (math.atan2(math.hypot(loc[0], loc[1]), loc[2]), 0, math.atan2(loc[0], -loc[1]))
    w = bpy.data.worlds.new('w'); w.color = (0.12, 0.12, 0.13); sc.world = w
    hgt = max(v.co.z for v in obj.data.vertices)
    for tag, loc, tgt, lens in (('full', (0.9, -3.4, hgt * 0.55), (0, 0, hgt * 0.5), 45), ('face', (0.12, -0.75, hgt - 0.12), (0, 0, hgt - 0.13), 60)):
        from mathutils import Vector
        co.location = loc
        co.rotation_euler = (Vector(tgt) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        cam.lens = lens
        sc.render.filepath = os.path.join(SRC, f'{name}_{tag}.png')
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    prev = '--preview' in args
    names = [a for a in args if not a.startswith('--')]
    if not names:
        names = sorted(f[:-5] for f in os.listdir(SRC) if f.endswith('.json'))
    for n in names:
        export(n, prev)
