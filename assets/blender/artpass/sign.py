"""Cartel del portón: tablones viejos con "Castillo del Terror" tallado en letra gótica (UnifrakturMaguntia, OFL),
restos de pintura roja en el fondo de las letras, flejes clavados y colgado de dos cadenas desde argollas en la pared.
La talla se hornea (color, rugosidad y normal) sobre un tablero de pocos polígonos: se ve tallado y pesa poco.
  blender -b --factory-startup -P sign.py
Salida: public/assets/props/art/gate_sign.glb (origen: altura de las argollas, contra la pared en y = 0;
el cartel cuelga hacia -z; frente del modelo = -Y de Blender = +Z del juego)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *

FONT = os.path.join(SRC, 'fonts', 'UnifrakturMaguntia-Book.ttf')
RENDERS = os.path.join(SRC, 'renders')
BW, BH, BT = 3.1, 0.82, 0.075      # tablero: ancho, alto, espesor
DROP = 0.55                        # largo de las cadenas
Y0 = -0.09                         # el tablero queda separado de la pared
MASK = os.path.join(RENDERS, 'sign_mask.png')


def chain(p0, p1, iron, link=0.055):
    d = Vector(p1) - Vector(p0)
    n = max(2, int(d.length / (link * 0.72)))
    parts = []
    rot = d.to_track_quat('Z', 'Y')
    for i in range(n):
        c = Vector(p0) + d * ((i + 0.5) / n)
        bpy.ops.mesh.primitive_torus_add(major_radius=link * 0.5, minor_radius=0.0065, major_segments=10, minor_segments=5, location=c)
        tor = bpy.context.active_object
        tor.scale = (0.62, 1.0, 1.0)
        tor.rotation_mode = 'QUATERNION'
        tor.rotation_quaternion = rot @ Euler((math.radians(90), 0, math.radians(90) * (i % 2)), 'XYZ').to_quaternion()
        tor.data.materials.append(iron)
        parts.append(tor)
    return parts


def board_material(zc):
    """Madera de Poly Haven + talla (máscara del texto): fondo pintado de rojo, bordes que se hunden."""
    m = pbr('sign_wood', 'rough_wood', '1k', rough=0.85, scale=1.6, tint=(0.62, 0.52, 0.44))
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    # coordenadas del frente del cartel (0..1) a partir de las del objeto
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
    u = nt.nodes.new('ShaderNodeMath'); u.operation = 'MULTIPLY_ADD'; u.inputs[1].default_value = 1 / BW; u.inputs[2].default_value = 0.5
    nt.links.new(sep.outputs['X'], u.inputs[0])
    v = nt.nodes.new('ShaderNodeMath'); v.operation = 'MULTIPLY_ADD'; v.inputs[1].default_value = 1 / BH; v.inputs[2].default_value = 0.5 - zc / BH
    nt.links.new(sep.outputs['Z'], v.inputs[0])
    cmb = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(u.outputs[0], cmb.inputs['X']); nt.links.new(v.outputs[0], cmb.inputs['Y'])
    mt = nt.nodes.new('ShaderNodeTexImage'); mt.image = img(MASK, True); mt.extension = 'CLIP'
    nt.links.new(cmb.outputs['Vector'], mt.inputs['Vector'])
    # solo el frente (normal hacia -Y) lleva talla
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    nsep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Normal'], nsep.inputs['Vector'])
    front = nt.nodes.new('ShaderNodeMath'); front.operation = 'LESS_THAN'; front.inputs[1].default_value = -0.7
    nt.links.new(nsep.outputs['Y'], front.inputs[0])
    mk = nt.nodes.new('ShaderNodeMath'); mk.operation = 'MULTIPLY'
    nt.links.new(mt.outputs['Color'], mk.inputs[0]); nt.links.new(front.outputs[0], mk.inputs[1])
    # color: la pintura roja vieja adentro de las letras (mezclada con la madera, gastada)
    base_link = p.inputs['Base Color'].links[0]
    wood_out = base_link.from_socket
    paint = nt.nodes.new('ShaderNodeMix'); paint.data_type = 'RGBA'; paint.blend_type = 'MULTIPLY'
    paint.inputs['B'].default_value = (0.42, 0.05, 0.04, 1)
    nt.links.new(wood_out, paint.inputs['A'])
    k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY'; k.inputs[1].default_value = 0.92
    nt.links.new(mk.outputs[0], k.inputs[0])
    nt.links.new(k.outputs[0], paint.inputs['Factor'])
    nt.links.new(paint.outputs['Result'], p.inputs['Base Color'])
    # relieve: la letra se hunde (bump invertido) sobre el normal de la madera
    bump = nt.nodes.new('ShaderNodeBump'); bump.invert = True
    bump.inputs['Strength'].default_value = 1.0; bump.inputs['Distance'].default_value = 0.012
    nt.links.new(mk.outputs[0], bump.inputs['Height'])
    nlinks = p.inputs['Normal'].links
    if nlinks:
        nt.links.new(nlinks[0].from_socket, bump.inputs['Normal'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    return m


def main():
    # 1) máscara del texto encuadrada en el frente del tablero (se desenfoca un poco: bisel de la talla)
    render_text_mask('Castillo del Terror', FONT, MASK, BW, BH, 2048, 0.33, y_off=-0.02)
    reset()
    iron = pbr('iron', 'rusty_metal_02', '1k', rough=0.55, metal=1.0, scale=0.4)
    zc = -DROP - BH / 2
    planks = []
    ph = BH / 3
    rnd = random.Random(4)
    for k in range(3):
        z = zc + BH / 2 - ph * (k + 0.5)
        o = cube(f'plank{k}', (rnd.uniform(-0.01, 0.01), Y0 - BT / 2 + rnd.uniform(-0.004, 0.004), z), (BW + rnd.uniform(-0.03, 0.02), BT, ph - 0.012), None, 0.012)
        apply_all(o)
        planks.append(o)
    board = join(planks, 'board')
    select([board]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    board.data.materials.append(board_material(zc))
    # UV sin solapes para hornear; la madera usa sus propias coordenadas (caja en metros) vía la UV 'box'
    me = board.data
    box = me.uv_layers.new(name='box')
    me.uv_layers.active = box
    box_uv(board, 1.2)
    bake_uv = me.uv_layers.new(name='bake')
    me.uv_layers.active = bake_uv
    select([board]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')
    # la madera lee la UV 'box' (el nodo de coordenadas UV toma la activa para render: la fijamos por nombre)
    for n in board.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_COORD':
            pass
    mt = board.data.materials[0].node_tree
    for n in mt.nodes:
        if n.type == 'MAPPING':
            uvn = mt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'box'
            mt.links.new(uvn.outputs['UV'], n.inputs['Vector'])
            n.inputs['Rotation'].default_value = (0, 0, math.radians(90))   # vetas a lo largo de los tablones
    bake_textures(board, 'gate_sign', res=2048, samples=4)
    # quedan solo las UV del horneado (el exportador usa la primera)
    for name in [l.name for l in me.uv_layers if l.name != 'bake']:
        me.uv_layers.remove(me.uv_layers[name])
    me.uv_layers['bake'].name = 'UVMap'
    me.uv_layers.active = me.uv_layers[0]
    me.uv_layers[0].active_render = True
    # herrajes
    parts = []
    for s in (-1, 1):
        x = s * (BW / 2 - 0.16)
        parts.append(cube('strap', (x, Y0 - BT - 0.004, zc), (0.07, 0.008, BH + 0.02), iron, 0.003))
        parts.append(cube('strapTop', (x, Y0 - BT / 2, zc + BH / 2 + 0.004), (0.07, BT + 0.016, 0.008), iron, 0.003))
        for zz in (zc + BH * 0.33, zc - BH * 0.33):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=5, radius=0.014, location=(x, Y0 - BT - 0.009, zz))
            nail = bpy.context.active_object; nail.scale = (1, 0.5, 1); nail.data.materials.append(iron); parts.append(nail)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.035, minor_radius=0.008, location=(x, Y0 - BT / 2, zc + BH / 2 + 0.045), rotation=(0, math.radians(90), 0))
        r1 = bpy.context.active_object; r1.data.materials.append(iron); parts.append(r1)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.04, minor_radius=0.01, location=(x, -0.045, 0.0), rotation=(0, math.radians(90), 0))
        r2 = bpy.context.active_object; r2.data.materials.append(iron); parts.append(r2)
        parts.append(cube('pin', (x, -0.02, 0.0), (0.03, 0.05, 0.03), iron, 0.004))
        parts += chain((x, -0.045, -0.035), (x, Y0 - BT / 2, zc + BH / 2 + 0.08), iron)
    iron_o = join(parts, 'sign_iron')
    smooth(iron_o, 35)
    box_uv(iron_o, 0.4)
    export([board, iron_o], 'gate_sign', tex_res=2048)
    preview(os.path.join(RENDERS, 'sign_prev.png'), (0.5, -5.5, -0.9), (0, -0.1, -1.0), lens=50, w=1100, h=500)
    preview(os.path.join(RENDERS, 'sign_prev2.png'), (3.2, -3.0, -0.6), (0, -0.1, -1.0), lens=50, w=1100, h=500)


main()
