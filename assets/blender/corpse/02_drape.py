"""2) Simula en Blender la sabana cayendo sobre el cuerpo (parte de la forma del cuerpo visto desde arriba y la deja acomodarse).
   blender -b --factory-startup -P 02_drape.py -- A 150 h5 '{"air":5,"damping":12,"bdamp":1.5,"dil":0.026,"sig":0.013,"LY":1.45,"CY":0.16,"yaw":5}'
   (lo mismo con B en lugar de A: la sabana sobre el cuerpo sentado)"""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from mathutils.bvhtree import BVHTree
A_ = sys.argv[sys.argv.index('--') + 1:]
state, frames, tag = A_[0], int(A_[1]), A_[2]
PR = dict(LX=2.65, LY=1.5, CX=-0.275, cell=0.025, quality=12, mass=0.2, air=1.5, tension=20, compression=20, shear=10, bending=1.2, damping=6, bdamp=0.8,
          dist=0.006, selfdist=0.005, friction=15, shrink=0.0, yaw=0, dil=0.04, sig=0.02, lift=0.006, smooth=2, gravity=9.81, CY=0.0)
if len(A_) > 3:
    PR.update(json.loads(A_[3]))
reset()
sc = bpy.context.scene
sc.render.fps = 24
sc.frame_start, sc.frame_end = 1, frames
sc.gravity = (0, 0, -PR['gravity'])
D = np.load(os.path.join(HERE, 'body_states.npz'))
V = D[state]; F = D['F']
if state == 'B' and 'rarm' in D.files:
    # sentada: el brazo derecho (que quedo colgando en una malla estatica aparte) no participa; solo su antebrazo y mano
    bad = D['rarm'] & ~D['hang']
    F = np.array([f for f in F if not bad[f].any()])
LX, LY, CX = PR['LX'], PR['LY'], PR['CX']
NX, NY = int(round(LX / PR['cell'])), int(round(LY / PR['cell']))
# ---- colision: cuerpo y mesa
body = mesh_obj('body', V, F)
bpy.context.view_layer.objects.active = body
bpy.ops.object.modifier_add(type='COLLISION')
body.collision.thickness_outer = 0.004; body.collision.thickness_inner = 0.002; body.collision.cloth_friction = PR['friction']
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.06)); table = bpy.context.active_object; table.scale = (2.4, 1.1, 0.12)
bpy.ops.object.modifier_add(type='COLLISION')
table.collision.thickness_outer = 0.002; table.collision.cloth_friction = 10
# ---- mapa de alturas del cuerpo visto desde arriba (rayos), con dilatacion y suavizado -> forma inicial de la sabana
tv = np.vstack([V, [[-3, -3, 0], [3, -3, 0], [3, 3, 0], [-3, 3, 0]]])
tf = [tuple(f) for f in F] + [(len(V), len(V) + 1, len(V) + 2), (len(V), len(V) + 2, len(V) + 3)]
tree = BVHTree.FromPolygons([tuple(v) for v in tv], tf)
R = 0.01
hx = np.arange(CX - LX / 2 - 0.25, CX + LX / 2 + 0.25, R); hy = np.arange(-LY / 2 - 0.25, LY / 2 + 0.25, R)
H = np.zeros((len(hx), len(hy)))
for i, x in enumerate(hx):
    for j, y in enumerate(hy):
        hit = tree.ray_cast((x, y, 3.0), (0, 0, -1))
        H[i, j] = hit[0][2] if hit[0] is not None else 0.0
H = np.maximum(H, 0)
# el borde de la mesa: afuera de la mesa la altura es 0 (la sabana cuelga)
def disc_max(a, rad):
    r = int(round(rad / R)); out = a.copy()
    for dx in range(-r, r + 1):
        for dy in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                out = np.maximum(out, np.roll(np.roll(a, dx, 0), dy, 1))
    return out
def gauss(a, sig):
    k = int(round(3 * sig / R)); xs_ = np.arange(-k, k + 1) * R; w = np.exp(-xs_ ** 2 / (2 * sig ** 2)); w /= w.sum()
    for ax in (0, 1):
        pad = np.pad(a, [(k, k) if a_ == ax else (0, 0) for a_ in (0, 1)], mode='edge')
        a = sum(w[t] * np.take(pad, np.arange(t, t + a.shape[ax]), axis=ax) for t in range(len(w)))
    return a
Hd = disc_max(H, PR['dil'])
Hs1 = gauss(Hd, PR['sig'])
Hs2 = gauss(disc_max(H, PR['dil'] + 0.02), PR['sig'] + 0.015)
wt = np.clip((Hd - 0.24) / 0.14, 0, 1)
Hs = Hs1 * (1 - wt) + np.minimum(Hs1, Hs2) * wt if False else Hs1 * (1 - wt) + Hs2 * wt
def sample(hm, x, y):
    fx = (x - hx[0]) / R; fy = (y - hy[0]) / R
    i0 = np.clip(np.floor(fx).astype(int), 0, len(hx) - 2); j0 = np.clip(np.floor(fy).astype(int), 0, len(hy) - 2)
    tx = np.clip(fx - i0, 0, 1); ty = np.clip(fy - j0, 0, 1)
    return (hm[i0, j0] * (1 - tx) * (1 - ty) + hm[i0 + 1, j0] * tx * (1 - ty) + hm[i0, j0 + 1] * (1 - tx) * ty + hm[i0 + 1, j0 + 1] * tx * ty)
xs = CX + (np.arange(NX + 1) / NX - 0.5) * LX
ys = (np.arange(NY + 1) / NY - 0.5) * LY
gx, gy = np.meshgrid(xs, ys, indexing='ij')
yw = math.radians(PR['yaw'])
rx = (gx - CX) * math.cos(yw) - gy * math.sin(yw) + CX
ry = (gx - CX) * math.sin(yw) + gy * math.cos(yw) + PR['CY']
zi = sample(Hs, rx, ry) + PR['lift']
ontable = (np.abs(rx) < 1.2) & (np.abs(ry) < 0.55)
zi = np.where(ontable, zi, PR['lift'])
zflat = np.full_like(gx, 0.62 if state == 'A' else 1.25)
Pinit = np.stack([rx, ry, zi], -1).reshape(-1, 3)
Pflat = np.stack([gx, gy, np.zeros_like(gx)], -1).reshape(-1, 3)
idx = lambda i, j: i * (NY + 1) + j
quads = [(idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)) for i in range(NX) for j in range(NY)]
me = bpy.data.meshes.new('sheet')
me.from_pydata([tuple(p) for p in Pinit], [], quads)
uv = me.uv_layers.new(name='UVMap')
u = ((gx - CX) / LX + 0.5).reshape(-1); v = (gy / LY + 0.5).reshape(-1)
for li, loop in enumerate(me.loops):
    uv.data[li].uv = (u[loop.vertex_index], v[loop.vertex_index])
for p in me.polygons: p.use_smooth = True
sheet = bpy.data.objects.new('sheet', me); sc.collection.objects.link(sheet)
bpy.context.view_layer.objects.active = sheet
sheet.shape_key_add(name='Basis', from_mix=False)
kf = sheet.shape_key_add(name='Flat', from_mix=False)
for i, p in enumerate(Pflat):
    kf.data[i].co = p
kf.value = 0.0
bpy.ops.object.modifier_add(type='CLOTH')
cl = sheet.modifiers['Cloth']
st = cl.settings
st.quality = PR['quality']; st.mass = PR['mass']; st.air_damping = PR['air']
st.tension_stiffness = PR['tension']; st.compression_stiffness = PR['compression']; st.shear_stiffness = PR['shear']; st.bending_stiffness = PR['bending']
st.tension_damping = PR['damping']; st.compression_damping = PR['damping']; st.shear_damping = PR['damping']; st.bending_damping = PR['bdamp']
st.rest_shape_key = kf
if PR['shrink']:
    st.shrink_min = PR['shrink']
cs = cl.collision_settings
cs.use_collision = True; cs.distance_min = PR['dist']; cs.collision_quality = 3
cs.use_self_collision = True; cs.self_distance_min = PR['selfdist']; cs.self_friction = 8
cl.point_cache.frame_start, cl.point_cache.frame_end = 1, frames
t0 = time.time(); prev = None
for f in range(1, frames + 1):
    sc.frame_set(f)
    if f % 15 == 0 or f == frames:
        cur = eval_verts(sheet)
        mv = 0 if prev is None else np.abs(cur - prev).max()
        prev = cur
        print(f'frame {f} t={time.time()-t0:.1f}s maxmove={mv:.4f} zmin={cur[:,2].min():.3f} zmax={cur[:,2].max():.3f}', flush=True)
final = eval_verts(sheet)
sc.frame_set(frames - 1); pen = eval_verts(sheet)
print('last-frame max move', np.abs(final - pen).max())
# alisado leve de la malla (quita el temblor de la simulacion)
Pf = final.reshape(NX + 1, NY + 1, 3).copy()
for _ in range(PR['smooth']):
    nb = (np.roll(Pf, 1, 0) + np.roll(Pf, -1, 0) + np.roll(Pf, 1, 1) + np.roll(Pf, -1, 1)) / 4
    nb[0] = Pf[0]; nb[-1] = Pf[-1]; nb[:, 0] = Pf[:, 0]; nb[:, -1] = Pf[:, -1]
    Pf = Pf + 0.35 * (nb - Pf)
final = Pf.reshape(-1, 3)
np.savez(os.path.join(HERE, f'sheet_{state}{tag}.npz'), P=final, NX=NX, NY=NY, LX=LX, LY=LY, CX=CX, uv=np.stack([u, v], -1), Pinit=Pinit)
# ---- vista previa: mostramos la hoja final (sin la simulacion) como malla estatica
sheet.modifiers.remove(cl)
sheet.shape_key_remove(kf); sheet.shape_key_remove(sheet.data.shape_keys.key_blocks[0])
for i, p in enumerate(final): sheet.data.vertices[i].co = p
sheet.data.update()
cam = setup_preview()
sheet.color = (0.85, 0.83, 0.78, 1); body.hide_render = True; table.color = (0.25, 0.15, 0.08, 1)
snap(cam, (1.5, -2.5, 1.7), (0, 0, 0.2), os.path.join(HERE, f'sh_{state}{tag}_side.png'))
snap(cam, (-2.7, -0.3, 1.6), (0, 0, 0.3), os.path.join(HERE, f'sh_{state}{tag}_head.png'))
snap(cam, (0.1, 0.1, 3.4), (0, 0, 0), os.path.join(HERE, f'sh_{state}{tag}_top.png'))
print('SIM_OK')
