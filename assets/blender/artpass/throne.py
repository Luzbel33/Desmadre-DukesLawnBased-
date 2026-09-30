"""El trono del Diablo (Búnker): respaldo alto con arco ojival y terciopelo capitoneado, dos pináculos góticos con
remates de oro, cuernos que salen de arriba, cresta con el pentagrama invertido, apoyabrazos que terminan en
calaveras (la del pase de arte) y patas con garras.
Materiales: madera del carro (cart.glb, oscurecida), hueso de la calavera (skull.glb), oro y terciopelo por código.
  blender -b --factory-startup -P throne.py      (o python con el módulo bpy)
Salida: public/assets/props/art/throne.glb (origen en el piso, al centro del asiento; frente -Y de Blender = +Z del
juego; el almohadón a 0.55 m)
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *
import numpy as np

SEAT = 0.55


def borrowed(glb, prefix):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, glb))
    new = [o for o in bpy.data.objects if o not in before]
    keep = None
    for o in new:
        if o.type == 'MESH' and o.name.startswith(prefix):
            keep = o
    for o in new:
        if o is not keep:
            bpy.data.objects.remove(o, do_unlink=True)
    return keep


def flat(name, rgb, rough, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*rgb, 1); p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    return m


def velvet_mat():
    n = 256
    y, x = np.mgrid[0:n, 0:n] / n
    # capitoné: rombos con sombra hacia los botones
    d = np.abs(((x + y) * 4) % 1 - 0.5) + np.abs(((x - y) * 4) % 1 - 0.5)
    shade = 0.55 + 0.45 * np.clip(d * 1.6, 0, 1)
    col = np.stack([0.32 * shade, 0.015 * shade, 0.03 * shade], -1)
    im = bpy.data.images.new('velvet_col', n, n, alpha=False)
    px = np.ones((n, n, 4), np.float32); px[:, :, :3] = col
    im.pixels.foreach_set(px.ravel()); im.pack()
    m = bpy.data.materials.new('velvet'); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = im
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.9
    try: p.inputs['Sheen Weight'].default_value = 0.8
    except Exception: pass
    return m


def mesh(name, verts, faces, mat):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    if mat: o.data.materials.append(mat)
    return o


def arch_outline(w, h_side, h_top, n=18):
    """contorno de un arco ojival (ancho w, laterales hasta h_side, punta en h_top), de abajo a la izquierda"""
    pts = [(-w / 2, 0), (w / 2, 0), (w / 2, h_side)]
    r = w  # arco de dos centros (equilátero estirado)
    for k in range(1, n):
        t = k / n
        # lado derecho: de (w/2, h_side) a (0, h_top)
        pts.append((w / 2 * (1 - t) ** 0.8 * (1 - 0.15 * t), h_side + (h_top - h_side) * math.sin(t * math.pi / 2)))
    pts.append((0, h_top))
    for k in range(n - 1, 0, -1):
        t = k / n
        pts.append((-w / 2 * (1 - t) ** 0.8 * (1 - 0.15 * t), h_side + (h_top - h_side) * math.sin(t * math.pi / 2)))
    pts.append((-w / 2, h_side))
    return pts


def extrude_outline(name, pts, depth, y0, z0, mat):
    """contorno en el plano XZ (x, z) extruido en Y desde y0 (hacia +Y, atrás)"""
    n = len(pts)
    v = [(x, y0, z0 + z) for x, z in pts] + [(x, y0 + depth, z0 + z) for x, z in pts]
    f = [list(range(n))[::-1], list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        f.append((i, j, n + j, n + i))
    o = mesh(name, v, f, mat)
    return o


def pyramid(name, cx, cy, z0, w, h, mat):
    v = [(cx - w, cy - w, z0), (cx + w, cy - w, z0), (cx + w, cy + w, z0), (cx - w, cy + w, z0), (cx, cy, z0 + h)]
    return mesh(name, v, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)], mat)


def horn(name, root, dirs, r0, mat, seg=12):
    pts = [Vector(root)]
    for d in dirs:
        pts.append(pts[-1] + Vector(d))
    v, f = [], []
    n = len(pts)
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        u = t.cross(Vector((0, 0, 1)))
        if u.length < 1e-3:
            u = Vector((1, 0, 0))
        u.normalize(); w = t.cross(u)
        r = r0 * (1 - i / n) + 0.004
        for k in range(seg):
            a = 2 * math.pi * k / seg
            v.append(p + (u * math.cos(a) + w * math.sin(a)) * r)
    for i in range(n - 1):
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            f.append((a, b, b + seg, a + seg))
    v.append(pts[-1] + (pts[-1] - pts[-2]) * 0.4)
    tip = len(v) - 1
    for k in range(seg):
        f.append(((n - 1) * seg + k, (n - 1) * seg + (k + 1) % seg, tip))
    return mesh(name, v, f, mat)


def star(name, cx, cy, cz, r, th, mat):
    """pentagrama invertido (punta abajo) como cinta: cinco trazos gruesos"""
    pts = [(cx + math.sin(math.pi + k * 2 * math.pi / 5) * r, cz + math.cos(math.pi + k * 2 * math.pi / 5) * r) for k in range(5)]
    objs = []
    for k in range(5):
        a, b = pts[k], pts[(k + 2) % 5]
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dz)
        nx, nz = -dz / L * th, dx / L * th
        v = [(a[0] + nx, cy, a[1] + nz), (b[0] + nx, cy, b[1] + nz), (b[0] - nx, cy, b[1] - nz), (a[0] - nx, cy, a[1] - nz)]
        v += [(x, cy + 0.03, z) for (x, _, z) in v]
        objs.append(mesh(f'{name}{k}', v, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], mat))
    return objs


def main():
    reset()
    wood_src = borrowed('cart.glb', 'cart_wood')
    wood = wood_src.data.materials[0]
    bpy.data.objects.remove(wood_src, do_unlink=True)
    # oscurecer la madera (ébano)
    p = wood.node_tree.nodes.get('Principled BSDF')
    for l in list(wood.node_tree.links):
        if l.to_node == p and l.to_socket.name == 'Base Color':
            mix = wood.node_tree.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0; mix.inputs['B'].default_value = (0.28, 0.2, 0.2, 1)
            wood.node_tree.links.new(l.from_socket, mix.inputs['A']); wood.node_tree.links.new(mix.outputs['Result'], p.inputs['Base Color'])
            break
    skull = borrowed('skull.glb', 'skull')
    bone = skull.data.materials[0]
    gold = flat('gold', (0.85, 0.6, 0.2), 0.28, 1.0)
    velvet = velvet_mat()
    parts = []

    # base del asiento con faldón y el arco tallado al frente
    parts.append(cube('base', (0, 0, 0.26), (1.3, 1.05, 0.46), wood, 0.02))
    parts.append(cube('plinth', (0, 0, 0.04), (1.42, 1.15, 0.08), wood, 0.015))
    front = extrude_outline('apron', arch_outline(0.7, 0.12, 0.3), 0.02, -0.545, 0.08, gold)
    parts.append(front)
    # almohadón capitoneado
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.03, SEAT - 0.04))
    cu = bpy.context.active_object; cu.name = 'cushion'; cu.scale = (1.12, 0.92, 0.14)
    apply_all(cu); md = cu.modifiers.new('sub', 'SUBSURF'); md.levels = 2; apply_all(cu)
    cu.data.materials.append(velvet); parts.append(cu)
    # respaldo: losa con arco ojival y panel de terciopelo adentro
    back = extrude_outline('back', arch_outline(1.3, 1.25, 2.05), 0.18, 0.36, SEAT - 0.05, wood)
    parts.append(back)
    panel = extrude_outline('panel', arch_outline(0.98, 1.05, 1.72), 0.03, 0.33, SEAT + 0.08, velvet)
    parts.append(panel)
    # botones de oro del capitoné
    for i in range(4):
        for j in range(3 - (i % 2)):
            x = (j - (1 - (i % 2) * 0.5)) * 0.26
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.018, location=(x, 0.325, SEAT + 0.35 + i * 0.27))
            b = bpy.context.active_object; b.data.materials.append(gold); parts.append(b)
    # pináculos a los costados: columna, capitel, aguja y bocha de oro
    for s in (-1, 1):
        x = s * 0.72
        parts.append(cube(f'col{s}', (x, 0.4, 1.3), (0.17, 0.17, 2.6), wood, 0.01))
        parts.append(cube(f'cap{s}', (x, 0.4, 2.62), (0.24, 0.24, 0.06), gold, 0.005))
        parts.append(pyramid(f'spire{s}', x, 0.4, 2.65, 0.11, 0.55, wood))
        for k in range(3):  # ganchitos (crochets) en la aguja
            bpy.ops.mesh.primitive_cone_add(radius1=0.025, depth=0.07, location=(x + s * 0.07 * (1 - k * 0.25), 0.4, 2.75 + k * 0.13), rotation=(0, s * 1.2, 0))
            c = bpy.context.active_object; c.data.materials.append(gold); parts.append(c)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05, location=(x, 0.4, 3.24))
        b = bpy.context.active_object; b.data.materials.append(gold); parts.append(b)
        # cuerno que sale del arco hacia afuera y arriba
        parts.append(horn(f'horn{s}', (s * 0.35, 0.45, SEAT + 1.75), [(s * 0.14, -0.02, 0.1), (s * 0.14, -0.04, 0.12), (s * 0.08, -0.06, 0.16), (s * -0.02, -0.05, 0.14), (s * -0.08, -0.02, 0.08)], 0.07, bone))
        # apoyabrazos: tablón curvo sobre una voluta, y la calavera en la punta
        parts.append(cube(f'arm{s}', (s * 0.66, -0.02, SEAT + 0.22), (0.14, 0.95, 0.08), wood, 0.02))
        parts.append(cube(f'armpost{s}', (s * 0.66, -0.38, SEAT + 0.05), (0.12, 0.12, 0.3), wood, 0.015))
        sk = skull.copy(); sk.data = skull.data.copy(); bpy.context.scene.collection.objects.link(sk)
        sk.location = (s * 0.66, -0.52, SEAT + 0.24); sk.scale = (0.75, 0.75, 0.75); sk.rotation_euler = (0, 0, math.pi)
        apply_all(sk); parts.append(sk)
        # patas con garras (bocha de oro + tres garras)
        for fy in (-0.45, 0.4):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.08, location=(s * 0.6, fy, 0.08))
            b = bpy.context.active_object; b.scale = (1, 1, 0.8); b.data.materials.append(gold); apply_all(b); parts.append(b)
            for k in (-1, 0, 1):
                a = k * 0.6 + (math.pi if fy > 0 else 0)
                bpy.ops.mesh.primitive_cone_add(radius1=0.028, depth=0.13, location=(s * 0.6 + math.sin(a) * 0.09, fy - math.cos(a) * 0.09, 0.04), rotation=(math.pi / 2 - 0.35, 0, -a))
                c = bpy.context.active_object; c.data.materials.append(bone); parts.append(c)
    bpy.data.objects.remove(skull, do_unlink=True)
    # cresta: aro de oro con el pentagrama invertido arriba del arco
    bpy.ops.mesh.primitive_torus_add(major_radius=0.2, minor_radius=0.022, location=(0, 0.35, SEAT + 2.22), rotation=(math.pi / 2, 0, 0))
    ring = bpy.context.active_object; ring.data.materials.append(gold); parts.append(ring)
    parts += star('star', 0, 0.335, SEAT + 2.22, 0.18, 0.014, gold)
    for o in parts:
        if o.data.materials and o.data.materials[0] in (wood, velvet):
            box_uv(o, 0.6)
    throne = join(parts, 'throne')
    select([throne]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
    smooth(throne, 35)
    export([throne], 'throne', tex_res=512, jpeg=82)
    if '--preview' in sys.argv:
        preview(os.path.join(AUTHOR, 'throne.png'), (2.2, -3.4, 2.0), (0, 0, 1.4), lens=40)


main()
