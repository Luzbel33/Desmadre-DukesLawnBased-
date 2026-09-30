"""Carro de campo (de los que tiraba un caballo): caja de tablones con estacas y barandas, dos ruedas grandes de rayos con
llanta de hierro y las varas apoyadas en el piso (el carro queda inclinado hacia adelante, sin caballo).
Madera y hierro de Poly Haven (CC0), UV en metros.
  blender -b --factory-startup -P cart.py
Salida: public/assets/props/art/cart.glb (origen: en el piso, centro del eje; las varas apuntan a +X de Blender)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *

RENDERS = os.path.join(SRC, 'renders')
R = 0.62            # radio de las ruedas
BL, BW = 2.5, 1.3   # caja: largo (x) y ancho (y)
SH = 2.3            # largo de las varas desde el frente de la caja
TILT = 0.0          # se calcula: las puntas de las varas tocan el piso


def ring(name, radius, w, h, y, mat, segs=48):
    """Aro de sección rectangular (w a lo ancho del aro, h radial) en el plano XZ, centrado en (0, y, 0)."""
    import bmesh as _bm
    bm = _bm.new()
    rings = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        ca, sa = math.cos(a), math.sin(a)
        loop = []
        for (dy, dr) in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
            r = radius + dr
            loop.append(bm.verts.new((ca * r, y + dy, sa * r)))
        rings.append(loop)
    for k in range(segs):
        a, b = rings[k], rings[(k + 1) % segs]
        for j in range(4):
            bm.faces.new([a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


def wheel(wood, iron, y):
    parts = []
    out = 1 if y > 0 else -1
    # masa (cubo) con aros de hierro
    parts.append(cyl('hub', (0, y, 0), 0.1, 0.3, wood, 16, rot=(math.radians(90), 0, 0), bev=0.01))
    for dy in (-0.11, 0.11):
        parts.append(cyl('hubring', (0, y + dy, 0), 0.108, 0.03, iron, 16, rot=(math.radians(90), 0, 0)))
    parts.append(cyl('cap', (0, y + out * 0.16, 0), 0.05, 0.05, iron, 12, rot=(math.radians(90), 0, 0)))
    # rayos cónicos (más gruesos en la masa)
    n = 12
    for k in range(n):
        a = 2 * math.pi * k / n
        r0, r1 = 0.08, R - 0.09
        mid = (r0 + r1) / 2
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.028, radius2=0.019, depth=r1 - r0,
                                        location=(math.cos(a) * mid, y, math.sin(a) * mid))
        sp = bpy.context.active_object
        sp.rotation_euler = Vector((math.cos(a), 0, math.sin(a))).to_track_quat('Z', 'Y').to_euler()
        sp.data.materials.append(wood)
        parts.append(sp)
    # pina de madera (sección 7 x 8 cm) y llanta de hierro
    parts.append(ring('felloe', R - 0.052, 0.07, 0.08, y, wood))
    parts.append(ring('tire', R - 0.006, 0.075, 0.012, y, iron, 64))
    # clavos de la llanta
    for k in range(16):
        a = 2 * math.pi * (k + 0.5) / 16
        bpy.ops.mesh.primitive_uv_sphere_add(segments=6, ring_count=4, radius=0.009, location=(math.cos(a) * R, y, math.sin(a) * R))
        nb = bpy.context.active_object; nb.data.materials.append(iron); parts.append(nb)
    return parts


def main():
    reset()
    wood = pbr('cart_wood', 'rough_wood', '1k', rough=0.85, scale=1.6, tint=(0.62, 0.53, 0.45), rot=math.radians(90))
    iron = pbr('cart_iron', 'rusty_metal_02', '1k', rough=0.55, metal=1.0, scale=0.5, tint=(0.5, 0.45, 0.42))
    rnd = random.Random(8)
    parts = []
    zb = R + 0.12       # altura del piso de la caja sobre el eje (con los largueros)
    # largueros y piso de tablones
    for s in (-1, 1):
        parts.append(cube('beam', (0, s * (BW / 2 - 0.08), zb - 0.08), (BL, 0.1, 0.12), wood, 0.012))
    nplank = 7
    for i in range(nplank):
        y = -BW / 2 + (i + 0.5) * BW / nplank
        parts.append(cube(f'floor{i}', (rnd.uniform(-0.01, 0.01), y, zb + 0.01 + rnd.uniform(0, 0.006)), (BL - 0.02, BW / nplank - 0.012, 0.035), wood, 0.006))
    # estacas y barandas (costados), tabla de atrás baja
    for s in (-1, 1):
        for x in (-BL / 2 + 0.08, -0.4, 0.4, BL / 2 - 0.08):
            parts.append(cube('stake', (x, s * (BW / 2 - 0.02), zb + 0.28), (0.06, 0.06, 0.62), wood, 0.008))
        for z in (zb + 0.2, zb + 0.5):
            parts.append(cube('rail', (0, s * (BW / 2 - 0.02), z), (BL - 0.04, 0.035, 0.12), wood, 0.008))
    parts.append(cube('back', (-BL / 2 + 0.02, 0, zb + 0.14), (0.035, BW - 0.06, 0.26), wood, 0.008))
    # eje y ruedas
    parts.append(cyl('axle', (0, 0, 0), 0.05, BW + 0.44, wood, 12, rot=(math.radians(90), 0, 0)))
    for s in (-1, 1):
        parts += wheel(wood, iron, s * (BW / 2 + 0.16))
    # varas: salen de los largueros hacia adelante (+X), un poco convergentes
    for s in (-1, 1):
        y0, y1 = s * (BW / 2 - 0.1), s * 0.38
        x0, x1 = BL / 2 - 0.3, BL / 2 + SH
        mid = Vector(((x0 + x1) / 2, (y0 + y1) / 2, zb - 0.1))
        ln = math.hypot(x1 - x0, y1 - y0)
        ang = math.atan2(y1 - y0, x1 - x0)
        parts.append(cube('shaft', tuple(mid), (ln, 0.07, 0.08), wood, 0.012, rot=(0, 0, ang)))
    # travesaño entre las varas y herrajes
    parts.append(cube('cross', (BL / 2 + 0.2, 0, zb - 0.1), (0.08, 0.95, 0.07), wood, 0.01))
    for s in (-1, 1):
        for x in (-BL / 2 + 0.08, BL / 2 - 0.08):
            parts.append(cube('strap', (x, s * (BW / 2 + 0.005), zb - 0.06), (0.08, 0.012, 0.16), iron, 0.003))
    wood_parts = [p for p in parts if p.data.materials[0] == wood]
    iron_parts = [p for p in parts if p.data.materials[0] == iron]
    for o in parts:
        apply_all(o)
    w = join(wood_parts, 'cart_wood'); box_uv(w, 1.4)
    i = join(iron_parts, 'cart_iron'); box_uv(i, 0.5)
    # inclinar: las puntas de las varas en el piso, las ruedas apoyadas (el eje queda a R del piso)
    tip = BL / 2 + SH
    drop = zb - 0.1 + R - 0.05      # altura de la punta sobre el piso si no se inclina
    tilt = math.atan2(drop, tip)
    for o in (w, i):
        o.matrix_world = Matrix.Translation((0, 0, R)) @ Matrix.Rotation(tilt, 4, 'Y') @ o.matrix_world
        select([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        smooth(o, 35)
    print('inclinación', round(math.degrees(tilt), 1))
    export([w, i], 'cart', tex_res=1024)
    preview(os.path.join(RENDERS, 'cart_prev.png'), (2.8, -4.6, 2.2), (0.9, 0, 0.5), lens=32, w=1000, h=650)


main()
