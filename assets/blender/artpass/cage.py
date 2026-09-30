"""Jaula colgante (gibbet): aros de hierro plano con barrotes, techo en cúpula con argolla, piso de planchuela y la
cadena. También un montón de huesos sueltos (bones_pile) con piezas del esqueleto CC0.
  blender -b --factory-startup -P cage.py -- cage|pile
Salidas: public/assets/props/art/gibbet.glb (origen: punto de donde cuelga la cadena, arriba; la jaula cuelga hacia -Z),
bones_pile.glb (origen en el piso)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *

RENDERS = os.path.join(SRC, 'renders')
CH = 1.2      # largo de la cadena
HH = 1.95     # alto de la jaula
RX, RY = 0.36, 0.3   # radios (un poco ovalada: el cuerpo)


def hoop(r_x, r_y, z, iron, w=0.035, t=0.008, segs=32):
    import bmesh as _bm
    bm = _bm.new()
    rings = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        c, s = math.cos(a), math.sin(a)
        loop = []
        for dr, dz in ((-t / 2, -w / 2), (t / 2, -w / 2), (t / 2, w / 2), (-t / 2, w / 2)):
            loop.append(bm.verts.new(((r_x + dr) * c, (r_y + dr) * s, z + dz)))
        rings.append(loop)
    for k in range(segs):
        a, b = rings[k], rings[(k + 1) % segs]
        for j in range(4):
            bm.faces.new([a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]])
    me = bpy.data.meshes.new('hoop'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('hoop', me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(iron)
    return o


def chain(p0, p1, iron, link=0.07):
    d = Vector(p1) - Vector(p0)
    n = max(2, int(d.length / (link * 0.72)))
    parts = []
    rot = d.to_track_quat('Z', 'Y')
    for i in range(n):
        c = Vector(p0) + d * ((i + 0.5) / n)
        bpy.ops.mesh.primitive_torus_add(major_radius=link * 0.5, minor_radius=0.009, major_segments=10, minor_segments=5, location=c)
        tor = bpy.context.active_object
        tor.scale = (0.62, 1.0, 1.0)
        tor.rotation_mode = 'QUATERNION'
        tor.rotation_quaternion = rot @ Euler((math.radians(90), 0, math.radians(90) * (i % 2)), 'XYZ').to_quaternion()
        tor.data.materials.append(iron)
        parts.append(tor)
    return parts


def make_cage():
    reset()
    iron = pbr('cage_iron', 'rusty_metal_02', '1k', rough=0.6, metal=1.0, scale=0.35, tint=(0.42, 0.36, 0.32))
    parts = []
    top = -CH
    z0 = top - HH
    # aros (el de abajo más ancho, uno a la altura de la cintura)
    for zz, k in ((z0 + 0.02, 1.0), (z0 + 0.5, 1.0), (z0 + 1.05, 1.02), (z0 + 1.55, 0.95), (z0 + 1.82, 0.72)):
        parts.append(hoop(RX * k, RY * k, zz, iron))
    # barrotes verticales (siguen el cierre de la cúpula)
    nb = 14
    for k in range(nb):
        a = 2 * math.pi * k / nb
        pts = []
        for zz, kk in ((z0, 1.0), (z0 + 1.55, 0.95), (z0 + 1.82, 0.72), (top - 0.02, 0.05)):
            pts.append((RX * kk * math.cos(a), RY * kk * math.sin(a), zz))
        cu = bpy.data.curves.new('bar', 'CURVE'); cu.dimensions = '3D'
        sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts):
            sp.points[i].co = (*p, 1)
        cu.bevel_depth = 0.009; cu.bevel_resolution = 1
        ob = bpy.data.objects.new('bar', cu); bpy.context.scene.collection.objects.link(ob)
        select([ob]); bpy.ops.object.convert(target='MESH')
        ob = bpy.context.active_object; ob.data.materials.append(iron); parts.append(ob)
    # piso: planchuelas en cruz y un disco calado
    for ang in (0, 60, 120):
        parts.append(cube('floorbar', (0, 0, z0 + 0.01), (RX * 2, 0.05, 0.012), iron, 0.002, rot=(0, 0, math.radians(ang))))
    # argolla arriba y cadena
    bpy.ops.mesh.primitive_torus_add(major_radius=0.05, minor_radius=0.011, location=(0, 0, top + 0.03), rotation=(math.radians(90), 0, 0))
    r = bpy.context.active_object; r.data.materials.append(iron); parts.append(r)
    parts += chain((0, 0, 0.0), (0, 0, top + 0.07), iron)
    # la puerta: una bisagra y un candado en un costado
    parts.append(cube('lock', (RX + 0.01, 0, z0 + 1.05), (0.03, 0.07, 0.09), iron, 0.004))
    o = join(parts, 'gibbet')
    box_uv(o, 0.35)
    smooth(o, 40)
    print('jaula: piso a', round(z0, 3), 'desde el gancho')
    export([o], 'gibbet', tex_res=512)
    preview(os.path.join(RENDERS, 'gibbet_prev.png'), (1.6, -2.4, -1.4), (0, 0, -2.2), lens=35, w=700, h=900)


def make_pile():
    reset()
    BUNDLE = os.path.join(SRC, 'human-base-meshes-bundle-v1.4.1', 'human_base_meshes_bundle.blend')
    want = ['leg_femur.L', 'leg_femur.R', 'leg_tibula.L', 'arm_humerus.R', 'arm_radius.L', 'hip', 'skull', 'arm_ulna.R', 'leg_fibula.L']
    with bpy.data.libraries.load(BUNDLE, link=False) as (src, dst):
        dst.objects = ['GEO-skeletion.' + n for n in want if 'GEO-skeletion.' + n in src.objects]
    objs = [o for o in dst.objects if o]
    rnd = random.Random(5)
    placed = []
    for o in objs:
        bpy.context.scene.collection.objects.link(o)
        o.parent = None
        if o.data.users > 1:
            o.data = o.data.copy()
        for md in o.modifiers:
            if md.type == 'SUBSURF':
                md.levels = 1
        # centrar en su caja y acostar (los huesos largos quedan horizontales)
        bpy.context.view_layer.update()
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        c = sum(bb, Vector()) / 8
        o.matrix_world = Matrix.Translation(-c) @ o.matrix_world
    k = 0
    for o in objs:
        long = max(o.dimensions) > 0.2
        if long:
            o.matrix_world = Matrix.Rotation(math.radians(90 + rnd.uniform(-8, 8)), 4, 'X') @ o.matrix_world
        o.matrix_world = Matrix.Rotation(rnd.uniform(0, 6.28), 4, 'Z') @ o.matrix_world
        ang = k * 2.4
        rr = 0.08 + 0.05 * k
        o.matrix_world = Matrix.Translation((math.cos(ang) * rr, math.sin(ang) * rr, 0)) @ o.matrix_world
        k += 1
    bpy.context.view_layer.update()
    # apoyar cada hueso en el piso o encima de los anteriores (aproximado: por altura acumulada donde se cruzan)
    for i, o in enumerate(objs):
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        zmin = min(v.z for v in bb)
        o.location.z -= zmin - (0.025 * (i % 3))
    import importlib
    sys.path.insert(0, HERE)
    sk = importlib.import_module('skeleton')
    j = sk.finish(objs, 'bones_pile', 7000, tex=1024)
    export([j], 'bones_pile', tex_res=1024)
    preview(os.path.join(RENDERS, 'pile_prev.png'), (0.9, -1.1, 0.8), (0, 0, 0.05), lens=40, w=800, h=600)


what = (args() or ['cage'])[0]
make_cage() if what == 'cage' else make_pile()
