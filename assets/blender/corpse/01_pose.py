"""1) Posa el cuerpo de Eric (solo de molde de colision): acostado (A) y sentado (B), con el brazo derecho colgando de la mesa.
   blender -b --factory-startup -P 01_pose.py"""
import sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
reset()
arm, body = load_body()
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
THICK = float(os.environ.get('CORPSE_THICK', '1.12'))
SHIFT_Y = float(os.environ.get('CORPSE_SHIFTY', '-0.10'))   # el cuerpo corrido hacia el borde -Y de la mesa (por ahi cuelga el brazo)
DANGLE = os.environ.get('CORPSE_DANGLE', '1') == '1'

def pose_A():
    reset_pose(arm)
    # brazo izquierdo (lado +Y): pegado al cuerpo (el modelo viene con los brazos abiertos a 45 grados)
    rot_bone(arm, 'upperarm_l', Y, +30)
    if DANGLE:
        # brazo derecho (lado -Y, hacia el borde de la mesa): sale hacia afuera y el antebrazo cuelga; los dedos apuntan al piso
        aim_bone(arm, 'upperarm_r', 'lowerarm_r', (0.10, -0.94, -0.33))
        aim_bone(arm, 'lowerarm_r', 'hand_r', (0.10, -0.06, -0.99))
    else:
        rot_bone(arm, 'upperarm_r', Y, -30)
    # piernas apenas abiertas y pies caidos hacia afuera
    rot_bone(arm, 'upperleg_l', Y, -5); rot_bone(arm, 'upperleg_r', Y, +5)
    rot_bone(arm, 'foot_l', X, +24); rot_bone(arm, 'foot_r', X, +28)
    rot_bone(arm, 'foot_l', Z, +18); rot_bone(arm, 'foot_r', Z, -15)
    # cabeza girada y ladeada
    rot_bone(arm, 'neck', Z, +14); rot_bone(arm, 'head', Z, +12); rot_bone(arm, 'head', Y, +7)

def pose_B():
    pose_A()
    # se incorpora: la columna se dobla hacia adelante (flexion = giro + alrededor de X) y la cabeza cae
    rot_bone(arm, 'spine_01', X, +52, about='hip'); rot_bone(arm, 'spine_02', X, +24); rot_bone(arm, 'spine_03', X, +16)
    rot_bone(arm, 'neck', X, +8); rot_bone(arm, 'head', X, +24)
    # el brazo izquierdo cuelga un poco hacia adelante (si no, queda dentro de la mesa)
    rot_bone(arm, 'upperarm_l', X, +40)
    rot_bone(arm, 'lowerarm_l', X, +36)
    if not DANGLE:
        rot_bone(arm, 'upperarm_r', X, +30); rot_bone(arm, 'lowerarm_r', X, +30)

arm.matrix_world = lying_matrix()
bpy.context.view_layer.update()
dom = dominant_groups(body)
core = np.array([bool(re.match(r'^(hip|spine|neck|head|upperleg|lowerleg)', d)) for d in dom])
rarm = np.array([bool(re.match(r'^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky|shoulder).*_r$', d)) for d in dom])
pose_A(); VA = eval_verts(body)
pose_B(); VB = eval_verts(body)
print('verts', len(VA), 'core', int(core.sum()), 'right arm', int(rarm.sum()))
# apoyo: percentil 3 de z del nucleo del cuerpo en el estado A; centrado en X por el nucleo, en Y por la cadera
zlow = np.percentile(VA[core, 2], 3)
xc = (np.percentile(VA[core, 0], 0.5) + np.percentile(VA[core, 0], 99.5)) / 2
hipmask = core & np.array([d in ('hip', 'spine_01') for d in dom])
ycen = float(np.median(VA[hipmask, 1]))
off = np.array([-xc, -ycen + SHIFT_Y, -zlow + 0.004])
VA = VA + off; VB = VB + off
# el cuerpo un poco mas grueso (se lee mejor bajo la sabana); el antebrazo que cuelga no se toca
hang = rarm & (VA[:, 1] < -0.5) if DANGLE else np.zeros(len(VA), bool)
thick_mask = ~hang
VA[thick_mask, 2] *= THICK; VB[thick_mask, 2] *= THICK
if DANGLE:
    # en el estado sentado el brazo derecho queda colgando donde estaba (es una malla estatica aparte)
    VB[rarm] = VA[rarm]
print('offset', off.round(3), 'A x-range', VA[core, 0].min().round(3), VA[core, 0].max().round(3), 'A zmax', VA[core, 2].max().round(3), 'B zmax', VB[core, 2].max().round(3), 'B core zmin', VB[core, 2].min().round(3))
if DANGLE:
    print('hang verts', int(hang.sum()), 'lowest z', VA[hang, 2].min().round(3), 'y range', VA[hang, 1].min().round(3), VA[hang, 1].max().round(3), 'x range', VA[hang, 0].min().round(3), VA[hang, 0].max().round(3))
allf = [tuple(p.vertices) for p in body.data.polygons]
F = np.array([f[:3] for f in allf])
np.savez(os.path.join(HERE, 'body_states.npz'), A=VA, B=VB, core=core, dom=np.array(dom), F=F, hang=hang, rarm=rarm)
print('polys', len(allf), 'tris', sum(1 for f in allf if len(f) == 3))
bpy.data.objects.remove(body, do_unlink=True); bpy.data.objects.remove(arm, do_unlink=True)
cam = setup_preview()
oa = mesh_obj('A', VA, F, (0.8, 0.7, 0.6, 1))
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -0.06)); t = bpy.context.active_object; t.scale = (2.4, 1.1, 0.12); t.color = (0.25, 0.15, 0.08, 1)
snap(cam, (1.4, -2.4, 1.6), (0, -0.1, 0.05), os.path.join(HERE, 'prev_A_side.png'))
snap(cam, (-2.6, -0.2, 1.5), (0, -0.1, 0.05), os.path.join(HERE, 'prev_A_head.png'))
snap(cam, (0.0, -2.2, 0.35), (0, -0.4, -0.1), os.path.join(HERE, 'prev_A_front.png'))
oa.hide_render = True
ob_ = mesh_obj('B', VB, F, (0.8, 0.7, 0.6, 1))
snap(cam, (1.4, -2.4, 1.6), (-0.3, 0, 0.4), os.path.join(HERE, 'prev_B_side.png'))
snap(cam, (-2.6, -0.2, 1.5), (-0.3, 0, 0.4), os.path.join(HERE, 'prev_B_head.png'))
print('PREV_OK')
