import bpy, json, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/blender-polish'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene; scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=900;scene.render.resolution_y=480;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.33,.36,.41,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
for kind,x in [('jack',-1.4),('pumpkin',0),('brazier',1.55)]:
    before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/assets/props/polish'/f'{kind}.glb'))
    for o in set(scene.objects)-before:
        if o.parent is None:o.location.x+=x
    for o in set(scene.objects)-before:
        if o.type=='MESH':o.rotation_euler.z=0
bpy.ops.mesh.primitive_plane_add(size=200)
mat=bpy.data.materials.new('Matte floor');mat.diffuse_color=(.15,.17,.18,1)
bpy.context.object.data.materials.append(mat);bpy.context.object.location.z=-.003
for loc,power,size in [((-2,-3,5),750,4),((3,2,4),600,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(Vector((0,0,.3))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.5,-6,3.4));cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.3))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=5.2;scene.camera=cam
scene.render.filepath=str(OUT/'props-preview.png');bpy.ops.render.render(write_still=True)
# Inspect source gate ownership and single-variant plant bounds without altering source assets.
bpy.ops.wm.read_factory_settings(use_empty=True)
records=[]
for path in [ROOT/'public/assets/props/large_iron_gate.glb']+[ROOT/'public/assets/props/polish'/f'{n}.glb' for n in ['fern_02','periwinkle_plant','rock_moss_set_01']]:
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path))
    records.append({'file':path.name,'meshes':[{'name':o.name,'vertices':len(o.data.vertices),'bounds':[[round(v,3) for v in o.matrix_world@Vector(c)] for c in o.bound_box]} for o in bpy.context.scene.objects if o.type=='MESH']})
(OUT/'bounds.json').write_text(json.dumps(records,indent=2))
