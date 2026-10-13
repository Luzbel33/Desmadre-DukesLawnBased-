# Inspección del modelo del Diablo: huesos, mallas y medidas (para recortar la cabeza del Infierno)
import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[sys.argv.index('--') + 1])
for o in bpy.data.objects:
    print('OBJ', o.type, o.name, [round(v, 3) for v in o.dimensions])
    if o.type == 'ARMATURE':
        for b in o.data.bones:
            print('  BONE', b.name, [round(v, 3) for v in b.head_local], [round(v, 3) for v in b.tail_local])
    if o.type == 'MESH':
        print('  verts', len(o.data.vertices), 'groups', [g.name for g in o.vertex_groups][:60], 'mats', [m.name for m in o.data.materials])
