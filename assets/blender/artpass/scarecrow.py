"""Espantapajaros del calabazar: poste con travesano atado, camisa leñadora rellena de paja (bultos, dobladillos
rotos, un parche cosido), pantalon de arpillera colgando, cinto de soga y paja que se escapa por los punos, el cuello,
la cintura y los tobillos. Aparte, el sombrero de bruja caido (cono doblado, ala ondulada, cinta).
La cabeza es la calabaza tallada del juego (c_jack): va encima, a 2.1 m, y gira sola (castle-decor.js).
Materiales: la paja del fardo y la madera del carro (haybale.glb / cart.glb de esta carpeta, ya horneados) y telas
pintadas por codigo (numpy).
  blender -b --factory-startup -P scarecrow.py      (o python con el modulo bpy)
Salidas: public/assets/props/art/scarecrow.glb (origen en el piso, al pie del poste; frente -Y de Blender = +Z del
juego) y scarecrow_hat.glb (origen en la base del sombrero).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *
import numpy as np

rng = random.Random(7)
nrng = np.random.default_rng(7)


# ---------------------------------------------------------------- materiales
def borrowed(glb, obj_name):
    """Material de otro modelo del pase de arte (con sus texturas horneadas)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, glb))
    new = [o for o in bpy.data.objects if o not in before]
    mat = None
    for o in new:
        if o.name.startswith(obj_name) and o.type == 'MESH' and o.data.materials:
            mat = o.data.materials[0]
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    return mat


def smooth_noise(h, w, cells, seed):
    g = np.random.default_rng(seed).random((cells + 1, cells + 1))
    ys, xs = np.linspace(0, cells, h, endpoint=False), np.linspace(0, cells, w, endpoint=False)
    y0, x0 = ys.astype(int), xs.astype(int)
    fy, fx = (ys - y0)[:, None], (xs - x0)[None, :]
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def image(name, rgb, noncolor=False):
    h, w, _ = rgb.shape
    im = bpy.data.images.new(name, w, h, alpha=False)
    if noncolor:
        im.colorspace_settings.name = 'Non-Color'
    px = np.ones((h, w, 4), np.float32)
    px[:, :, :3] = np.clip(rgb, 0, 1)
    im.pixels.foreach_set(px.ravel())
    im.pack()
    return im


def fabric_mat(name, rgb, rough=0.92):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = image(name + '_col', rgb)
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    return m


def plaid(n=512):
    """Franela a cuadros roja y negra, gastada y sucia (1 repeticion = 0.5 m)."""
    y, x = np.mgrid[0:n, 0:n] / n
    band = lambda v, k, w: (np.abs(((v * k) % 1) - 0.5) < w).astype(float)
    red = np.array([0.42, 0.07, 0.05]); blk = np.array([0.05, 0.04, 0.035]); lite = np.array([0.55, 0.16, 0.1])
    bx, by = band(x, 4, 0.22), band(y, 4, 0.22)
    thin = np.maximum(band(x, 8, 0.03), band(y, 8, 0.03))
    base = red[None, None] * (1 - bx[..., None] * 0.5) * (1 - by[..., None] * 0.5)
    base = base * (1 - (bx * by)[..., None] * 0.6) + blk[None, None] * (bx * by)[..., None] * 0.6
    base = base * (1 - thin[..., None] * 0.4) + lite[None, None] * thin[..., None] * 0.4
    weave = 0.9 + 0.1 * np.sin(x * n * np.pi) * np.sin(y * n * np.pi)
    dirt = smooth_noise(n, n, 6, 3)
    fade = 0.65 + 0.35 * smooth_noise(n, n, 3, 4)
    col = base * weave[..., None] * fade[..., None]
    col = col * (1 - dirt[..., None] * 0.45) + np.array([0.18, 0.14, 0.09]) * dirt[..., None] * 0.45
    return col


def burlap(n=512):
    """Arpillera: trama gruesa, manchas de barro."""
    y, x = np.mgrid[0:n, 0:n] / n
    k = 48
    wx = 0.5 + 0.5 * np.sin(x * k * 2 * np.pi); wy = 0.5 + 0.5 * np.sin(y * k * 2 * np.pi)
    weave = np.where((np.floor(x * k) + np.floor(y * k)) % 2 == 0, wx, wy)
    base = np.array([0.46, 0.36, 0.22])
    col = base * (0.72 + 0.28 * weave)[..., None]
    col *= (0.8 + 0.2 * smooth_noise(n, n, 10, 9))[..., None]
    mud = np.clip((smooth_noise(n, n, 5, 11) - 0.55) * 3, 0, 1)
    col = col * (1 - mud[..., None] * 0.6) + np.array([0.16, 0.12, 0.07]) * mud[..., None] * 0.6
    return col


def felt(n=256):
    col = np.array([0.06, 0.05, 0.05]) * (0.75 + 0.5 * smooth_noise(n, n, 12, 21))[..., None]
    return col + np.array([0.05, 0.045, 0.03]) * smooth_noise(n, n, 4, 22)[..., None]


def patch_cloth(n=256):
    y, x = np.mgrid[0:n, 0:n] / n
    base = np.array([0.23, 0.3, 0.42]) * (0.8 + 0.2 * smooth_noise(n, n, 8, 31))[..., None]
    stitch = ((np.minimum(np.minimum(x, 1 - x), np.minimum(y, 1 - y)) < 0.06) & (((x + y) * 24) % 1 < 0.5))
    return np.where(stitch[..., None], np.array([0.75, 0.7, 0.55]), base)


# ---------------------------------------------------------------- geometria
def mesh_obj(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if mat:
        o.data.materials.append(mat)
    return o


def tube(name, path, radii, mat, segs=14, lump=0.0, jag_start=0.0, jag_end=0.0, seed=0, flat=1.0):
    """Tubo a lo largo de path (lista de Vector) con radio por anillo; lump = bultos del relleno; jag_* = borde roto."""
    r = random.Random(seed)
    verts, faces = [], []
    n = len(path)
    up = Vector((0, 0, 1))
    for i, p in enumerate(path):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        side = t.cross(up)
        if side.length < 1e-4:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        nor = side.cross(t).normalized()
        for k in range(segs):
            a = 2 * math.pi * k / segs
            rr = radii[i] * (1 + lump * (r.random() - 0.5) * 2)
            off = side * math.cos(a) * rr + nor * math.sin(a) * rr * flat
            q = p + off
            # borde roto: los vertices del primer/ultimo anillo se corren a lo largo del tubo
            if i == 0 and jag_start:
                q = q + t * (r.random() * jag_start)
            if i == n - 1 and jag_end:
                q = q - t * (r.random() * jag_end)
            verts.append(q)
    for i in range(n - 1):
        for k in range(segs):
            a = i * segs + k; b = i * segs + (k + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    return mesh_obj(name, verts, faces, mat)


def strands(name, roots, mat, seed=0):
    """Pajas: cada una es una punta de tres caras (raiz, direccion, largo, grosor)."""
    r = random.Random(seed)
    verts, faces = [], []
    for (p, d, ln, th) in roots:
        d = d.normalized()
        side = d.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        nor = side.cross(d).normalized()
        tip = p + d * ln + Vector((0, 0, -ln * 0.25 * r.random()))
        base = len(verts)
        for k in range(3):
            a = 2 * math.pi * k / 3 + r.random()
            verts.append(p + (side * math.cos(a) + nor * math.sin(a)) * th)
        verts.append(tip)
        faces += [(base, base + 1, base + 3), (base + 1, base + 2, base + 3), (base + 2, base, base + 3)]
    return mesh_obj(name, verts, faces, mat)


def tuft(center, axis, spread, count, length, r, thick=0.006):
    out = []
    axis = axis.normalized()
    for _ in range(count):
        d = axis + Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1))) * spread
        p = center + Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1))) * 0.04
        out.append((p, d, length * r.uniform(0.55, 1.2), thick * r.uniform(0.7, 1.3)))
    return out


def main():
    reset()
    straw = borrowed('haybale.glb', 'haybale')
    wood = borrowed('cart.glb', 'cart_wood')
    shirt = fabric_mat('flannel', plaid())
    jute = fabric_mat('burlap', burlap())
    hatm = fabric_mat('felt', felt(), 0.95)
    patchm = fabric_mat('patch', patch_cloth())
    hemp = bpy.data.materials.new('hemp'); hemp.use_nodes = True
    hemp.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.2, 0.15, 0.08, 1)
    hemp.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
    r = random.Random(3)
    parts = []

    # poste y travesano (madera del carro), atados con soga
    post = cyl('post', (0, 0, 1.35), 0.065, 2.7, wood, verts=10, bev=0.01)
    bar = cyl('bar', (0, 0.02, 1.9), 0.05, 1.95, wood, verts=10, rot=(0, math.pi / 2, 0), bev=0.008)
    for o in (post, bar):
        apply_all(o); box_uv(o, 0.8)
    parts += [post, bar]
    for k in range(3):
        t = bpy.ops.mesh.primitive_torus_add(major_radius=0.075, minor_radius=0.012, location=(0, 0.01, 1.9), rotation=(math.pi / 2 + (k - 1) * 0.5, 0.6 * (k - 1), 0))
        o = bpy.context.active_object; o.name = 'lash%d' % k; o.data.materials.append(hemp); apply_all(o); parts.append(o)

    # camisa: torso relleno (bultos), faldon con borde roto; mangas sobre el travesano que cuelgan un poco
    tz = [2.0, 1.97, 1.92, 1.8, 1.6, 1.4, 1.22, 1.08]
    tr = [0.09, 0.2, 0.29, 0.3, 0.28, 0.26, 0.25, 0.27]
    torso = tube('shirt', [Vector((0, 0.03, z)) for z in tz], tr, shirt, segs=28, lump=0.025, jag_end=0.09, seed=1, flat=0.58)
    parts.append(torso)
    for s in (-1, 1):
        path = [Vector((s * x, 0.02, 1.9 - 0.05 * math.sin(x * 2.4) - (0.04 if x > 0.7 else 0))) for x in (0.16, 0.3, 0.45, 0.6, 0.74, 0.84)]
        sl = tube('sleeve%d' % s, path, [0.13, 0.11, 0.102, 0.1, 0.104, 0.115], shirt, segs=18, lump=0.03, jag_end=0.06, seed=5 + s)
        parts.append(sl)
    # parche cosido en el pecho
    pv = [Vector((-0.1, -0.135, 1.62)), Vector((0.04, -0.14, 1.63)), Vector((0.05, -0.137, 1.5)), Vector((-0.09, -0.132, 1.49))]
    pa = mesh_obj('patch', pv, [(0, 3, 2, 1)], patchm)
    pa.data.uv_layers.new(name='UVMap')
    for li, uv in zip(range(4), [(0, 1), (0, 0), (1, 0), (1, 1)]):
        pa.data.uv_layers[0].data[li].uv = uv
    parts.append(pa)

    # pantalon de arpillera: dos piernas colgando del faldon, con las botamangas rotas
    for s in (-1, 1):
        path = [Vector((s * 0.1, 0.03, 1.12)), Vector((s * 0.12, 0.04, 0.9)), Vector((s * 0.13, 0.06, 0.68)), Vector((s * 0.125, 0.08, 0.5))]
        parts.append(tube('leg%d' % s, path, [0.13, 0.105, 0.095, 0.1], jute, segs=18, lump=0.035, jag_end=0.07, seed=11 + s))
    # cinto de soga
    bpy.ops.mesh.primitive_torus_add(major_radius=0.25, minor_radius=0.02, location=(0, 0.03, 1.2))
    belt = bpy.context.active_object; belt.name = 'belt'; belt.scale = (1.02, 0.6, 1); belt.data.materials.append(hemp); apply_all(belt)
    parts.append(belt)

    # paja que se escapa
    roots = []
    roots += tuft(Vector((0, 0.02, 2.0)), Vector((0, 0, 1)), 0.9, 140, 0.16, r, 0.009)                 # cuello
    for s in (-1, 1):
        roots += tuft(Vector((s * 0.86, 0.02, 1.84)), Vector((s, 0, -0.5)), 0.7, 130, 0.22, r, 0.009)   # punos
        roots += tuft(Vector((s * 0.125, 0.08, 0.5)), Vector((0, 0, -1)), 0.6, 110, 0.22, r, 0.009)     # tobillos
    roots += tuft(Vector((0, -0.12, 1.1)), Vector((0, -0.4, -1)), 0.9, 90, 0.14, r, 0.008)            # cintura
    for k in range(40):                                                                         # entre los botones
        a = r.uniform(0, 2 * math.pi)
        roots.append((Vector((math.cos(a) * 0.28, 0.03 + math.sin(a) * 0.15, r.uniform(1.12, 1.9))), Vector((math.cos(a), math.sin(a), r.uniform(-0.6, 0.3))), r.uniform(0.04, 0.1), 0.005))
    hay = strands('straw', roots, straw, seed=9)
    box_uv(hay, 0.3)
    parts.append(hay)

    for o in parts:
        if o.name.startswith(('shirt', 'sleeve', 'leg')):
            box_uv(o, 0.5)
            smooth(o, 180)
    body = join(parts, 'scarecrow')
    # caras hacia afuera (los tubos se arman en cualquier sentido); el juego las dibuja de un solo lado
    select([body]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')

    # sombrero de bruja caido: ala ondulada + copa conica con la punta doblada + cinta
    hv, hf = [], []
    segs = 28
    rings = []
    for i, (h, rad) in enumerate([(0, 0.2), (0.08, 0.17), (0.18, 0.13), (0.27, 0.095), (0.35, 0.065), (0.42, 0.04), (0.47, 0.018)]):
        bend = max(0, h - 0.2) ** 1.6 * 1.9
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            ring.append(len(hv))
            hv.append(Vector((math.cos(a) * rad + bend, math.sin(a) * rad, h - bend * 0.35)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(segs):
            hf.append((rings[i][k], rings[i][(k + 1) % segs], rings[i + 1][(k + 1) % segs], rings[i + 1][k]))
    tipi = len(hv); hv.append(Vector((0.47 ** 0 * 0.52, 0, 0.33))); hf += [(rings[-1][k], rings[-1][(k + 1) % segs], tipi) for k in range(segs)]
    crown = mesh_obj('crown', hv, hf, hatm)
    bv, bf = [], []
    for j, rad in enumerate((0.19, 0.31, 0.42)):
        for k in range(segs):
            a = 2 * math.pi * k / segs
            wav = 0.025 * math.sin(a * 3 + 0.7) * j + (0.03 if j == 2 and math.cos(a) < -0.3 else 0) * j
            bv.append(Vector((math.cos(a) * rad, math.sin(a) * rad, -wav - 0.01 * j)))
    for j in range(2):
        for k in range(segs):
            bf.append((j * segs + k, j * segs + (k + 1) % segs, (j + 1) * segs + (k + 1) % segs, (j + 1) * segs + k))
    brim = mesh_obj('brim', bv, bf, hatm)
    sol = brim.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.012
    apply_all(brim)
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=0.172, depth=0.05, location=(0, 0, 0.05))
    band = bpy.context.active_object; band.name = 'band'; band.data.materials.append(patchm); apply_all(band)
    for o in (crown, brim, band):
        box_uv(o, 0.4)
    hat = join([crown, brim, band], 'scarecrow_hat')
    smooth(hat, 50)

    export([body], 'scarecrow', tex_res=512)
    select([hat])
    for o in list(bpy.data.objects):
        if o not in (hat,) and o.type == 'MESH' and o.name != 'scarecrow':
            pass
    export([hat], 'scarecrow_hat', tex_res=256)
    if '--preview' in sys.argv:
        hat.location = (0, 0.03, 2.35); hat.rotation_euler = (0.1, -0.25, 0.4)
        preview(os.path.join(AUTHOR, 'scarecrow.png'), (1.9, -2.6, 2.0), (0, 0, 1.4), lens=45)


main()
