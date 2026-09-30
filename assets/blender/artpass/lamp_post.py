"""Farol de camino: base de piedra, poste de hierro forjado con collarín, brazo con voluta y el farol de madera de Poly
Haven (wooden_lantern_01, CC0) colgado de un gancho. Un nodo vacío "flame" marca dónde va la llama (el juego pone
ahí el fuego y la luz) y otro "glass" no hace falta: el vidrio del farol se reconoce por su material.
  blender -b --factory-startup -P lamp_post.py
Salida: public/assets/props/art/lamp_post.glb (origen al pie del poste; el brazo apunta a +X de Blender = +X del juego)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *

RENDERS = os.path.join(SRC, 'renders')
LANTERN = os.path.join(REPO, 'public', 'assets', 'props', 'wooden_lantern_01.glb')
H = 2.75          # alto del poste
ARM = 0.62        # largo del brazo
LS = 1.25         # escala del farol


def scroll(iron, x0, z0, r0, turns=1.6, thick=0.012, name='scroll'):
    """Voluta de hierro plano (espiral) en el plano XZ."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('POLY')
    n = 60
    sp.points.add(n - 1)
    for i in range(n):
        t = i / (n - 1)
        a = t * turns * 2 * math.pi
        r = r0 * (1 - 0.8 * t)
        sp.points[i].co = (x0 + r * math.cos(a), 0, z0 + r * math.sin(a), 1)
    cu.bevel_depth = thick; cu.bevel_resolution = 1
    o = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(o)
    select([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    o.scale = (1, 2.2, 1)  # fleje: más ancho que grueso
    apply_all(o)
    o.data.materials.append(iron)
    return o


def main():
    reset()
    iron = pbr('iron', 'rusty_metal_02', '1k', rough=0.5, metal=1.0, scale=0.35, tint=(0.35, 0.33, 0.32))
    stone = pbr('stone', 'stone_wall_04', '1k', rough=0.9, scale=1.2, tint=(0.72, 0.72, 0.7))
    parts = []
    # base de piedra con chanfle
    base = cube('base', (0, 0, 0.14), (0.44, 0.44, 0.28), stone, 0.03)
    cap = cube('cap', (0, 0, 0.31), (0.34, 0.34, 0.06), stone, 0.015)
    for o in (base, cap):
        apply_all(o); box_uv(o, 0.9)
    stone_o = join([base, cap], 'lamp_base')
    # poste: cuadrado, con collarines y una punta
    parts.append(cube('post', (0, 0, 0.34 + H / 2), (0.065, 0.065, H), iron, 0.006))
    for z in (0.42, 1.2, H + 0.2):
        parts.append(cube('collar', (0, 0, z), (0.1, 0.1, 0.05), iron, 0.008))
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.06, radius2=0.0, depth=0.22, location=(0, 0, H + 0.45), rotation=(0, 0, math.radians(45)))
    tip = bpy.context.active_object; tip.data.materials.append(iron); parts.append(tip)
    # brazo con tornapuntas curvo y voluta
    za = H + 0.18
    parts.append(cube('arm', (ARM / 2, 0, za), (ARM + 0.04, 0.04, 0.045), iron, 0.005))
    parts.append(scroll(iron, 0.2, za - 0.2, 0.17, turns=1.3, name='s1'))
    parts.append(scroll(iron, 0.44, za - 0.08, 0.075, turns=1.5, name='s2'))
    # tornapuntas diagonal
    br = cube('brace', (0.2, 0, za - 0.2), (0.03, 0.025, 0.5), iron, 0.004, rot=(0, math.radians(52), 0))
    parts.append(br)
    # gancho al final del brazo
    bpy.ops.mesh.primitive_torus_add(major_radius=0.03, minor_radius=0.007, location=(ARM - 0.03, 0, za - 0.05), rotation=(math.radians(90), 0, 0))
    hook = bpy.context.active_object; hook.data.materials.append(iron); parts.append(hook)
    post = join(parts, 'lamp_post')
    smooth(post, 35)
    box_uv(post, 0.35)
    # el farol de madera colgado del gancho
    bpy.ops.import_scene.gltf(filepath=LANTERN)
    lan = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    for o in lan:
        o.select_set(True)
    root = [o for o in bpy.context.selected_objects if o.parent is None]
    # medir el farol importado
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in lan for c in o.bound_box]
    top = max(p.z for p in pts); bot = min(p.z for p in pts)
    cx = (max(p.x for p in pts) + min(p.x for p in pts)) / 2; cy = (max(p.y for p in pts) + min(p.y for p in pts)) / 2
    height = (top - bot) * LS
    emp = bpy.data.objects.new('lantern_pivot', None); bpy.context.scene.collection.objects.link(emp)
    for o in root:
        o.parent = emp
        o.matrix_parent_inverse = Matrix.Translation((-cx, -cy, -top))
    emp.scale = (LS, LS, LS)
    emp.location = (ARM - 0.03, 0, za - 0.08)
    bpy.context.view_layer.update()
    lan_objs = []
    for o in lan:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        select([o]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        lan_objs.append(o)
    bpy.data.objects.remove(emp, do_unlink=True)
    # nodo "flame": a un tercio del alto del farol desde abajo (donde está la vela)
    fz = za - 0.08 - height * 0.62
    fl = bpy.data.objects.new('flame', None); bpy.context.scene.collection.objects.link(fl)
    fl.location = (ARM - 0.03, 0, fz)
    print('farol alto', round(height, 3), 'llama z', round(fz, 3), 'fondo', round(za - 0.08 - height, 3))
    export([stone_o, post] + lan_objs + [fl], 'lamp_post', tex_res=512)
    preview(os.path.join(RENDERS, 'lamp_prev.png'), (1.6, -3.4, 1.9), (0.25, 0, 1.7), lens=40, w=700, h=900)


main()
