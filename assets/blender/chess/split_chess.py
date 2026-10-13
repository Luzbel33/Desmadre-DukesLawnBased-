# Separa chess_set.glb (tablero + piezas fundidas, en cientos de fragmentos) en piezas sueltas para el ajedrez
# jugable: agrupa las caras por casilla (la posición inicial dice qué pieza es) y exporta una de cada tipo y color,
# con el origen en el centro de la base, más el tablero con el origen en el centro de su cara de juego.
# Uso: blender -b --factory-startup -P split_chess.py -- <in.glb> <out.glb>
import bpy, bmesh, sys
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:]
src, dst = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = obj; obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = obj.data
S = 0.0553
mats = [m.name for m in me.materials]
print('mats', mats)
groups = {}  # key -> list of face indices
for f in me.polygons:
    m = mats[f.material_index]
    if 'board' in m: key = 'board'
    else:
        c = f.center
        col = int(round(c.x / S + 3.5)); row = int(round(-c.y / S + 3.5))
        key = ('w' if 'white' in m else 'b', max(0, min(7, col)), max(0, min(7, row)))
    groups.setdefault(key, []).append(f.index)
def height(k):
    zs = [me.vertices[v].co.z for fi in groups[k] for v in me.polygons[fi].vertices]
    return max(zs) - min(zs)
print('squares', sorted((k for k in groups if k != 'board'), key=str)[:40])
pick = {'board': 'board'}
for color, back, front in (('w', 0, 1), ('b', 7, 6)):
    pick[(color, 4, front)] = color + '_p'
    pick[(color, 0, back)] = color + '_r'
    pick[(color, 1, back)] = color + '_n'
    pick[(color, 2, back)] = color + '_b'
    a, b = (color, 3, back), (color, 4, back)
    hi, lo = (a, b) if height(a) > height(b) else (b, a)
    pick[hi] = color + '_k'; pick[lo] = color + '_q'
    print(color, 'king col', hi[1], 'h', round(height(hi), 3), 'queen h', round(height(lo), 3))
out = []
for key, name in pick.items():
    faces = set(groups[key])
    bm = bmesh.new(); bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in faces], context='FACES')
    nm = bpy.data.meshes.new(name); bm.to_mesh(nm); bm.free()
    for m in me.materials: nm.materials.append(m)
    o = bpy.data.objects.new(name, nm); bpy.context.scene.collection.objects.link(o)
    vs = [v.co for v in nm.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    base = Vector((0, 0, hi.z)) if name == 'board' else Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for v in nm.vertices: v.co -= base
    # los materiales que no usa, afuera
    used = {p.material_index for p in nm.polygons}
    out.append((name, len(nm.polygons), [round(x, 3) for x in (hi - lo)]))
    for i in sorted(range(len(nm.materials)), reverse=True):
        if i not in used: nm.materials.pop(index=i)
bpy.data.objects.remove(obj, do_unlink=True)
for r in out: print(r)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_yup=True, export_apply=True)
