"""Pase de arte (castillo y mapa): herramientas comunes para los scripts de Blender de esta carpeta.

- Texturas CC0 de Poly Haven: se bajan una vez (API publica, sin login) a assets/art-source/polyhaven/<id>/.
- Materiales PBR, UV en metros (proyeccion de caja), biselado, horneado de normal/AO de alta a baja.
- Exporta GLB con texturas JPEG al tamano pedido y deja un .blend de autor en output/artpass/.
Se corre con: blender -b --factory-startup -P <script>.py -- <args>
"""
import bpy, bmesh, math, os, sys, json, random, urllib.request
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SRC = os.path.abspath(os.path.join(REPO, '..', 'assets', 'art-source'))
OUT = os.path.join(REPO, 'public', 'assets', 'props', 'art')
AUTHOR = os.path.join(REPO, 'output', 'artpass')
for _d in (SRC, OUT, AUTHOR):
    os.makedirs(_d, exist_ok=True)
UA = {'User-Agent': 'desmadre-artpass (CC0 assets)'}


def args():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 16
    return sc


def fetch(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return dst
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
    open(dst, 'wb').write(data)
    return dst


def ph_tex(tid, res='1k'):
    """Mapas de una textura de Poly Haven -> dict(kind: ruta). kinds: diff, nor, rough, ao, disp, arm"""
    base = os.path.join(SRC, 'polyhaven', tid)
    meta_p = os.path.join(base, 'files.json')
    if not os.path.exists(meta_p):
        os.makedirs(base, exist_ok=True)
        meta = json.loads(urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + tid, headers=UA), timeout=60).read())
        json.dump(meta, open(meta_p, 'w'))
    meta = json.load(open(meta_p))
    want = {'diff': ['Diffuse', 'diff'], 'nor': ['nor_gl'], 'rough': ['Rough', 'rough'], 'ao': ['AO', 'ao'], 'disp': ['Displacement', 'disp'], 'arm': ['arm']}
    out = {}
    for kind, keys in want.items():
        for k in keys:
            if k in meta and res in meta[k]:
                fmts = meta[k][res]
                f = fmts.get('jpg') or fmts.get('png')
                if not f:
                    continue
                ext = 'jpg' if 'jpg' in fmts else 'png'
                out[kind] = fetch(f['url'], os.path.join(base, f'{tid}_{kind}_{res}.{ext}'))
                break
    return out


def ph_model(mid, res='1k'):
    """Modelo glTF de Poly Haven (con sus texturas) -> ruta del .gltf"""
    base = os.path.join(SRC, 'polyhaven-models', mid)
    meta_p = os.path.join(base, 'files.json')
    if not os.path.exists(meta_p):
        os.makedirs(base, exist_ok=True)
        meta = json.loads(urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + mid, headers=UA), timeout=60).read())
        json.dump(meta, open(meta_p, 'w'))
    meta = json.load(open(meta_p))
    e = meta['gltf'][res]['gltf']
    main = fetch(e['url'], os.path.join(base, f'{mid}_{res}.gltf'))
    for rel, item in e.get('include', {}).items():
        fetch(item['url'], os.path.join(base, rel))
    return main


def img(path, noncolor=False):
    im = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        im.colorspace_settings.name = 'Non-Color'
    return im


def pbr(name, tid=None, res='1k', color=(0.5, 0.5, 0.5), rough=0.8, metal=0.0, scale=1.0, tint=None, normal_strength=1.0, rot=0.0):
    """Material Principled con los mapas de Poly Haven (UV en metros: scale = metros que cubre una repeticion)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if not tid:
        return m
    maps = ph_tex(tid, res)
    uv = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / scale, 1 / scale, 1 / scale)
    mp.inputs['Rotation'].default_value = (0, 0, rot)
    nt.links.new(uv.outputs['UV'], mp.inputs['Vector'])

    def tex(kind, noncolor):
        if kind not in maps:
            return None
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img(maps[kind], noncolor)
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
        return t
    d = tex('diff', False)
    if d:
        if tint:
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(d.outputs['Color'], mix.inputs['A'])
            mix.inputs['B'].default_value = (*tint, 1)
            nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
        else:
            nt.links.new(d.outputs['Color'], p.inputs['Base Color'])
    r = tex('rough', True)
    if r:
        nt.links.new(r.outputs['Color'], p.inputs['Roughness'])
    elif 'arm' in maps:
        a = tex('arm', True)
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(a.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], p.inputs['Roughness'])
    n = tex('nor', True)
    if n:
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    return m


def select(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def apply_all(o):
    select([o])
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for md in list(o.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=md.name)
        except Exception as e:
            print('no se pudo aplicar', md.name, e)


def box_uv(o, size=1.0):
    """UV por proyeccion de caja en coordenadas del mundo (metros / size)."""
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    if me.uv_layers.active is None:
        me.uv_layers.active = me.uv_layers[0]
    uv = me.uv_layers.active.data
    mw = o.matrix_world
    for f in me.polygons:
        n = (mw.to_3x3() @ f.normal)
        ax = max(range(3), key=lambda k: abs(n[k]))
        a, b = [k for k in range(3) if k != ax]
        for li in f.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (co[a] / size, co[b] / size)


def bevel(o, width=0.01, segments=2, limit=True):
    md = o.modifiers.new('bevel', 'BEVEL')
    md.width = width
    md.segments = segments
    if limit:
        md.limit_method = 'ANGLE'
    md.harden_normals = False
    return md


def cube(name, loc, dims, mat=None, bev=0.01, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = dims
    select([o])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bev:
        bevel(o, bev, 2)
    if mat:
        o.data.materials.append(mat)
    return o


def cyl(name, loc, r, h, mat=None, verts=16, rot=(0, 0, 0), bev=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    if bev:
        bevel(o, bev, 2)
    if mat:
        o.data.materials.append(mat)
    return o


def join(objs, name):
    select(objs)
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def smooth(o, angle=40):
    select([o])
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception:
        bpy.ops.object.shade_smooth()


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def export(objs, name, tex_res=1024, jpeg=85):
    """GLB con las texturas reducidas a tex_res y JPEG (ruta public/assets/props/art/<name>.glb)."""
    for im in bpy.data.images:
        if im.size[0] > tex_res or im.size[1] > tex_res:
            k = tex_res / max(im.size)
            im.scale(max(4, int(im.size[0] * k)), max(4, int(im.size[1] * k)))
    select(objs)
    dst = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=True, export_yup=True,
                              export_image_format='JPEG', export_jpeg_quality=jpeg, export_animations=False,
                              export_apply=True, export_texcoords=True, export_normals=True, export_materials='EXPORT')
    try:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(AUTHOR, name + '.blend'))
    except Exception as e:
        print('no se guardo el .blend', e)
    print('EXPORT', name, os.path.getsize(dst) // 1024, 'KB', 'tris', sum(tris(o) for o in objs if o.type == 'MESH'))
    return dst


def preview(path, cam_loc, target, lens=50, w=900, h=700, sun=(0.6, -0.4, 0.9), world=0.25, samples=24):
    """Render rapido con Cycles para revisar el modelo."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.film_transparent = False
    if not sc.world:
        sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.35, 0.38, 0.45, 1)
    bg.inputs['Strength'].default_value = world
    cam = bpy.data.objects.get('_cam')
    if not cam:
        cam = bpy.data.objects.new('_cam', bpy.data.cameras.new('_cam'))
        sc.collection.objects.link(cam)
        ld = bpy.data.lights.new('_sun', 'SUN'); ld.energy = 3.0
        lo = bpy.data.objects.new('_sun', ld); sc.collection.objects.link(lo)
        lo.rotation_euler = Vector(sun).to_track_quat('Z', 'Y').to_euler()
    cam.data.lens = lens
    sc.camera = cam
    cam.location = Vector(cam_loc)
    cam.rotation_euler = (Vector(target) - Vector(cam_loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def bake_textures(o, name, res=1024, margin=8, normal=True, rough=True, samples=8):
    """Hornea color, rugosidad y normal del material (nodos cualquiera) a imágenes en las UV de o y le deja un
    material simple con esas imágenes (lo que el exportador de glTF sabe escribir). o necesita UV sin solapes."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.render.bake.margin = margin
    imgs = {}
    kinds = [('DIFFUSE', 'col', False)] + ([('ROUGHNESS', 'rough', True)] if rough else []) + ([('NORMAL', 'nor', True)] if normal else [])
    mats = [s.material for s in o.material_slots if s.material]
    for kind, tag, noncolor in kinds:
        im = bpy.data.images.new(f'{name}_{tag}', res, res, alpha=False, float_buffer=False)
        if noncolor:
            im.colorspace_settings.name = 'Non-Color'
        imgs[tag] = im
        nodes = []
        for m in mats:
            n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = im
            m.node_tree.nodes.active = n
            nodes.append((m, n))
        select([o])
        if kind == 'DIFFUSE':
            sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = False; sc.render.bake.use_pass_color = True
            bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=margin)
        elif kind == 'ROUGHNESS':
            bpy.ops.object.bake(type='ROUGHNESS', margin=margin)
        else:
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', margin=margin)
        for m, n in nodes:
            m.node_tree.nodes.remove(n)
        im.filepath_raw = os.path.join(SRC, 'renders', f'{name}_{tag}.png')
        im.file_format = 'PNG'
        im.save()
    # material simple con lo horneado
    bm = bpy.data.materials.new(name + '_baked'); bm.use_nodes = True
    nt = bm.node_tree; p = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = imgs['col']; nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if 'rough' in imgs:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = imgs['rough']; nt.links.new(t.outputs['Color'], p.inputs['Roughness'])
    if 'nor' in imgs:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = imgs['nor']
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    o.data.materials.clear(); o.data.materials.append(bm)
    return bm, imgs


def render_text_mask(text, font, path, w_m, h_m, px_w, size, y_off=0.0, extra=None):
    """Imagen blanco sobre negro del texto, encuadrada en un rectángulo de w_m x h_m metros (para máscaras)."""
    reset()
    sc = bpy.context.scene
    bpy.ops.object.text_add(location=(0, 0, y_off))
    t = bpy.context.active_object
    t.data.body = text
    t.data.font = bpy.data.fonts.load(font, check_existing=True)
    t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
    t.data.size = size
    t.rotation_euler = (math.radians(90), 0, 0)
    m = bpy.data.materials.new('w'); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
    t.data.materials.append(m)
    if extra:
        extra(m)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(w_m, h_m)
    cam.location = (0, -3, 0); cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam
    w0 = bpy.data.worlds.new('w'); w0.use_nodes = True; w0.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
    sc.world = w0
    sc.render.resolution_x = px_w
    sc.render.resolution_y = int(round(px_w * h_m / w_m))
    sc.cycles.samples = 16
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'BW'
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path
