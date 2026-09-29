"""Cadaver de la mesa de carniceria: herramientas comunes (ver LEEME.txt)."""
import bpy, math, numpy as np, os, sys
from mathutils import Vector, Matrix

SRC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(SRC, '..', '..', '..'))
HERE = os.environ.get('CORPSE_WORK') or os.path.join(SRC, 'work')   # aca quedan los intermedios (npz, png, glb)
os.makedirs(HERE, exist_ok=True)
ERIC = os.path.join(ROOT, 'public', 'assets', 'chars', 'eric.glb')   # solo se usa de molde (y su antebrazo/mano)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def load_body():
    bpy.ops.import_scene.gltf(filepath=ERIC)
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
    body = [o for o in bpy.data.objects if o.type == 'MESH' and o.name == 'Body'][0]
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name != 'Body':
            bpy.data.objects.remove(o, do_unlink=True)
    return arm, body

def rot_bone(arm, name, axis, deg, pivot='head', about=None):
    # rota un hueso alrededor de un eje del espacio del esqueleto (X lateral, Y adelante/atras, Z arriba)
    pb = arm.pose.bones[name]
    bpy.context.view_layer.update()
    m = pb.matrix.copy()
    p = pb.head.copy() if pivot == 'head' else pb.tail.copy()
    if about is not None:
        p = arm.pose.bones[about].head.copy()
    R = Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-p)
    pb.matrix = R @ m
    bpy.context.view_layer.update()

def aim_bone(arm, name, child, dir_world):
    # gira un hueso (por su cabeza) hasta que la direccion hacia el hueso hijo apunte a dir_world (espacio del mundo)
    pb = arm.pose.bones[name]; cb = arm.pose.bones[child]
    bpy.context.view_layer.update()
    d_arm = (arm.matrix_world.to_3x3().inverted() @ Vector(dir_world)).normalized()
    cur = (cb.head - pb.head).normalized()
    R = cur.rotation_difference(d_arm).to_matrix().to_4x4()
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ R @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()

def reset_pose(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()

def eval_verts(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    n = len(me.vertices)
    a = np.empty(n * 3, dtype=np.float64)
    me.vertices.foreach_get('co', a)
    a = a.reshape(n, 3)
    M = np.array(obj.matrix_world)
    out = a @ M[:3, :3].T + M[:3, 3]
    ev.to_mesh_clear()
    return out

def dominant_groups(body):
    names = {g.index: g.name for g in body.vertex_groups}
    dom = []
    for v in body.data.vertices:
        best, bw = None, 0.0
        for g in v.groups:
            if g.weight > bw:
                bw, best = g.weight, names.get(g.group)
        dom.append(best or '')
    return dom

def lying_matrix():
    # de pie (cara hacia -Y, arriba +Z) a acostado boca arriba con la cabeza hacia -X
    return Matrix.Rotation(math.radians(90), 4, 'Z') @ Matrix.Rotation(math.radians(-90), 4, 'X')

def setup_preview(w=900, h=560):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'OBJECT'
    sc.display.shading.show_cavity = True
    sc.display.shading.cavity_type = 'BOTH'
    sc.display.shading.show_shadows = True
    w0 = bpy.data.worlds.new('w'); w0.color = (0.08, 0.08, 0.1); sc.world = w0
    cam = bpy.data.cameras.new('cam'); cam.lens = 35
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    return co

def snap(cam, loc, target, path):
    cam.location = Vector(loc)
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

def mesh_obj(name, verts, faces, color=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if color:
        ob.color = color
    return ob
