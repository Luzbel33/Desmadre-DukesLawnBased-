"""Caldero de hierro fundido: panza redonda (perfil girado), labio grueso, tres patas cortas, dos orejas con el asa de
hierro en arco, hollín en la parte de abajo (color horneado). El líquido lo pone el juego (shader animado).
  blender -b --factory-startup -P cauldron.py
Salida: public/assets/props/art/cauldron.glb (origen en el piso; nodo "liquid" a la altura del líquido)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *

RENDERS = os.path.join(SRC, 'renders')
PROFILE = [(0.0, 0.10), (0.16, 0.105), (0.3, 0.14), (0.41, 0.24), (0.46, 0.38), (0.45, 0.52), (0.41, 0.62), (0.385, 0.67),
           (0.40, 0.70), (0.425, 0.71), (0.43, 0.735), (0.395, 0.74), (0.37, 0.72), (0.36, 0.68)]   # de afuera hacia adentro
INNER = [(0.36, 0.68), (0.38, 0.6), (0.4, 0.5), (0.39, 0.38), (0.34, 0.25), (0.22, 0.17), (0.0, 0.155)]
LIQ = 0.6


def spin(profile, name, mat, segs=48):
    import bmesh as _bm
    bm = _bm.new()
    rings = []
    for (r, z) in profile:
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segs):
            bm.faces.new([rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]])
    _bm.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    _bm.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return o


def main():
    reset()
    iron = pbr('cast_iron', 'rusty_metal_03', '1k', rough=0.75, metal=0.9, scale=0.5, tint=(0.14, 0.13, 0.12))
    body = spin(PROFILE + INNER[1:], 'body', iron)
    parts = [body]
    # patas: tres conos cortos y achatados
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.3
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.035, radius2=0.06, depth=0.16, location=(math.cos(a) * 0.27, math.sin(a) * 0.27, 0.08))
        l = bpy.context.active_object; l.data.materials.append(iron); parts.append(l)
    # orejas y asa en arco
    for s in (-1, 1):
        parts.append(cube('ear', (s * 0.445, 0, 0.66), (0.06, 0.07, 0.07), iron, 0.01))
    pts = []
    for k in range(25):
        t = k / 24
        a = math.pi * t
        pts.append((-0.47 * math.cos(a), 0, 0.68 + 0.42 * math.sin(a)))
    cu = bpy.data.curves.new('bail', 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1)
    cu.bevel_depth = 0.012; cu.bevel_resolution = 2
    bo = bpy.data.objects.new('bail', cu); bpy.context.scene.collection.objects.link(bo)
    select([bo]); bpy.ops.object.convert(target='MESH')
    bo = bpy.context.active_object; bo.data.materials.append(iron)
    # el asa cae hacia un costado (apoyada en el borde)
    bo.rotation_euler = (0, 0, 0); bo.matrix_world = Matrix.Rotation(math.radians(-62), 4, 'X') @ Matrix.Translation((0, 0, -0.68)) @ bo.matrix_world
    bo.location.z += 0.68
    parts.append(bo)
    for o in parts:
        apply_all(o)
    o = join(parts, 'cauldron')
    box_uv(o, 0.5)
    smooth(o, 50)
    liq = bpy.data.objects.new('liquid', None); bpy.context.scene.collection.objects.link(liq)
    liq.location = (0, 0, LIQ)
    export([o, liq], 'cauldron', tex_res=512)
    preview(os.path.join(RENDERS, 'cauldron_prev.png'), (1.1, -1.5, 1.2), (0, 0, 0.4), lens=45, w=700, h=600)


main()
