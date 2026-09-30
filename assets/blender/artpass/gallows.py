"""Horca: tarima de tablones sobre postes con cruces de San Andrés, escalera con baranda, trampilla con bisagras, poste
alto con travesaño y jabalcón, pernos de hierro. La soga (tres cabos torcidos) da dos vueltas al travesaño, baja y
termina en el nudo de verdugo (espiras) con el lazo abajo.
  blender -b --factory-startup -P gallows.py
Salidas: public/assets/props/art/gallows.glb (origen en el piso, centro de la tarima; la escalera mira a -Y de Blender =
+Z del juego). Nodo "noose" en el centro del lazo.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from art_common import *

RENDERS = os.path.join(SRC, 'renders')
DW, DD, DH = 2.8, 2.6, 1.55      # tarima: ancho (x), fondo (y), alto
UPX, UPY = -1.15, 0.95           # poste alto
BEAM_Z = 4.85                    # altura del travesaño
NOOSE_X = 0.45                   # donde cae la soga


def rope_mesh(name, pts, radius, mat, closed=False, twist=95.0):
    """Soga de tres cabos torcidos a lo largo de pts (lista de Vector)."""
    # centro suavizado (Catmull-Rom simple)
    def cr(p0, p1, p2, p3, t):
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
    P = [Vector(p) for p in pts]
    if closed:
        P = [P[-1]] + P + [P[0], P[1]]
    else:
        P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    dense = []
    for i in range(1, len(P) - 2):
        seg = (P[i + 1] - P[i]).length
        n = max(2, int(seg / 0.012))
        for k in range(n):
            dense.append(cr(P[i - 1], P[i], P[i + 1], P[i + 2], k / n))
    dense.append(P[-2])
    # marco a lo largo (transporte paralelo)
    T = [(dense[min(i + 1, len(dense) - 1)] - dense[max(i - 1, 0)]).normalized() for i in range(len(dense))]
    ref = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    Nn = T[0].cross(ref).normalized()
    frames = []
    for i, t in enumerate(T):
        if i:
            Nn = (Nn - t * Nn.dot(t)).normalized()
        B = t.cross(Nn).normalized()
        frames.append((Nn.copy(), B))
    import bmesh as _bm
    bm = _bm.new()
    L = 0.0
    sides = 6
    for strand in range(3):
        rings = []
        L = 0.0
        for i, c in enumerate(dense):
            if i:
                L += (dense[i] - dense[i - 1]).length
            n, b = frames[i]
            ang = L * twist + strand * 2 * math.pi / 3
            center = c + (n * math.cos(ang) + b * math.sin(ang)) * radius * 0.5
            ring = []
            for s in range(sides):
                a = 2 * math.pi * s / sides
                ring.append(bm.verts.new(center + (n * math.cos(a) + b * math.sin(a)) * radius * 0.55))
            rings.append(ring)
        for i in range(len(rings) - 1):
            for s in range(sides):
                bm.faces.new([rings[i][s], rings[i][(s + 1) % sides], rings[i + 1][(s + 1) % sides], rings[i + 1][s]])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    uvl = me.uv_layers.new(name='UVMap')
    for li, loop in enumerate(me.loops):
        v = me.vertices[loop.vertex_index].co
        uvl.data[li].uv = (v.x * 4 + v.y * 4, v.z * 4)
    o.data.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return o


def noose_curve():
    """Recorrido de la soga: vueltas al travesaño, caída, nudo (espiras) y lazo."""
    pts = []
    bz = BEAM_Z
    # dos vueltas alrededor del travesaño (eje X), avanzando un poco en x
    for k in range(30):
        a = 2 * math.pi * k / 15
        pts.append((NOOSE_X - 0.05 + k * 0.004, UPY - 0.0 + math.cos(a) * 0.13, bz + math.sin(a) * 0.13))
    # baja
    top = Vector((NOOSE_X + 0.07, UPY + 0.13, bz))
    knot_top = 3.05
    pts.append((NOOSE_X + 0.07, UPY + 0.02, bz - 0.25))
    pts.append((NOOSE_X + 0.06, UPY, 3.8))
    pts.append((NOOSE_X + 0.05, UPY, knot_top + 0.02))
    pts.append((NOOSE_X + 0.05, UPY, knot_top - 0.12))
    return pts, knot_top


def main():
    reset()
    wood = pbr('gal_wood', 'rough_wood', '1k', rough=0.88, scale=1.6, tint=(0.5, 0.42, 0.36), rot=math.radians(90))
    wood_v = pbr('gal_wood_v', 'rough_wood', '1k', rough=0.88, scale=1.6, tint=(0.5, 0.42, 0.36))
    iron = pbr('gal_iron', 'rusty_metal_02', '1k', rough=0.55, metal=1.0, scale=0.4, tint=(0.45, 0.4, 0.38))
    hemp = pbr('hemp', 'rough_linen', '1k', rough=0.95, scale=0.12, tint=(0.36, 0.27, 0.16))
    rnd = random.Random(13)
    H, V, I = [], [], []   # piezas horizontales (vetas en x), verticales, hierro
    # postes de la tarima (4 esquinas y 2 al medio)
    for x in (-DW / 2 + 0.1, 0, DW / 2 - 0.1):
        for y in (-DD / 2 + 0.1, DD / 2 - 0.1):
            V.append(cube('post', (x, y, DH / 2 - 0.05), (0.18, 0.18, DH - 0.1), wood_v, 0.015))
    # vigas bajo el piso
    for y in (-DD / 2 + 0.1, 0, DD / 2 - 0.1):
        H.append(cube('joist', (0, y, DH - 0.16), (DW, 0.12, 0.2), wood, 0.012))
    # piso de tablones a lo largo de y, con la trampilla bajo la soga
    n = 13
    for i in range(n):
        x = -DW / 2 + (i + 0.5) * DW / n
        o = cube(f'deck{i}', (x, 0, DH - 0.03 + rnd.uniform(0, 0.008)), (DW / n - 0.012, DD + 0.06, 0.06), wood_v, 0.006,
                 rot=(0, 0, rnd.uniform(-0.004, 0.004)))
        V.append(o)
    # cruces de San Andrés en los costados
    for y in (-DD / 2 + 0.1, DD / 2 - 0.1):
        for sx in (-1, 1):
            cx = sx * DW / 4
            ln = math.hypot(DW / 2 - 0.2, DH - 0.4)
            ang = math.atan2(DH - 0.4, DW / 2 - 0.2)
            for sg in (-1, 1):
                H.append(cube('xbrace', (cx, y + (0.1 if y > 0 else -0.1), DH / 2 - 0.1), (ln, 0.05, 0.11), wood, 0.008, rot=(0, sg * ang, 0)))
    # trampilla: marco de hierro y bisagras sobre el piso, bajo la soga
    tx, ty = NOOSE_X + 0.05, UPY
    for dx, dy, sx, sy in ((0, -0.45, 0.95, 0.03), (0, 0.45, 0.95, 0.03), (-0.46, 0, 0.03, 0.93), (0.46, 0, 0.03, 0.93)):
        I.append(cube('trap', (tx + dx, ty + dy, DH + 0.004), (sx, sy, 0.012), iron, 0.003))
    for dy in (-0.3, 0.3):
        I.append(cube('hinge', (tx - 0.46, ty + dy, DH + 0.01), (0.2, 0.05, 0.015), iron, 0.003))
    # escalera en el frente (-Y): largueros, peldaños y baranda
    steps = 7
    sx0 = 0.55
    run = 1.9
    for s in (-1, 1):
        x = sx0 + s * 0.42
        ln = math.hypot(run, DH)
        ang = math.atan2(DH, run)
        H.append(cube('stringer', (x, -DD / 2 - run / 2 + 0.05, DH / 2 - 0.05), (0.06, ln, 0.22), wood, 0.01, rot=(ang, 0, 0)))
        xr = x + s * 0.03
        V.append(cube('railpost', (xr, -DD / 2 - run + 0.15, 0.55), (0.07, 0.07, 1.1), wood_v, 0.008))
        V.append(cube('railpost2', (xr, -DD / 2 + 0.04, DH + 0.5), (0.07, 0.07, 1.0), wood_v, 0.008))
        p0 = Vector((xr, -DD / 2 - run + 0.15, 1.08)); p1 = Vector((xr, -DD / 2 + 0.04, DH + 0.98))
        d = p1 - p0
        H.append(cube('rail', tuple((p0 + p1) / 2), (0.05, d.length + 0.06, 0.07), wood, 0.008, rot=(math.atan2(d.z, d.y), 0, 0)))
    for k in range(steps):
        t = (k + 1) / (steps + 1)
        y = -DD / 2 - run + 0.05 + t * run
        z = t * DH
        H.append(cube('step', (sx0, y - 0.06, z - 0.02), (0.9, 0.24, 0.05), wood, 0.006))
    # poste alto (desde el piso), travesaño y jabalcón
    V.append(cube('upright', (UPX, UPY, BEAM_Z / 2 + 0.1), (0.24, 0.24, BEAM_Z + 0.2), wood_v, 0.02))
    blen = NOOSE_X - UPX + 0.45
    H.append(cube('beam', (UPX + blen / 2 - 0.05, UPY, BEAM_Z), (blen, 0.2, 0.22), wood, 0.02))
    bl = 1.2
    H.append(cube('knee', (UPX + 0.42, UPY, BEAM_Z - 0.42), (bl, 0.12, 0.13), wood, 0.012, rot=(0, math.radians(45), 0)))
    # pernos
    for p in ((UPX, UPY - 0.125, BEAM_Z), (UPX + 0.85, UPY - 0.105, BEAM_Z - 0.02), (UPX, UPY - 0.125, BEAM_Z - 0.85), (UPX, UPY - 0.125, DH - 0.1)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.025, depth=0.02, location=p, rotation=(math.radians(90), 0, 0))
        b = bpy.context.active_object; b.data.materials.append(iron); I.append(b)
    for o in H + V + I:
        apply_all(o)
    ho = join(H, 'gallows_h'); box_uv(ho, 1.6)
    vo = join(V, 'gallows_v'); box_uv(vo, 1.6)
    io = join(I, 'gallows_iron'); box_uv(io, 0.4)
    # soga
    pts, knot_top = noose_curve()
    rope = rope_mesh('rope', pts, 0.018, hemp)
    # nudo de verdugo: espiras alrededor de la soga doble
    coils = []
    kx, ky = NOOSE_X + 0.05, UPY
    for k in range(9 * 12 + 1):
        a = 2 * math.pi * k / 12
        coils.append((kx + math.cos(a) * 0.028, ky + math.sin(a) * 0.028, knot_top - k / (9 * 12) * 0.24))
    knot = rope_mesh('knot', coils, 0.016, hemp, twist=60)
    # lazo: círculo vertical abajo del nudo
    loop = []
    lr = 0.14
    lc = Vector((kx, ky, knot_top - 0.24 - lr + 0.02))
    for k in range(25):
        a = math.pi / 2 + 2 * math.pi * k / 24
        loop.append((lc.x + math.cos(a) * lr * 0.9, lc.y + math.sin(a) * 0.02, lc.z + math.sin(a) * lr))
    lo = rope_mesh('loop', loop, 0.017, hemp)
    ro = join([rope, knot, lo], 'gallows_rope')
    nd = bpy.data.objects.new('noose', None); bpy.context.scene.collection.objects.link(nd)
    nd.location = lc
    print('lazo', [round(c, 3) for c in lc], 'tris', tris(ho) + tris(vo) + tris(io) + tris(ro))
    for o in (ho, vo, io, ro):
        smooth(o, 35)
    export([ho, vo, io, ro, nd], 'gallows', tex_res=1024)
    preview(os.path.join(RENDERS, 'gallows_prev.png'), (4.0, -6.0, 3.4), (0, 0, 2.2), lens=32, w=900, h=900)
    preview(os.path.join(RENDERS, 'gallows_prev2.png'), (1.4, -0.6, 3.2), (NOOSE_X + 0.05, UPY, 2.9), lens=40, w=700, h=900)


main()
