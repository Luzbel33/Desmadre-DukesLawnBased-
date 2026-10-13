# La cabeza gigante del Infierno (la boca del DJ del Búnker): se recorta del modelo del Diablo ("Demon" de VidovicArts,
# Sketchfab, CC-BY 4.0, ver public/assets/chars/CREDITOS.txt) la cabeza con los cuernos y el cuello, y la mandíbula se
# separa en su propio objeto con el pivote en la articulación (en el juego abre la boca con el bombo).
# Uso: blender -b --factory-startup -P build_hell_head.py -- entrada.glb salida.glb
import bpy, bmesh, sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.data.objects if o.type == 'MESH' and len(o.data.vertices) > 1000)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o is not body: bpy.data.objects.remove(o)

HEAD = {'head', 'head_end', 'eye_l', 'eye_r', 'jaw', 'mouth_l', 'mouth_r', 'neck'}
gi = {g.index: g.name for g in body.vertex_groups}
mw = body.matrix_world.copy()

def weights(v):
    d = {}
    for g in v.groups:
        n = gi.get(g.group)
        if n: d[n] = d.get(n, 0) + g.weight
    return d

me = body.data
keep, jaw = set(), set()
for v in me.vertices:
    w = weights(v)
    hw = sum(w.get(n, 0) for n in HEAD)
    tot = sum(w.values()) or 1
    z = (mw @ v.co).z
    if z > 1.775 and (hw / tot > 0.55 or z > 1.78):  # (nada que cuelgue por debajo del corte del busto)
        keep.add(v.index)
        if w.get('jaw', 0) / tot > 0.5: jaw.add(v.index)

# borrar lo que no es cabeza
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in range(len(bm.verts)) if i not in keep], context='VERTS')
bm.to_mesh(me); bm.free()
# sin esqueleto: la malla queda en la pose de reposo
for m in list(body.modifiers): body.modifiers.remove(m)
body.parent = None
body.matrix_world = mw
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# sacar pedazos sueltos que quedaron del recorte (islas chicas)
bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
seen, drop, islands = set(), [], []
for v in bm.verts:
    if v.index in seen: continue
    isl, stack = [], [v]; seen.add(v.index)
    while stack:
        u = stack.pop(); isl.append(u)
        for e in u.link_edges:
            w = e.other_vert(u)
            if w.index not in seen: seen.add(w.index); stack.append(w)
    # (los dientes y los ojos también son islas chicas: solo se van los pedazos de abajo de la cabeza)
    islands.append(isl)
main = max(islands, key=len)
for isl in islands:
    if isl is not main and max(u.co.z for u in isl) < 1.86: drop.extend(isl)
bmesh.ops.delete(bm, geom=drop, context='VERTS'); bm.to_mesh(body.data); bm.free()
print('ISLANDS_DROPPED', len(drop))
# separar la mandíbula (los vértices que mueve el hueso jaw)
jaw_head = arm.matrix_world @ arm.data.bones['jaw'].head_local
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
jg = body.vertex_groups.get('jaw')
for v in body.data.vertices:
    w = 0.0
    for g in v.groups:
        if jg and g.group == jg.index: w = g.weight
    tot = sum(g.weight for g in v.groups) or 1
    v.select = w / tot > 0.5
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.data.objects if o.type == 'MESH']
jawobj = next(o for o in parts if o is not body)
for o in parts: o.vertex_groups.clear()
body.name = 'demon_head'; jawobj.name = 'jaw'
# pivote de la mandíbula en la articulación
bpy.context.scene.cursor.location = jaw_head
bpy.ops.object.select_all(action='DESELECT'); jawobj.select_set(True); bpy.context.view_layer.objects.active = jawobj
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
jawobj.parent = body
jawobj.matrix_parent_inverse = body.matrix_world.inverted()
bpy.data.objects.remove(arm)

mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
for o in parts:
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        mn = Vector(map(min, mn, p)); mx = Vector(map(max, mx, p))
print('HEADBOX', [round(c, 3) for c in mn], [round(c, 3) for c in mx], 'jaw pivot', [round(c, 3) for c in jaw_head])
print('VERTS', len(body.data.vertices), len(jawobj.data.vertices))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_skins=False, export_animations=False)
