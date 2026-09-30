"""Fardo de heno: el detalle alto (panes de paja apretados, pajas sueltas que se escapan, dos hilos de sisal) se hornea
sobre un fardo de pocos polígonos (color con oclusión, normal y rugosidad). Paja: textura de techo de paja de Poly Haven
(thatch_roof_angled, CC0) + variación de color.
  blender -b --factory-startup -P haybale.py
Salidas: public/assets/props/art/haybale.glb (fardo), haypile.glb (montón de paja suelta)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *

RENDERS = os.path.join(SRC, 'renders')
L, W, H = 0.92, 0.46, 0.36      # largo (x), ancho (y), alto (z)


def straw_mat():
    m = pbr('straw', 'thatch_roof_angled', '1k', rough=0.85, scale=0.6)
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    src = p.inputs['Base Color'].links[0].from_socket
    bw = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(src, bw.inputs['Color'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.05; ramp.color_ramp.elements[0].color = (0.20, 0.14, 0.06, 1)
    ramp.color_ramp.elements[1].position = 0.55; ramp.color_ramp.elements[1].color = (0.80, 0.64, 0.33, 1)
    e = ramp.color_ramp.elements.new(0.3); e.color = (0.52, 0.40, 0.18, 1)
    nt.links.new(bw.outputs['Val'], ramp.inputs['Fac'])
    # manchones más grises/verdosos (paja vieja, humedad)
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 6.0
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MIX'
    nt.links.new(ramp.outputs['Color'], mix.inputs['A'])
    mix.inputs['B'].default_value = (0.42, 0.40, 0.28, 1)
    fac = nt.nodes.new('ShaderNodeMapRange'); fac.inputs['From Min'].default_value = 0.55; fac.inputs['From Max'].default_value = 0.75
    fac.inputs['To Min'].default_value = 0.0; fac.inputs['To Max'].default_value = 0.45
    nt.links.new(noise.outputs['Fac'], fac.inputs['Value'])
    nt.links.new(fac.outputs['Result'], mix.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], p.inputs['Base Color'])
    return m


def flakes(mat, rnd):
    """Panes de paja: rebanadas de 7-8 cm a lo largo del fardo, cada una apenas corrida/girada."""
    parts = []
    n = 12
    for i in range(n):
        x = -L / 2 + (i + 0.5) * L / n
        o = cube(f'flake{i}', (x + rnd.uniform(-0.004, 0.004), rnd.uniform(-0.008, 0.008), H / 2 + rnd.uniform(-0.006, 0.01)),
                 (L / n - 0.0015, W + rnd.uniform(-0.008, 0.02), H + rnd.uniform(-0.01, 0.016)), mat, 0.015,
                 rot=(rnd.uniform(-0.03, 0.03), rnd.uniform(-0.02, 0.02), rnd.uniform(-0.03, 0.03)))
        # subdividir y abollar
        sd = o.modifiers.new('sd', 'SUBSURF'); sd.levels = 2; sd.render_levels = 2
        tex = bpy.data.textures.new(f'n{i}', 'CLOUDS'); tex.noise_scale = 0.04
        dp = o.modifiers.new('dp', 'DISPLACE'); dp.texture = tex; dp.strength = 0.008; dp.mid_level = 0.5
        apply_all(o)
        parts.append(o)
    return parts


def strays(mat, rnd, n=900, bbox=(L, W, H), z0=0.0):
    """Pajas sueltas: tiras finas curvas que salen de la superficie."""
    verts, faces = [], []
    lx, ly, lz = bbox
    for k in range(n):
        # punto en la superficie de la caja
        face = rnd.choice(['top', 'side', 'side', 'end', 'top'])
        if face == 'top':
            p = Vector((rnd.uniform(-lx / 2, lx / 2), rnd.uniform(-ly / 2, ly / 2), z0 + lz))
            d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0.1, 0.6)))
        elif face == 'side':
            s = rnd.choice([-1, 1])
            p = Vector((rnd.uniform(-lx / 2, lx / 2), s * ly / 2, z0 + rnd.uniform(0.02, lz)))
            d = Vector((rnd.uniform(-1, 1), s * rnd.uniform(0.1, 0.5), rnd.uniform(-0.5, 0.4)))
        else:
            s = rnd.choice([-1, 1])
            p = Vector((s * lx / 2, rnd.uniform(-ly / 2, ly / 2), z0 + rnd.uniform(0.02, lz)))
            d = Vector((s * rnd.uniform(0.1, 0.6), rnd.uniform(-1, 1), rnd.uniform(-0.5, 0.5)))
        d.normalize()
        ln = rnd.uniform(0.05, 0.16)
        wdt = rnd.uniform(0.0025, 0.004)
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 0.1:
            side = Vector((1, 0, 0))
        side.normalize()
        bend = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), -0.6)).normalized() * ln * 0.25
        base = len(verts)
        segs = 3
        for j in range(segs + 1):
            t = j / segs
            c = p - d * 0.02 + d * ln * t + bend * t * t
            verts.append(tuple(c - side * wdt))
            verts.append(tuple(c + side * wdt))
        for j in range(segs):
            a = base + j * 2
            faces.append((a, a + 1, a + 3, a + 2))
    me = bpy.data.meshes.new('strays'); me.from_pydata(verts, [], faces); me.update()
    uvl = me.uv_layers.new(name='UVMap')
    for li, loop in enumerate(me.loops):
        uvl.data[li].uv = (rnd.random(), rnd.random())
    o = bpy.data.objects.new('strays', me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    sol = o.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.0015
    apply_all(o)
    return o


def twine(mat, x):
    """Hilo de sisal alrededor del fardo (plano x = cte), rectángulo de esquinas redondeadas hundido en la paja."""
    k = 1 + 0.05 * (1 - (2 * x / L) ** 2)
    hy, hz, r = (W + 0.03) / 2 * k - 0.001, (H + 0.03) / 2 * (1 + 0.04 * (1 - (2 * x / L) ** 2)) - 0.001, 0.05
    pts = []
    for cy, cz, a0 in ((hy - r, hz - r, 0), (-hy + r, hz - r, 90), (-hy + r, -hz + r, 180), (hy - r, -hz + r, 270)):
        for k in range(7):
            a = math.radians(a0 + k * 15)
            pts.append((x, cy + r * math.cos(a), H / 2 + cz + r * math.sin(a)))
    cu = bpy.data.curves.new('tw', 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, c in enumerate(pts):
        sp.points[i].co = (*c, 1)
    sp.use_cyclic_u = True
    cu.bevel_depth = 0.0032; cu.bevel_resolution = 1
    o = bpy.data.objects.new('tw', cu); bpy.context.scene.collection.objects.link(o)
    select([o]); bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    o.data.materials.append(mat)
    return o


def make_bale():
    reset()
    rnd = random.Random(21)
    straw = straw_mat()
    sisal = pbr('sisal', None, rough=0.9, color=(0.30, 0.21, 0.11))
    hi = flakes(straw, rnd)
    hi.append(strays(straw, rnd))
    hi_o = join(hi, 'hi')
    for o in hi_o.data.polygons:
        pass
    # bajo: caja biselada y apenas abombada
    lo = cube('haybale', (0, 0, H / 2), (L + 0.02, W + 0.03, H + 0.03), None, 0.035)
    sd = lo.modifiers.new('sd', 'SUBSURF'); sd.levels = 1
    apply_all(lo)
    for v in lo.data.vertices:
        c = v.co
        v.co.y *= 1 + 0.05 * (1 - (2 * c.x / L) ** 2)
        v.co.z = H / 2 + (c.z - H / 2) * (1 + 0.04 * (1 - (2 * c.x / L) ** 2))
    lo.data.materials.append(straw)
    # UV para hornear
    select([lo]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode='OBJECT')
    bake_hi_to_lo(hi_o, lo, 'haybale', res=1024)
    bpy.data.objects.remove(hi_o, do_unlink=True)
    tw = [twine(sisal, x) for x in (-L * 0.28, L * 0.28)]
    tw_o = join(tw, 'haybale_twine'); box_uv(tw_o, 0.05)
    smooth(lo, 50)
    export([lo, tw_o], 'haybale', tex_res=1024)
    preview(os.path.join(RENDERS, 'hay_prev.png'), (1.2, -1.4, 1.0), (0, 0, 0.18), lens=45, w=900, h=600)


def bake_hi_to_lo(hi, lo, name, res=1024):
    """Hornea color (con oclusión multiplicada), normal y rugosidad del alto al bajo (selected to active)."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 16
    import numpy as np
    out = {}
    lo_mat = lo.data.materials[0].copy(); lo.data.materials.clear(); lo.data.materials.append(lo_mat)
    for kind in ('DIFFUSE', 'AO', 'NORMAL', 'ROUGHNESS'):
        im = bpy.data.images.new(f'{name}_{kind}', res, res, alpha=False)
        if kind != 'DIFFUSE':
            im.colorspace_settings.name = 'Non-Color'
        n = lo_mat.node_tree.nodes.new('ShaderNodeTexImage'); n.image = im
        lo_mat.node_tree.nodes.active = n
        select([hi, lo], active=lo)
        sc.render.bake.use_selected_to_active = True
        sc.render.bake.cage_extrusion = 0.06
        sc.render.bake.max_ray_distance = 0.12
        sc.render.bake.margin = 8
        if kind == 'DIFFUSE':
            bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
        elif kind == 'AO':
            bpy.ops.object.bake(type='AO')
        elif kind == 'NORMAL':
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT')
        else:
            bpy.ops.object.bake(type='ROUGHNESS')
        lo_mat.node_tree.nodes.remove(n)
        out[kind] = im
    # color * oclusión
    c = np.array(out['DIFFUSE'].pixels[:]).reshape(-1, 4)
    a = np.array(out['AO'].pixels[:]).reshape(-1, 4)
    c[:, :3] *= (0.62 + 0.38 * a[:, :1])
    col = bpy.data.images.new(f'{name}_col', res, res, alpha=False)
    col.pixels.foreach_set(c.astype(np.float32).ravel())
    for im, tag in ((col, 'col'), (out['NORMAL'], 'nor'), (out['ROUGHNESS'], 'rough')):
        im.filepath_raw = os.path.join(RENDERS, f'{name}_{tag}.png'); im.file_format = 'PNG'; im.save()
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = col; nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = out['ROUGHNESS']; nt.links.new(t.outputs['Color'], p.inputs['Roughness'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = out['NORMAL']
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    lo.data.materials.clear(); lo.data.materials.append(m)
    return m


make_bale()
