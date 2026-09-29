"""4) Arma el GLB: sabana con la forma "sit" (morph target), y el antebrazo/mano que cuelga (de Eric, palido, con sangre por vertice).
   blender -b --factory-startup -P 04_export.py -- h5
   Despues copiar work/corpse_sheet.glb a public/assets/props/castle/ y poner en castle-corpse.js HANG = -zminA (work/corpse_meta.json)
   y la punta de los dedos (tip) en DRIP."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
tag = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'h3'
out = sys.argv[sys.argv.index('--') + 2] if len(sys.argv) > sys.argv.index('--') + 2 else os.path.join(HERE, 'corpse_sheet.glb')
reset()
A = np.load(os.path.join(HERE, f'sheet_A{tag}.npz')); Bz = np.load(os.path.join(HERE, f'sheet_B{tag}.npz'))
PA, PB = A['P'], Bz['P']
NX, NY = int(A['NX']), int(A['NY'])
uv = A['uv']
idx = lambda i, j: i * (NY + 1) + j
quads = [(idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)) for i in range(NX) for j in range(NY)]
me = bpy.data.meshes.new('CorpseSheet')
me.from_pydata([tuple(p) for p in PA], [], quads)
uvl = me.uv_layers.new(name='UVMap')
for li, loop in enumerate(me.loops):
    uvl.data[li].uv = tuple(uv[loop.vertex_index])
for p in me.polygons:
    p.use_smooth = True
ob = bpy.data.objects.new('CorpseSheet', me)
bpy.context.scene.collection.objects.link(ob)
ob.shape_key_add(name='Basis', from_mix=False)
sit = ob.shape_key_add(name='sit', from_mix=False)
for i, p in enumerate(PB):
    sit.data[i].co = tuple(p)
sit.value = 0.0
# material de la sabana: textura de color, rugosidad (G) y normal
mat = bpy.data.materials.new('CorpseSheet'); mat.use_nodes = True
nodes, links = mat.node_tree.nodes, mat.node_tree.links
bsdf = nodes['Principled BSDF']
def img_node(fn, cs):
    n = nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(os.path.join(HERE, fn)); n.image.colorspace_settings.name = cs; return n
alb = img_node('corpse_albedo.png', 'sRGB'); links.new(alb.outputs['Color'], bsdf.inputs['Base Color'])
mr = img_node('corpse_mr.png', 'Non-Color'); sep = nodes.new('ShaderNodeSeparateColor')
links.new(mr.outputs['Color'], sep.inputs['Color']); links.new(sep.outputs['Green'], bsdf.inputs['Roughness']); links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
nm = img_node('corpse_normal.png', 'Non-Color'); nmap = nodes.new('ShaderNodeNormalMap')
links.new(nm.outputs['Color'], nmap.inputs['Color']); links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
me.materials.append(mat)
objs = [ob]
meta = dict(zminA=float(PA[:, 2].min()), bboxA=[PA.min(0).tolist(), PA.max(0).tolist()], bboxB=[PB.min(0).tolist(), PB.max(0).tolist()])

# ---- el brazo que cuelga por el borde de la mesa (antebrazo y mano del modelo de Eric, palidos y con sangre)
S = np.load(os.path.join(HERE, 'body_states.npz'))
hang = S['hang']
if hang.any():
    VA = S['A']
    bpy.ops.import_scene.gltf(filepath=ERIC)
    src = [o for o in bpy.data.objects if o.type == 'MESH' and o.name == 'Body'][0]
    smesh = src.data
    suv = smesh.uv_layers.active
    keep = np.where(hang)[0]
    remap = -np.ones(len(VA), int); remap[keep] = np.arange(len(keep))
    tri = [i for i, p in enumerate(smesh.polygons) if all(hang[v] for v in p.vertices)]
    verts = VA[keep]
    faces = [tuple(int(remap[v]) for v in smesh.polygons[i].vertices) for i in tri]
    hm = bpy.data.meshes.new('DeadHand')
    hm.from_pydata([tuple(v) for v in verts], [], faces)
    huv = hm.uv_layers.new(name='UVMap')
    li = 0
    for i in tri:
        p = smesh.polygons[i]
        for k in range(len(p.vertices)):
            huv.data[li].uv = suv.data[p.loop_start + k].uv
            li += 1
    for p in hm.polygons:
        p.use_smooth = True
    # la textura del modelo (piel y ropa) mas chica, palida y fria
    mat0 = smesh.materials[0]
    tex = [n for n in mat0.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image][0].image
    tex.scale(1024, 1024)
    px = np.empty(len(tex.pixels), np.float32); tex.pixels.foreach_get(px); px = px.reshape(-1, 4)
    lum = px[:, :3] @ np.array([0.3, 0.59, 0.11], np.float32)
    px[:, :3] = (0.7 * px[:, :3] + 0.3 * lum[:, None]) * np.array([0.82, 0.88, 0.97], np.float32) * 0.9
    tex.pixels.foreach_set(px.ravel()); tex.update()
    hm.materials.append(mat0)
    # sangre en la mano: color por vertice que se va oscureciendo hacia las puntas de los dedos (y gotea por la muneca)
    z = verts[:, 2]; ztip = float(z.min()); zw = ztip + 0.24
    t = np.clip((zw - z) / (zw - ztip), 0, 1)
    t = t * t * (3 - 2 * t)
    nz = 0.5 + 0.5 * np.sin(verts[:, 0] * 71 + verts[:, 1] * 53 + z * 97)
    tb = np.clip(t * (0.75 + 0.5 * nz), 0, 1)
    ca = hm.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    blood = np.array([0.20, 0.012, 0.014]); white = np.array([1.0, 1.0, 1.0])
    for i in range(len(verts)):
        c = white * (1 - tb[i] * 0.92) + blood * (tb[i] * 0.92)
        ca.data[i].color = (float(c[0]), float(c[1]), float(c[2]), 1.0)
    hob = bpy.data.objects.new('DeadHand', hm)
    bpy.context.scene.collection.objects.link(hob)
    for o in list(bpy.data.objects):      # afuera el esqueleto y la malla completa que solo servian para copiar
        if o not in (ob, hob):
            bpy.data.objects.remove(o, do_unlink=True)
    objs.append(hob)
    tip = verts[int(np.argmin(z))]
    meta['tip'] = [float(x) for x in tip]
    meta['hand_verts'] = int(len(verts)); meta['hand_tris'] = len(faces)
    print('fingertip (blender x,y,z):', tip.round(3), 'hand verts', len(verts), 'tris', len(faces))
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = ob
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                          export_morph=True, export_morph_normal=True, export_morph_tangent=False,
                          export_image_format='JPEG', export_jpeg_quality=86, export_animations=False, export_skins=False,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT', export_vertex_color='ACTIVE')
print('EXPORT_OK', out, os.path.getsize(out) // 1024, 'KB', 'verts', len(PA), 'tris', NX * NY * 2)
print('A bbox', PA.min(0).round(3), PA.max(0).round(3), 'B bbox', PB.min(0).round(3), PB.max(0).round(3))
json.dump(meta, open(os.path.join(HERE, 'corpse_meta.json'), 'w'))
