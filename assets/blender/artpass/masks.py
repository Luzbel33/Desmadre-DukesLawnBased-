"""Máscaras de animales para las chicas del club (fiesta de élite): cabezas esculpidas CC0 de Poly Haven (toro de
bronce con cuernos dorados, caballo de porcelana, león de oro, gato de laca negra) y un conejo de porcelana (el gato
con las orejas largas). Se corta el pedestal y el busto bajo el cuello (con tapa), se reduce y se reviste.
  blender -b --factory-startup -P masks.py -- bull horse lion cat rabbit
Salida: public/assets/props/art/mask_<k>.glb. Origen = centro de la cabeza de quien la usa (el juego la pega ahí,
ver HumanCharacter.wearMask); +Z del juego = hacia adelante (el hocico). Tamaño para una cabeza de radio 0.105 m.
Las vistas de control (con una esfera del tamaño de la cabeza) quedan en assets/art-source/renders/mask_<k>_*.png.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *
import bmesh

RENDERS = os.path.join(SRC, 'renders')
HEAD_R = 0.105
# modelo de Poly Haven, altura del corte (m, en el modelo), centro de la cabeza (ancla), escala, estilo, tris
MASKS = {
    'bull': dict(src='bull_head', cut=0.13, anchor=(0, 0.02, 0.29), scale=1.4, style='keep', tris=12000),
    'horse': dict(src='horse_head', cut=0.12, anchor=(0, -0.01, 0.325), scale=1.5, style='porcelain', tris=11000),
    # el león es un relieve (la melena atrás es plana): va adelante de la cara con una capucha de terciopelo atrás
    'lion': dict(src='lion_head', cut=0.075, anchor=(0, 0.06, 0.265), scale=1.35, style='gold', tris=14000, hood=(0, 0.045, 0.0, 0.125)),
    'cat': dict(src='concrete_cat_statue', cut=0.175, anchor=(0, -0.045, 0.23), scale=3.0, style='lacquer', tris=9000),
    'rabbit': dict(src='concrete_cat_statue', cut=0.175, anchor=(0, -0.045, 0.23), scale=3.0, style='rabbit', tris=9000),
}
STYLES = {
    # color base (None = el de la textura), metálico, rugosidad (None = la de la textura)
    'keep': (None, None, None),
    'porcelain': ((0.93, 0.91, 0.87), 0.0, 0.2),
    'gold': ((1.0, 0.74, 0.32), 1.0, 0.3),
    'lacquer': ((0.018, 0.016, 0.02), 0.0, 0.14),
    'rabbit': ((0.96, 0.93, 0.93), 0.0, 0.24),
}


def restyle(o, style):
    col, metal, rough = STYLES[style]
    for s in o.material_slots:
        m = s.material
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not p:
            continue
        if col is not None:
            for l in list(p.inputs['Base Color'].links):
                nt.links.remove(l)
            p.inputs['Base Color'].default_value = (*col, 1)
        if metal is not None:
            for l in list(p.inputs['Metallic'].links):
                nt.links.remove(l)
            p.inputs['Metallic'].default_value = metal
        if rough is not None:
            for l in list(p.inputs['Roughness'].links):
                nt.links.remove(l)
            p.inputs['Roughness'].default_value = rough


def cut_below(o, z):
    """Borra lo que queda debajo de z (pedestal y busto) y tapa el corte."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True)
    edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if edges:
        try:
            bmesh.ops.holes_fill(bm, edges=edges, sides=0)
        except Exception as e:
            print('tapa', e)
    bm.to_mesh(o.data); bm.free()
    o.data.update()


def rabbit_ears(o):
    """Orejas de conejo: lo que está arriba de la base de las orejas del gato se estira hacia arriba y un poco atrás."""
    me = o.data
    zs = [v.co.z for v in me.vertices]
    ztop = max(zs)
    zear = ztop - 0.03
    for v in me.vertices:
        z = v.co.z
        w = min(1.0, max(0.0, (z - (zear - 0.006)) / 0.016))
        w = w * w * (3 - 2 * w)
        if w <= 0:
            continue
        d = z - zear
        v.co.z = z + w * max(0.0, d) * 2.4
        v.co.y = v.co.y + w * max(0.0, d) * 0.9
        v.co.x = v.co.x * (1 - 0.12 * w)
    me.update()


def build(key):
    P = MASKS[key]
    reset()
    path = ph_model(P['src'], '1k')
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    o = join(objs, 'mask_' + key) if len(objs) > 1 else objs[0]
    o.name = 'mask_' + key
    select([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    cut_below(o, P['cut'])
    if key == 'rabbit':
        rabbit_ears(o)
    t0 = tris(o)
    if t0 > P['tris']:
        md = o.modifiers.new('dec', 'DECIMATE'); md.ratio = P['tris'] / t0; md.use_collapse_triangulate = True
        select([o]); bpy.ops.object.modifier_apply(modifier='dec')
    # ancla -> origen y escala de uso
    ax, ay, az = P['anchor']
    for v in o.data.vertices:
        v.co = (v.co - Vector((ax, ay, az))) * P['scale']
    o.data.update()
    restyle(o, P['style'])
    smooth(o, 50)
    if P.get('hood'):
        # capucha de terciopelo negro que cubre la nuca (atrás de la máscara)
        hx, hy, hz, hr = P['hood']
        bpy.ops.mesh.primitive_uv_sphere_add(radius=hr, location=(hx, hy, hz), segments=32, ring_count=16)
        hd = bpy.context.active_object
        hd.scale = (1.0, 1.08, 1.12)
        select([hd]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        vel = pbr('mask_velvet', 'velour_velvet', '1k', rough=0.95, scale=0.25, tint=(0.05, 0.02, 0.025))
        hd.data.materials.append(vel)
        box_uv(hd, 0.25)
        smooth(hd, 60)
        o = join([o, hd], 'mask_' + key)
    print('MASK', key, 'tris', t0, '->', tris(o), 'dims', [round(d, 3) for d in o.dimensions])
    # esfera de control: la cabeza de quien la usa (no se exporta)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=HEAD_R, location=(0, 0, 0), segments=24, ring_count=12)
    head = bpy.context.active_object
    hm = bpy.data.materials.new('head'); hm.use_nodes = True
    hm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.2, 0.2, 1)
    head.data.materials.append(hm)
    for tag, cam in (('front', (0, -1.3, 0.05)), ('side', (1.3, 0, 0.05)), ('back', (0.6, 1.1, 0.3))):
        preview(os.path.join(RENDERS, f'mask_{key}_{tag}.png'), cam, (0, 0, 0), lens=50, w=420, h=420, samples=8)
    bpy.data.objects.remove(head)
    export([o], 'mask_' + key, tex_res=1024)


def main():
    for k in (args() or list(MASKS)):
        build(k)


main()
