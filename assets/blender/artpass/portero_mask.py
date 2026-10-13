"""Author the doorman's pig mask without modifying any character or club dancer.

Run in an isolated Blender process:
  blender -b --factory-startup -P assets/blender/artpass/portero_mask.py
The origin matches HumanCharacter's 0.105 m head anchor. Blender -Y is glTF +Z.
"""
import bpy
import bmesh
import math
import sys
import tempfile
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'output/portero-mask'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'tmp').mkdir(exist_ok=True)
tempfile.tempdir = str(OUT / 'tmp')
DEST = ROOT / 'public/assets/props/art/mask_pig.glb'


def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def ellipsoid(name, location, scale, segments=48):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(12, segments * 2 // 3), location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    active(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def join(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    return obj


def smooth(obj, iterations=6, factor=.45):
    active(obj)
    md = obj.modifiers.new('Sculpt smoothing', 'SMOOTH')
    md.factor = factor
    md.iterations = iterations
    bpy.ops.object.modifier_apply(modifier=md.name)


def cut(obj, cutter):
    active(obj)
    md = obj.modifiers.new('Recessed sculpt', 'BOOLEAN')
    md.operation = 'DIFFERENCE'
    md.solver = 'EXACT'
    md.object = cutter
    bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def curve(name, coords, radius, mat=None):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 16
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(coords) - 1)
    for point, co in zip(spline.bezier_points, coords):
        point.co = co
        point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    active(obj)
    bpy.ops.object.convert(target='MESH')
    if mat:
        obj.data.materials.append(mat)
    return obj


def material(name, base, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*base, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    return mat, nodes, links, bsdf


def skin_material():
    mat, nodes, links, bsdf = material('Aged warm latex', (.69, .43, .35), .57)
    coords = nodes.new('ShaderNodeTexCoord')
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 15
    noise.inputs['Detail'].default_value = 4
    noise.inputs['Roughness'].default_value = .72
    links.new(coords.outputs['Generated'], noise.inputs['Vector'])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .22
    ramp.color_ramp.elements[0].color = (.21, .08, .055, 1)
    ramp.color_ramp.elements[1].position = .77
    ramp.color_ramp.elements[1].color = (.64, .37, .27, 1)
    links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    ao = nodes.new('ShaderNodeAmbientOcclusion')
    ao.inputs['Distance'].default_value = .014
    ao.inputs['Color'].default_value = (1, 1, 1, 1)
    mix = nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = .7
    links.new(ramp.outputs['Color'], mix.inputs[1])
    links.new(ao.outputs['Color'], mix.inputs[2])
    links.new(mix.outputs['Color'], bsdf.inputs['Base Color'])
    pores = nodes.new('ShaderNodeTexNoise')
    pores.inputs['Scale'].default_value = 290
    pores.inputs['Detail'].default_value = 2
    links.new(coords.outputs['Generated'], pores.inputs['Vector'])
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .29
    bump.inputs['Distance'].default_value = .0014
    links.new(pores.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    rough = nodes.new('ShaderNodeMapRange')
    rough.inputs['To Min'].default_value = .4
    rough.inputs['To Max'].default_value = .67
    links.new(noise.outputs['Fac'], rough.inputs['Value'])
    links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
    return mat


def ear(side):
    # The outer rim, recessed concha and folded tip share one closed shell.
    sections = [
        (.075, .025, .075, .035, .025),
        (.112, .005, .115, .05, .022),
        (.143, -.012, .155, .043, .025),
        (.163, -.043, .18, .027, .015),
        (.168, -.065, .198, .003, .003),
    ]
    verts = []
    ring = 20
    for x, y, z, width, depth in sections:
        for i in range(ring):
            a = i * 2 * math.pi / ring
            verts.append((side * (x + math.cos(a) * width), y + math.sin(a) * depth, z))
    faces = []
    for row in range(len(sections) - 1):
        for i in range(ring):
            j = (i + 1) % ring
            faces.append((row * ring + i, row * ring + j, (row + 1) * ring + j, (row + 1) * ring + i))
    faces.extend([tuple(reversed(range(ring))), tuple((len(sections) - 1) * ring + i for i in range(ring))])
    mesh = bpy.data.meshes.new('Closed cartilage ear')
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new('Folded pig ear', mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh); bm.free()
    active(obj)
    sub = obj.modifiers.new('Cartilage subdivision', 'SUBSURF')
    sub.levels = 2
    bpy.ops.object.modifier_apply(modifier=sub.name)
    return obj


def bake(obj):
    active(obj)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(65), island_margin=.014)
    bpy.ops.object.mode_set(mode='OBJECT')
    mats = list(obj.data.materials)
    images = {}
    for kind, tag in [('DIFFUSE', 'color'), ('ROUGHNESS', 'roughness'), ('NORMAL', 'normal')]:
        image = bpy.data.images.new('pig_' + tag, 1024, 1024, alpha=False)
        if tag != 'color':
            image.colorspace_settings.name = 'Non-Color'
        for mat in mats:
            node = mat.node_tree.nodes.new('ShaderNodeTexImage')
            node.image = image
            mat.node_tree.nodes.active = node
        if kind == 'DIFFUSE':
            bpy.ops.object.bake(type=kind, pass_filter={'COLOR'}, margin=10)
        else:
            bpy.ops.object.bake(type=kind, margin=10)
        for mat in mats:
            mat.node_tree.nodes.remove(mat.node_tree.nodes.active)
        image.filepath_raw = str(OUT / f'pig_{tag}.png')
        image.file_format = 'PNG'
        image.save()
        images[tag] = image
    mat, nodes, links, bsdf = material('Portero pig mask — baked PBR', (.7, .5, .4), .5)
    for tag, socket in [('color', 'Base Color'), ('roughness', 'Roughness')]:
        node = nodes.new('ShaderNodeTexImage'); node.image = images[tag]
        links.new(node.outputs['Color'], bsdf.inputs[socket])
    node = nodes.new('ShaderNodeTexImage'); node.image = images['normal']
    normal = nodes.new('ShaderNodeNormalMap')
    links.new(node.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def preview(obj, label, camera):
    scene = bpy.context.scene
    scene.render.resolution_x = 750
    scene.render.resolution_y = 750
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new('Studio world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.08, .09, .11, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .4
    lights = []
    for pos, energy, color, size in [((-.4, -.5, .6), 25, (1,.83,.65), .45), ((.5,.1,.4), 22, (.56,.7,1), .4), ((0,-.6,.1), 5, (1,1,1), .3)]:
        data = bpy.data.lights.new('Studio softbox', 'AREA')
        data.energy = energy; data.color = color; data.shape = 'DISK'; data.size = size
        light = bpy.data.objects.new('Studio softbox', data)
        scene.collection.objects.link(light); light.location = pos
        light.rotation_euler = (Vector((0,0,.03)) - light.location).to_track_quat('-Z','Y').to_euler()
        lights.append(light)
    camdata = bpy.data.cameras.new('Mask inspection')
    cam = bpy.data.objects.new('Mask inspection', camdata)
    scene.collection.objects.link(cam); cam.location = camera
    cam.rotation_euler = (Vector((0,-.01,.035)) - cam.location).to_track_quat('-Z','Y').to_euler()
    camdata.lens = 60
    scene.camera = cam
    scene.render.filepath = str(OUT / f'{label}.png')
    bpy.ops.render.render(write_still=True)
    for item in lights + [cam]:
        bpy.data.objects.remove(item, do_unlink=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.unit_settings.system = 'METRIC'
    skin = skin_material()
    mouth_mat = material('Dark cut interior', (.023,.009,.007), .82)[0]
    eye_mat = material('Recessed polished black eyes', (.009,.004,.002), .32)[0]
    pieces = [
        ellipsoid('Cranium', (0,.015,.012), (.115,.112,.129)),
        ellipsoid('Broad cheeks', (0,-.055,-.032), (.113,.1,.08)),
        ellipsoid('Nasal bridge', (0,-.098,-.005), (.073,.087,.069)),
        ellipsoid('Upper snout', (0,-.147,-.024), (.077,.059,.047)),
        ellipsoid('Lower jaw', (0,-.064,-.09), (.085,.083,.038)),
        ellipsoid('Snout end', (0,-.18,-.024), (.073,.028,.042)),
        ear(-1), ear(1),
    ]
    for side in [-1,1]:
        pieces.append(curve('Heavy upper brow', [(side*.022,-.105,.058),(side*.052,-.113,.062),(side*.082,-.09,.055),(side*.098,-.063,.036)], .013))
        pieces.append(curve('Cheek fold', [(side*.075,-.116,-.005),(side*.097,-.105,-.04),(side*.094,-.067,-.082)], .009))
    obj = join(pieces, 'Portero sculpted pig mask')
    active(obj)
    remesh = obj.modifiers.new('Unified sculpt surface', 'REMESH')
    remesh.mode = 'VOXEL'; remesh.voxel_size = .0017; remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth(obj, 7)
    obj.data.materials.append(skin)
    details = []
    for side in [-1,1]:
        eye = ellipsoid('Eye socket carve', (side*.061,-.102,.035), (.027,.043,.016))
        eye.rotation_euler.y = side * .13
        cut(obj, eye)
        eyeball = ellipsoid('Black eye in socket', (side*.061,-.088,.033), (.018,.017,.011), 32)
        eyeball.data.materials.append(eye_mat); details.append(eyeball)
        nostril = ellipsoid('Nostril carve', (side*.03,-.199,-.022), (.011,.018,.016), 32)
        nostril.rotation_euler.y = side * .3
        cut(obj, nostril)
        inner = ellipsoid('Nostril dark interior', (side*.03,-.188,-.02), (.008,.01,.012), 24)
        inner.data.materials.append(mouth_mat); details.append(inner)
        ear_cup = ellipsoid('Shallow ear concha', (side*.128,-.041,.132), (.025,.014,.032), 24)
        ear_cup.rotation_euler.y = side*.35
        cut(obj, ear_cup)
    lip = curve('Mouth incision', [(-.071,-.127,-.077),(-.045,-.158,-.079),(0,-.166,-.078),(.045,-.158,-.079),(.071,-.127,-.077)], .0035)
    cut(obj, lip)
    # A small off-center scar helps the hand-made mask read as a physical object.
    scar = curve('Cheek scar', [(.09,-.107,-.027),(.108,-.091,-.045),(.108,-.077,-.059)], .0015)
    cut(obj, scar)
    active(obj)
    dec = obj.modifiers.new('Game mesh budget', 'DECIMATE')
    dec.ratio = min(1, 10000 / (len(obj.data.polygons) * 2))
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=dec.name)
    # Boolean recesses must not leave detached chips on thin ear cartilage.
    bm = bmesh.new(); bm.from_mesh(obj.data)
    unseen = set(bm.verts)
    components = []
    while unseen:
        stack = [unseen.pop()]; component = set(stack)
        while stack:
            v = stack.pop()
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other in unseen:
                    unseen.remove(other); component.add(other); stack.append(other)
        components.append(component)
    largest = max(components, key=len)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v not in largest], context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data); bm.free()
    obj.data.materials.clear()
    obj.data.materials.append(skin)
    for poly in obj.data.polygons:
        poly.material_index = 0
    obj = join([obj] + details, 'mask_pig')
    obj.data.validate(verbose=True)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    bake(obj)
    active(obj)
    # Keep a neutral identity transform for the existing head-anchor contract.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'portero-mask.blend'))
    bpy.ops.export_scene.gltf(filepath=str(DEST), export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=92)
    print('MASK_PIG', 'triangles', sum(len(p.vertices)-2 for p in obj.data.polygons), 'bytes', DEST.stat().st_size,
          'bounds', [round(v,4) for v in obj.dimensions])
    preview(obj, 'front', (0,-.96,.12))
    preview(obj, 'three-quarter', (.66,-.79,.25))
    preview(obj, 'profile', (.96,-.03,.1))


if __name__ == '__main__' and '--export-only' in sys.argv:
    bpy.ops.wm.open_mainfile(filepath=str(OUT / 'portero-mask.blend'))
    obj = bpy.data.objects['mask_pig']
    obj.data.validate(verbose=True)
    active(obj)
    bpy.ops.export_scene.gltf(filepath=str(DEST), export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=92)
    print('MASK_PIG', 'triangles', sum(len(p.vertices)-2 for p in obj.data.polygons), 'bytes', DEST.stat().st_size,
          'bounds', [round(v,4) for v in obj.dimensions])
    preview(obj, 'front', (0,-.96,.12))
    preview(obj, 'three-quarter', (.66,-.79,.25))
    preview(obj, 'profile', (.96,-.03,.1))
elif __name__ == '__main__':
    main()
