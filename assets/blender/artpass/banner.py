"""Estandarte del portón: paño de lana carmesí con cola de golondrina, colgado de anillas en una vara de hierro con
dos ménsulas a la pared. La caída y los pliegues salen de una simulación de tela (el borde de arriba se frunce entre
anillas más juntas que el ancho del paño: eso arma los pliegues verticales). Textura: lino de Poly Haven teñido,
emblema bordado en oro (emblem.py), ribete dorado, humedad y manchas abajo.
  blender -b --factory-startup -P banner.py
Salida: public/assets/props/art/banner.glb (origen: centro de la vara, contra la pared en z = 0; el paño cuelga hacia -y)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *
import numpy as np

W, H, TAIL = 1.7, 4.3, 0.62      # ancho, alto (hasta la punta de la cola) y profundidad de la V
NX, NY = 34, 86                  # celdas de la tela (5 cm)
OFF = 0.16                       # separación de la pared (la vara)
RINGS = 7
RODW = 2.05
TEXW, TEXH = 1024, 2048
RENDERS = os.path.join(SRC, 'renders')


def cloth_grid():
    """Malla plana en el plano XZ (y = -OFF) con la cola de golondrina cortada en diagonal (bisect, bordes limpios)."""
    import bmesh as _bm
    bm = _bm.new()
    grid = {}
    for j in range(NY + 1):
        for i in range(NX + 1):
            grid[(i, j)] = bm.verts.new(((i / NX - 0.5) * W, -OFF, -j / NY * H))
    for j in range(NY):
        for i in range(NX):
            bm.faces.new([grid[(i, j)], grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)]])
    # las dos rectas de la V: de las esquinas de abajo al centro, TAIL más arriba
    for s_ in (-1, 1):
        p0 = Vector((s_ * W / 2, -OFF, -H)); p1 = Vector((0, -OFF, -H + TAIL))
        d = (p1 - p0).normalized()
        n = Vector((d.z, 0, -d.x))          # perpendicular en el plano XZ
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        _bm.ops.bisect_plane(bm, geom=geom, plane_co=p0, plane_no=n)
    def inside_v(c):
        return c.z < -H + TAIL * (1 - abs(c.x) / (W / 2)) - 1e-4
    dead = [f for f in bm.faces if inside_v(f.calc_center_median())]
    _bm.ops.delete(bm, geom=dead, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    _bm.ops.delete(bm, geom=loose, context='VERTS')
    me = bpy.data.meshes.new('banner')
    bm.to_mesh(me)
    bm.free()
    uvl = me.uv_layers.new(name='UVMap')
    for li, loop in enumerate(me.loops):
        c = me.vertices[loop.vertex_index].co
        uvl.data[li].uv = (c.x / W + 0.5, 1 + c.z / H)
    o = bpy.data.objects.new('banner_cloth', me)
    bpy.context.scene.collection.objects.link(o)
    # anillas: vértices del borde de arriba más cercanos a cada anilla (y sus vecinos: la anilla agarra un pedazo)
    top = [v for v in me.vertices if abs(v.co.z) < 1e-5]
    top.sort(key=lambda v: v.co.x)
    pins = []
    for r in range(RINGS):
        x = (r / (RINGS - 1) - 0.5) * W
        k = min(range(len(top)), key=lambda q: abs(top[q].co.x - x))
        for q in (k - 1, k, k + 1):
            if 0 <= q < len(top):
                pins.append(top[q].index)
    return o, sorted(set(pins)), None


def drape(o):
    """Caída de un paño pesado colgado de anillas: pliegues verticales entre anilla y anilla que se abren hacia abajo,
    ondas anchas y lentas, la cola apenas separada de la pared. Determinística (la simulación de tela se enroscaba)."""
    me = o.data
    lam = W / (RINGS - 1)
    rnd = random.Random(11)
    ph = [rnd.uniform(0, 6.28) for _ in range(4)]
    def sstep(e0, e1, x):
        t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
        return t * t * (3 - 2 * t)
    for v in me.vertices:
        x0, z0 = v.co.x, v.co.z
        t = min(1.0, -z0 / H)
        g = 0.84 + 0.16 * sstep(0.0, 0.55, t)                   # fruncido arriba, suelto abajo
        fold = 0.5 - 0.5 * math.cos(2 * math.pi * (x0 + W / 2) / lam)   # 0 en cada anilla, 1 entre anillas
        amp = 0.075 * (1 - t) ** 1.6 + 0.012
        y = -OFF - amp * fold
        # ondas anchas que bajan en diagonal (el peso tira distinto de cada lado)
        y += -0.035 * math.sin(2 * math.pi * x0 / 0.85 + ph[0] + t * 2.2) * sstep(0.1, 0.6, t)
        y += -0.02 * math.sin(2 * math.pi * x0 / 0.42 + ph[1] - t * 3.1) * sstep(0.3, 0.9, t)
        # se separa un poco de la pared hacia abajo y la cola se abre
        y += -0.06 * t ** 1.3 - 0.07 * sstep(0.86, 1.0, t) * (0.6 + 0.4 * math.sin(x0 * 5 + ph[2]))
        x = x0 * g + 0.025 * math.sin(math.pi * t) * math.sin(ph[3])
        z = z0 + 0.012 * math.sin(2 * math.pi * x0 / lam) * t    # el ruedo no queda perfectamente recto
        v.co = (x, y, z)
    me.update()
    md = o.modifiers.new('sol', 'SOLIDIFY')
    md.thickness = 0.008; md.offset = 1
    select([o]); bpy.ops.object.modifier_apply(modifier='sol')
    smooth(o, 70)
    return o


def textures():
    """Albedo, normal y metal/rugosidad del paño -> rutas png en renders/."""
    maps = ph_tex('rough_linen', '1k')
    def load(path):
        im = bpy.data.images.load(path)
        a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)
        return a
    lin = load(maps['diff'])[..., :3]
    lnor = load(maps['nor'])[..., :3]
    em = bpy.data.images.load(os.path.join(RENDERS, 'emblem.png'))
    ea = np.array(em.pixels[:], dtype=np.float32).reshape(em.size[1], em.size[0], 4)
    H_, W_ = TEXH, TEXW
    yy, xx = np.mgrid[0:H_, 0:W_].astype(np.float32)
    u = xx / W_; v = yy / H_                      # v = 0 abajo (orden de pixels de Blender)
    # lino repetido: 4 x 8 veces en el paño
    ty = (yy * 8 / H_ * lin.shape[0]).astype(int) % lin.shape[0]
    tx = (xx * 4 / W_ * lin.shape[1]).astype(int) % lin.shape[1]
    weave = lin[ty, tx].mean(-1)
    wn = lnor[ty, tx]
    weave = (weave - weave.mean()) / (weave.std() + 1e-5)
    rng = np.random.default_rng(3)
    def fbm(scale, octaves=4, seed=0):
        r = np.random.default_rng(seed)
        acc = np.zeros((H_, W_), np.float32); amp = 1.0; tot = 0
        for o_ in range(octaves):
            n = int(scale * 2 ** o_) + 2
            g = r.random((n, n)).astype(np.float32)
            gy = v * (n - 1); gx = u * (n - 1)
            i0 = np.floor(gy).astype(int); j0 = np.floor(gx).astype(int)
            fy = gy - i0; fx = gx - j0
            fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
            i1 = np.minimum(i0 + 1, n - 1); j1 = np.minimum(j0 + 1, n - 1)
            val = (g[i0, j0] * (1 - fx) + g[i0, j1] * fx) * (1 - fy) + (g[i1, j0] * (1 - fx) + g[i1, j1] * fx) * fy
            acc += val * amp; tot += amp; amp *= 0.5
        return acc / tot
    # campo carmesí con variación de teñido
    dye = fbm(3, 4, 11)
    red = np.stack([0.30 + 0.06 * dye, 0.020 + 0.012 * dye, 0.028 + 0.012 * dye], -1)
    col = red * (1 + 0.10 * weave[..., None])
    # borde negro con ribete dorado (costados y arriba)
    bx = np.minimum(u, 1 - u)
    top = 1 - v
    border = (bx < 0.075) | (top < 0.035)
    col = np.where(border[..., None], np.stack([0.022, 0.018, 0.02], -1) * (1 + 0.1 * weave[..., None]), col)
    trim = ((np.abs(bx - 0.085) < 0.006) & (top > 0.045)) | ((np.abs(top - 0.045) < 0.004) & (bx > 0.085))
    # emblema: arriba del centro
    eh, ew = ea.shape[:2]
    ex0, ex1 = 0.14, 0.86
    ey_top, ey_bot = 0.93, 0.93 - (ex1 - ex0) * W_ / H_ * eh / ew
    eu = (u - ex0) / (ex1 - ex0)
    ev = (v - ey_bot) / (ey_top - ey_bot)
    inside = (eu >= 0) & (eu < 1) & (ev >= 0) & (ev < 1)
    ei = np.clip((ev * (eh - 1)).astype(int), 0, eh - 1)
    ej = np.clip((eu * (ew - 1)).astype(int), 0, ew - 1)
    ealpha = np.where(inside, ea[ei, ej, 3], 0.0)
    eshade = np.where(inside, ea[ei, ej, :3].mean(-1), 0.0)
    # hilos del bordado: rayado diagonal fino
    threads = 0.5 + 0.5 * np.sin((xx * 0.9 + yy * 0.55) * 1.3)
    gold_lo = np.array([0.30, 0.19, 0.05]); gold_hi = np.array([0.98, 0.78, 0.36])
    sh = np.clip(eshade * 1.4, 0, 1) ** 1.3 * (0.75 + 0.25 * threads)
    gold = gold_lo + (gold_hi - gold_lo) * sh[..., None]
    k = np.clip(ealpha * 1.2, 0, 1)[..., None]
    col = col * (1 - k) + gold * k
    trimc = gold_lo + (gold_hi - gold_lo) * (0.55 + 0.25 * threads)[..., None]
    col = np.where(trim[..., None], trimc, col)
    # humedad: la parte de abajo más oscura y con marcas de agua; algo de suciedad
    damp = np.clip((0.32 - v) / 0.32, 0, 1) ** 1.5
    stains = np.clip((fbm(6, 4, 21) - 0.52) * 4, 0, 1)
    col *= (1 - 0.45 * damp[..., None]) * (1 - 0.25 * stains[..., None] * (0.4 + damp[..., None]))
    col *= (0.92 + 0.08 * fbm(12, 3, 31))[..., None]
    # rugosidad / metal (glTF: G = rugosidad, B = metal)
    rough = np.where(k[..., 0] > 0.3, 0.42, 0.93) - 0.1 * damp
    rough = np.where(trim, 0.45, rough)
    metal = np.clip(k[..., 0] * 0.85 + trim * 0.8, 0, 1)
    # normal: tejido + relieve del bordado + hilos
    height = ealpha * (0.6 + 0.4 * eshade) * 1.0 + trim * 0.6
    gy_, gx_ = np.gradient(height)
    nx = (wn[..., 0] * 2 - 1) * 0.8 - gx_ * 5.0
    ny = (wn[..., 1] * 2 - 1) * 0.8 - gy_ * 5.0
    nz = np.ones_like(nx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5

    def save(name, rgb, noncolor):
        im = bpy.data.images.new(name, W_, H_, alpha=False, float_buffer=False)
        if noncolor:
            im.colorspace_settings.name = 'Non-Color'
        px = np.concatenate([np.clip(rgb, 0, 1), np.ones((H_, W_, 1))], -1).astype(np.float32)
        im.pixels.foreach_set(px.ravel())
        im.filepath_raw = os.path.join(RENDERS, name + '.png')
        im.file_format = 'PNG'
        im.save()
        return im
    # sRGB: el color se armó "a ojo" en lineal; lo pasamos a sRGB para la textura
    srgb = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.power(np.clip(col, 0, None), 1 / 2.4) - 0.055)
    a = save('banner_albedo', srgb, False)
    b = save('banner_normal', nrm, True)
    c = save('banner_mr', np.stack([np.ones_like(rough), rough, metal], -1), True)
    return a, b, c


def cloth_material(al, nr, mr):
    m = bpy.data.materials.new('banner_cloth'); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    ta = nt.nodes.new('ShaderNodeTexImage'); ta.image = al
    nt.links.new(ta.outputs['Color'], p.inputs['Base Color'])
    tm = nt.nodes.new('ShaderNodeTexImage'); tm.image = mr
    sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(tm.outputs['Color'], sp.inputs['Color'])
    nt.links.new(sp.outputs['Green'], p.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], p.inputs['Metallic'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nr
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    return m


def hardware(iron):
    parts = []
    rod = cyl('rod', (0, -OFF, 0.02), 0.02, RODW, iron, 16, rot=(0, math.radians(90), 0))
    parts.append(rod)
    for s in (-1, 1):
        # remate en punta de lanza
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.045, radius2=0, depth=0.16, location=(s * (RODW / 2 + 0.07), -OFF, 0.02), rotation=(0, s * math.radians(90), 0))
        c = bpy.context.active_object; c.data.materials.append(iron); parts.append(c)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.035, location=(s * (RODW / 2 - 0.01), -OFF, 0.02))
        b = bpy.context.active_object; b.data.materials.append(iron); parts.append(b)
        # ménsula: brazo desde la pared y un tornapuntas
        parts.append(cube('arm', (s * 0.72, -OFF / 2 - 0.01, 0.02), (0.035, OFF + 0.03, 0.035), iron, 0.004))
        brace = cube('brace', (s * 0.72, -OFF / 2, -0.12), (0.025, 0.025, 0.3), iron, 0.003, rot=(math.radians(-40), 0, 0))
        parts.append(brace)
        parts.append(cube('plate', (s * 0.72, -0.012, -0.05), (0.12, 0.024, 0.3), iron, 0.004))
    # anillas
    span = W * 0.84
    for r in range(RINGS):
        x = (r / (RINGS - 1) - 0.5) * span
        bpy.ops.mesh.primitive_torus_add(major_radius=0.034, minor_radius=0.006, major_segments=14, minor_segments=6, location=(x, -OFF, 0.0), rotation=(0, math.radians(90), 0))
        t = bpy.context.active_object; t.data.materials.append(iron); parts.append(t)
    h = join(parts, 'banner_rod')
    smooth(h, 35)
    box_uv(h, 0.5)
    return h


def main():
    reset()
    o, pins, idx = cloth_grid()
    drape(o)
    al, nr, mr = textures()
    o.data.materials.append(cloth_material(al, nr, mr))
    iron = pbr('iron', 'rusty_metal_02', '1k', rough=0.6, metal=1.0, scale=0.5)
    h = hardware(iron)
    for ob in (o, h):
        select([ob]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    print('paño y', round(min(v.y for v in vs), 3), round(max(v.y for v in vs), 3), 'z', round(min(v.z for v in vs), 3), round(max(v.z for v in vs), 3), 'tris', tris(o))
    export([o, h], 'banner', tex_res=1024)
    # revisión
    preview(os.path.join(RENDERS, 'banner_prev_front.png'), (1.2, -5.5, -1.8), (0, -0.2, -2.0), lens=40)
    preview(os.path.join(RENDERS, 'banner_prev_side.png'), (4.5, -3.0, -1.2), (0, -0.2, -2.0), lens=40)


main()
