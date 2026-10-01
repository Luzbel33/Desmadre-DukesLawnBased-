"""Gian (playermodel aportado por Luz, base hero.fbx de Gian + cara y capucha): del paquete Gian_Player.glb a lo que
el juego espera de un jugador (como eric/diablo/galleta): UNA malla, UN material con su atlas (color, rugosidad,
normal) y el esqueleto con los nombres del juego.
  1) une las 11 piezas (cuerpo, buzo, cara, cráneo, capucha, cordones, bolsillo...) y saca lo que sobra;
  2) UV nueva de atlas: la cara recibe mucha más superficie (es lo que se mira de cerca);
  3) hornea color, rugosidad y normal de los materiales originales al atlas (Cycles) y deja un material simple;
  4) renombra los huesos al esqueleto del juego (pelvis->hip, chest->spine_02, upper_arm_left->upperarm_l, ...).
Después retarget_human.py (assets/blender/ de la carpeta de trabajo) agrega dedos, punta de pies y puntos de cara:
  blender -b --factory-startup -P build_gian.py -- Gian_Player.glb gian_baked.glb [2048]
"""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, DST = argv[0], argv[1]
RES = int(argv[2]) if len(argv) > 2 else 2048
FACE_BOOST = 3.2  # la cara ocupa ~10 veces más atlas que si se repartiera por área

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
meshes = [o for o in sc.objects if o.type == 'MESH' and (o.parent == arm or any(m.type == 'ARMATURE' for m in o.modifiers))]
for o in list(sc.objects):
    if o.type == 'MESH' and o not in meshes:
        bpy.data.objects.remove(o, do_unlink=True)   # la esfera suelta del paquete
print('piezas', [(o.name, len(o.data.vertices)) for o in meshes])


# El buzo del paquete trae un agujero en la espalda alta (de la nuca a los omóplatos): de atrás se veía el forro
# interno, oscuro. Se tapa con un abanico de triángulos sobre el borde del agujero; el vértice nuevo del centro hereda
# pesos de huesos y UV de su borde (sin pesos, al animar se iría al origen).
def tapar_espalda(o):
    import bmesh
    M = o.matrix_world
    Mi = M.inverted()
    ring = [(0, .023, 1.502), (.064, .021, 1.499), (.128, .022, 1.477), (.125, .106, 1.475), (.089, .177, 1.359),
            (0, .165, 1.366), (-.089, .177, 1.359), (-.125, .106, 1.475), (-.128, .022, 1.477), (-.064, .021, 1.499)]
    bm = bmesh.new(); bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    dl = bm.verts.layers.deform.verify()
    uvl = bm.loops.layers.uv.active
    vs = []
    for p in ring:
        q = Mi @ Vector(p)
        v = min(bm.verts, key=lambda v: (v.co - q).length_squared)
        if (v.co - q).length > 0.004:
            print('ESPALDA: no encontré el borde cerca de', p); bm.free(); return
        vs.append(v)
    # centro algo salido hacia afuera (arriba-atrás): la espalda queda redondeada, no hundida
    cw = sum((M @ v.co for v in vs), Vector()) / len(vs) + Vector((0, .02, .012))
    c = bm.verts.new(Mi @ cw)
    w = {}
    for v in vs:
        for g, x in v[dl].items():
            w[g] = w.get(g, 0) + x / len(vs)
    for g, x in w.items():
        c[dl][g] = x
    uv = lambda v: next(iter(l[uvl].uv.copy() for l in v.link_loops), None) if uvl else None
    cuv = None
    if uvl:
        us = [uv(v) for v in vs if uv(v) is not None]
        cuv = sum(us, Vector((0, 0))) / max(1, len(us))
    out = Vector((0, .7, .7))
    for i in range(len(vs)):
        a, b = vs[i], vs[(i + 1) % len(vs)]
        f = bm.faces.new((a, b, c))
        f.normal_update()
        if (M.to_3x3() @ f.normal).dot(out) < 0:
            f.normal_flip()
        f.smooth = True
        f.material_index = next(iter(l.face.material_index for l in a.link_loops if l.face is not f), 0)
        if uvl:
            for l in f.loops:
                l[uvl].uv = cuv if l.vert is c else (uv(l.vert) or cuv)
    bm.to_mesh(o.data); bm.free(); o.data.update()
    print('espalda tapada en', o.name)


for o in meshes:
    if 'hoodie' in o.name.lower():
        tapar_espalda(o)
# la cara multiplica la foto por un color de vértice: al unir las piezas ese atributo se pierde y la cara sale negra.
# Para el horneado, la foto va directo al color base.
for o in meshes:
    for m in o.data.materials:
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        bl = p.inputs['Base Color'].links if p else []
        if bl and bl[0].from_node.type == 'MIX':
            mix = bl[0].from_node
            img = next((l.from_node for i in mix.inputs for l in i.links if l.from_node.type == 'TEX_IMAGE'), None)
            if img:
                nt.links.remove(bl[0])
                nt.links.new(img.outputs['Color'], p.inputs['Base Color'])
                print('foto directa en', m.name)

# ---------------------------------------------------------------- UV del atlas (por pieza, antes de unir)
for o in meshes:
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    src_uv = me.uv_layers[0]
    src_uv.name = 'src'
    at = me.uv_layers.new(name='atlas')
    me.uv_layers.active = at
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=0.003, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    # tamaño relativo: escala UV ~ tamaño en el mundo (smart_project normaliza cada pieza); la cara, agrandada
    area3 = sum(p.area for p in me.polygons)
    at = me.uv_layers['atlas']   # la referencia vieja queda inválida al salir del modo edición
    uvl = at.data
    a2 = 0.0
    for p in me.polygons:
        pts = [uvl[li].uv for li in p.loop_indices]
        s = 0.0
        for k in range(1, len(pts) - 1):
            a, b, c = pts[0], pts[k], pts[k + 1]
            s += abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2
        a2 += s
    k = math.sqrt(area3 / max(a2, 1e-9))
    if 'face' in o.name.lower():
        k *= FACE_BOOST
    for l in uvl:
        l.uv = l.uv * k
    for p in me.polygons:
        p.select = True
    # la textura original sigue leyéndose de la UV vieja al hornear (UV de render = src)
    me.uv_layers['src'].active_render = True
    me.uv_layers.active = at

# ---------------------------------------------------------------- unir y empaquetar el atlas
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = 'gian'
me = body.data
me.uv_layers.active = me.uv_layers['atlas']
me.uv_layers['src'].active_render = True
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
print('tris', sum(len(p.vertices) - 2 for p in me.polygons), 'materiales', [m.name for m in me.materials])

# ---------------------------------------------------------------- horneado (color, rugosidad, normal) al atlas
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 8
sc.render.bake.margin = 12
imgs = {}
for kind, tag, noncolor in (('DIFFUSE', 'col', False), ('ROUGHNESS', 'rough', True), ('NORMAL', 'nor', True)):
    im = bpy.data.images.new(f'gian_{tag}', RES, RES, alpha=False)
    if noncolor:
        im.colorspace_settings.name = 'Non-Color'
    imgs[tag] = im
    added = []
    for m in me.materials:
        if not m or not m.use_nodes:
            continue
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = im
        m.node_tree.nodes.active = n
        added.append((m, n))
    bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active = body
    if kind == 'DIFFUSE':
        sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = False; sc.render.bake.use_pass_color = True
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=12)
    elif kind == 'ROUGHNESS':
        bpy.ops.object.bake(type='ROUGHNESS', margin=12)
    else:
        bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=12)
    for m, n in added:
        m.node_tree.nodes.remove(n)
    out = os.path.join(os.path.dirname(os.path.abspath(DST)), f'gian_{tag}.png')
    im.filepath_raw = out; im.file_format = 'PNG'; im.save()
    print('horneado', tag)

mat = bpy.data.materials.new('gian'); mat.use_nodes = True
nt = mat.node_tree; p = nt.nodes['Principled BSDF']
t = nt.nodes.new('ShaderNodeTexImage'); t.image = imgs['col']; nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
t = nt.nodes.new('ShaderNodeTexImage'); t.image = imgs['rough']; nt.links.new(t.outputs['Color'], p.inputs['Roughness'])
t = nt.nodes.new('ShaderNodeTexImage'); t.image = imgs['nor']
nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
p.inputs['Metallic'].default_value = 0.0
me.materials.clear(); me.materials.append(mat)
for name in [l.name for l in me.uv_layers if l.name != 'atlas']:
    me.uv_layers.remove(me.uv_layers[name])   # la cara traía dos mapas: queda solo el del atlas (TEXCOORD_0)
me.uv_layers['atlas'].name = 'UVMap'
me.uv_layers[0].active_render = True

# ---------------------------------------------------------------- huesos con los nombres del juego
REN = {
    'pelvis': 'hip', 'spine': 'spine_01', 'chest': 'spine_02', 'neck': 'neck', 'head': 'head', 'head_end': 'head_end',
    'shoulder_left': 'shoulder_l', 'upper_arm_left': 'upperarm_l', 'forearm_left': 'lowerarm_l', 'hand_left': 'hand_l',
    'shoulder_right': 'shoulder_r', 'upper_arm_right': 'upperarm_r', 'forearm_right': 'lowerarm_r', 'hand_right': 'hand_r',
    'thumb.01.L': 'thumb_01_l', 'thumb.02.L': 'thumb_02_l', 'thumb.02.L_end': 'thumb_03_l',
    'thumb.01.R': 'thumb_01_r', 'thumb.02.R': 'thumb_02_r', 'thumb.02.R_end': 'thumb_03_r',
    'f_middle.01.L': 'middle_01_l', 'f_middle.01.L_end': 'middle_02_l',
    'f_middle.01.R': 'middle_01_r', 'f_middle.01.R_end': 'middle_02_r',
    'thigh_left': 'upperleg_l', 'shin.L': 'lowerleg_l', 'foot_left': 'foot_l', 'foot_left_end': 'ball_l',
    'thigh_right': 'upperleg_r', 'shin.R': 'lowerleg_r', 'foot_right': 'foot_r', 'foot_right_end': 'ball_r',
}
for old, new in REN.items():
    if old in arm.data.bones:
        arm.data.bones[old].name = new
print('huesos', sorted(b.name for b in arm.data.bones))

# ---------------------------------------------------------------- exportar (sin animaciones: el juego anima por código)
for o in list(sc.objects):
    if o not in (arm, body) and o.type != 'EMPTY':
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); body.select_set(True)
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', use_selection=True, export_yup=True, export_skins=True,
                          export_animations=False, export_morph=False, export_image_format='JPEG', export_jpeg_quality=90)
print('ok', DST)
