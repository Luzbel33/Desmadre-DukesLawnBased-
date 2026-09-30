"""El Diablo: los dientes de abajo estaban pesados a la cabeza (al abrir la boca quedaban flotando arriba).
Busca las islas de malla de los dientes inferiores (adelante de la cara, debajo de la línea de la boca, sin peso de
mandíbula) y las pasa enteras al hueso 'jaw'. Reexporta public/assets/chars/diablo.glb.
  python assets/blender/demon/fix_teeth.py   (bpy 4.2)
"""
import bpy, bmesh, os
SRC = os.environ.get('DIABLO_SRC', 'public/assets/chars/diablo.glb')
OUT = 'public/assets/chars/diablo.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
me = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and 'jaw' in o.vertex_groups)
jaw = me.vertex_groups['jaw']
bm = bmesh.new(); bm.from_mesh(me.data); bm.verts.ensure_lookup_table()
seen, islands = set(), []
for v in bm.verts:
    if v.index in seen: continue
    stack, comp = [v], []
    seen.add(v.index)
    while stack:
        x = stack.pop(); comp.append(x.index)
        for e in x.link_edges:
            o = e.other_vert(x)
            if o.index not in seen: seen.add(o.index); stack.append(o)
    islands.append(comp)
M = me.matrix_world
moved = 0
for comp in islands:
    if len(comp) > 60: continue
    cos = [M @ me.data.vertices[i].co for i in comp]
    cx = sum(c.x for c in cos) / len(cos); cy = sum(c.y for c in cos) / len(cos); cz = sum(c.z for c in cos) / len(cos)
    if abs(cx) < 0.12 and cy < -0.2 and 1.85 < cz < 2.0:
        for i in comp:
            v = me.data.vertices[i]
            for g in list(v.groups):
                me.vertex_groups[g.group].remove([i])
            jaw.add([i], 1.0, 'REPLACE')
        moved += 1
print('islas de dientes pasadas a la mandibula:', moved)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_skins=True, export_animations=False,
                          export_apply=False, export_image_format='AUTO', export_materials='EXPORT', export_morph=True)
print('ok', os.path.getsize(OUT) // 1024, 'KB')
