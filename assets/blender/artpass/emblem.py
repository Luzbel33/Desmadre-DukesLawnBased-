"""Emblema del estandarte: calavera y fémures cruzados de verdad (esqueleto CC0 de "Human Base Meshes", Blender Studio)
y el lema en letra gótica (UnifrakturMaguntia, OFL). Se renderiza de frente, sombreado suave, con fondo transparente:
banner.py lo convierte en bordado dorado.
  blender -b --factory-startup -P emblem.py
Salida: assets/art-source/renders/emblem.png (1024 x 1400)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *

BUNDLE = os.path.join(SRC, 'human-base-meshes-bundle-v1.4.1', 'human_base_meshes_bundle.blend')
FONT = os.path.join(SRC, 'fonts', 'UnifrakturMaguntia-Book.ttf')
RENDERS = os.path.join(SRC, 'renders')
os.makedirs(RENDERS, exist_ok=True)


def append(names):
    with bpy.data.libraries.load(BUNDLE, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in names]
    out = []
    for o in dst.objects:
        if o is None:
            continue
        bpy.context.scene.collection.objects.link(o)
        o.parent = None
        out.append(o)
    return out


def main():
    sc = reset()
    objs = append(['GEO-skeletion.skull', 'GEO-skeletion.leg_femur.L', 'GEO-skeletion.leg_femur.R'])
    names = [o.name for o in objs]
    print('objetos', names)
    skull = [o for o in objs if 'skull' in o.name][0]
    fem = [o for o in objs if 'femur' in o.name]
    # la calavera centrada en el origen, mirando a -Y (la cámara está en -Y)
    bpy.context.view_layer.update()
    def center(o):
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        return sum(bb, Vector()) / 8
    c0 = center(skull)
    for o in objs:
        o.matrix_world = Matrix.Translation(-c0) @ o.matrix_world
    bpy.context.view_layer.update()
    # fémures cruzados detrás de la calavera
    for i, f in enumerate(fem):
        cf = center(f)
        f.matrix_world = Matrix.Translation(Vector((0, 0.09, -0.02))) @ Matrix.Rotation((1 if i else -1) * math.radians(48), 4, 'Y') @ Matrix.Translation(-cf) @ f.matrix_world
    # material blanco mate
    m = bpy.data.materials.new('hueso'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.9, 0.9, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    for o in objs:
        o.data.materials.clear(); o.data.materials.append(m)
        for md in o.modifiers:
            if md.type == 'SUBSURF':
                md.levels = 2; md.render_levels = 2
            if md.type == 'MULTIRES':
                md.levels = 2; md.render_levels = 2
    # lema en letra gótica
    bpy.ops.object.text_add(location=(0, -0.05, -0.36), rotation=(math.radians(90), 0, 0))
    t = bpy.context.active_object
    t.data.body = 'Memento Mori'
    t.data.font = bpy.data.fonts.load(FONT)
    t.data.align_x = 'CENTER'
    t.data.size = 0.085
    t.data.extrude = 0.006
    t.data.bevel_depth = 0.002
    t.data.materials.append(m)
    # cámara ortográfica de frente
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 0.84
    cam.location = (0, -2, -0.07)
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam
    # luz: arriba a la izquierda, suave (el relieve del bordado)
    for loc, e, size in [((-1.2, -1.5, 1.4), 38, 1.2), ((1.4, -1.2, 0.2), 9, 2.0)]:
        ld = bpy.data.lights.new('l', 'AREA'); ld.energy = e; ld.size = size
        lo = bpy.data.objects.new('l', ld); sc.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, -0.07)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.12
    sc.world = w
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = 1024, 1400
    sc.cycles.samples = 64
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.filepath = os.path.join(RENDERS, 'emblem.png')
    bpy.ops.render.render(write_still=True)
    print('EMBLEM_OK', sc.render.filepath)


main()
