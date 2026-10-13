# Aligera props pesados sin tocar su aspecto de cerca: Decimate (collapse) hasta una cantidad objetivo de triángulos,
# conservando UV, normales y materiales. Los personajes NO pasan por acá (se dejan como están).
# Uso: blender -b --factory-startup -P decimate.py -- <archivo.glb> <triangulos objetivo> [salida.glb]
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
src, target = a[0], int(a[1]); dst = a[2] if len(a) > 2 else src
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
total = sum(tris(o) for o in meshes)
ratio = min(1.0, target / max(1, total))
print('antes', total, 'ratio', round(ratio, 3))
if ratio < 0.98:
    for o in meshes:
        if tris(o) < 300: continue  # lo chico se deja
        bpy.context.view_layer.objects.active = o
        for s in list(o.modifiers): o.modifiers.remove(s)
        m = o.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio; m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='dec')
print('despues', sum(tris(o) for o in meshes))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_yup=True, export_apply=True)
