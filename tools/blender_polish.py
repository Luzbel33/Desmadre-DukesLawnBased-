"""Reproducible Blender authoring. Real units, closed shells, UVs and GLB exports.
Run: blender -b --factory-startup -P tools/blender_polish.py
"""
import bpy, bmesh, math, random, json, sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/props/polish'
AUTHOR = ROOT / 'output/blender-polish'
SOURCE = ROOT.parent / 'assets/polish-source'
OUT.mkdir(parents=True, exist_ok=True); AUTHOR.mkdir(parents=True, exist_ok=True)
random.seed(2929)
report=[]

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system='METRIC'
    bpy.context.scene.render.engine='CYCLES'
    bpy.context.scene.cycles.samples=8
    bpy.context.scene.render.bake.margin=8

def material(name, color, rough=.8, metal=0, texture=None):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    if texture:
        for kind, socket in [('color','Base Color'),('rough','Roughness')]:
            path=ROOT/'public/assets/tex'/f'{texture}_{kind}.jpg'
            if not path.exists(): continue
            t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(str(path))
            if kind=='rough': t.image.colorspace_settings.name='Non-Color'
            m.node_tree.links.new(t.outputs['Color'], p.inputs[socket])
        path=ROOT/'public/assets/tex'/f'{texture}_normal.jpg'
        if path.exists():
            t=m.node_tree.nodes.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(str(path))
            t.image.colorspace_settings.name='Non-Color'
            normal=m.node_tree.nodes.new('ShaderNodeNormalMap')
            m.node_tree.links.new(t.outputs['Color'],normal.inputs['Color'])
            m.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])
    return m

def active(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o

def cube(name, location, dims, mat, bevel=.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location); o=bpy.context.object; o.name=name
    o.dimensions=dims; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if bevel:
        b=o.modifiers.new('Worn edges','BEVEL'); b.width=bevel; b.segments=2
        bpy.ops.object.modifier_apply(modifier=b.name)
        n=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL'); bpy.ops.object.modifier_apply(modifier=n.name)
    if mat.name=='Weathered dressed stone':
        uv=o.data.uv_layers.active.data
        for face in o.data.polygons:
            axis=max(range(3),key=lambda k:abs(face.normal[k]))
            axes=[k for k in range(3) if k!=axis]
            for li in face.loop_indices:
                co=o.matrix_world @ o.data.vertices[o.data.loops[li].vertex_index].co
                uv[li].uv=(co[axes[0]]/3.2,co[axes[1]]/3.2)
    return o

def export(name):
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for o in meshes:
        active(o); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.join(); body=bpy.context.object; body.name=name
    bm=bmesh.new(); bm.from_mesh(body.data); bmesh.ops.recalc_face_normals(bm,faces=bm.faces); bm.to_mesh(body.data); bm.free()
    # Keep texture coordinates on imported plants; generated props get a real UV unwrap.
    if not body.data.uv_layers:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(island_margin=.025); bpy.ops.object.mode_set(mode='OBJECT')
    # Apply modifiers before serializing; no aggressive decimation of holes or thin leaves.
    bpy.ops.wm.save_as_mainfile(filepath=str(AUTHOR/(name+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,
        export_yup=True,export_apply=True,export_image_format='AUTO',export_animations=False)
    tris=sum(len(p.vertices)-2 for p in body.data.polygons)
    report.append({'name':name,'triangles':tris,'bytes':(OUT/(name+'.glb')).stat().st_size})
    print('POLISH_EXPORTED',name,tris,flush=True)

def pumpkin(carved):
    clear()
    rind=material('Mottled ochre rind',(.36,.105,.018),.88)
    p=rind.node_tree.nodes.get('Principled BSDF'); nodes=rind.node_tree.nodes; links=rind.node_tree.links
    n=nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value=24; n.inputs['Detail'].default_value=3
    ramp=nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color=(.19,.039,.006,1); ramp.color_ramp.elements[1].color=(.65,.24,.025,1)
    links.new(n.outputs['Fac'],ramp.inputs[0]); links.new(ramp.outputs[0],p.inputs['Base Color'])
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,radius=1)
    shell=bpy.context.object; shell.name='Continuous lobed rind'
    for v in shell.data.vertices:
        a=math.atan2(v.co.y,v.co.x); factor=.435*(1+.095*math.cos(a*10))
        v.co.x*=factor; v.co.y*=factor; v.co.z=v.co.z*.32+.325
    shell.data.materials.append(rind)
    for f in shell.data.polygons:f.use_smooth=True
    if carved:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=1,location=(0,0,.325))
        inner=bpy.context.object; inner.scale=(.383,.383,.271)
        active(inner); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        active(shell); mod=shell.modifiers.new('Real hollow interior','BOOLEAN'); mod.operation='DIFFERENCE'; mod.object=inner
        bpy.ops.object.modifier_apply(modifier=mod.name); bpy.data.objects.remove(inner,do_unlink=True)
        for j,poly in enumerate([
            [(-.26,.39),(-.065,.4),(-.13,.53)],[(.065,.4),(.26,.39),(.13,.53)],
            [(-.065,.32),(.065,.32),(0,.405)],
            [(-.27,.245),(-.18,.12),(.16,.115),(.275,.25),(.11,.215),(.07,.15),(-.035,.17),(-.095,.235)]
        ]):
            N=len(poly); verts=[(x,y,z) for y in [-.65,-.12] for x,z in poly]
            faces=[tuple(range(N)),tuple(range(2*N-1,N-1,-1))]+[(i+N,(i+1)%N+N,(i+1)%N,i) for i in range(N)]
            me=bpy.data.meshes.new('Carving'); me.from_pydata(verts,[],faces); me.update()
            cut=bpy.data.objects.new('Opening',me); bpy.context.collection.objects.link(cut)
            bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
            active(shell); mod=shell.modifiers.new('Cut eye nose mouth','BOOLEAN'); mod.operation='DIFFERENCE'; mod.object=cut
            bpy.ops.object.modifier_apply(modifier=mod.name); bpy.data.objects.remove(cut,do_unlink=True)
    # Bake the procedural color to an exported texture; glTF does not carry Noise nodes.
    active(shell); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(island_margin=.025); bpy.ops.object.mode_set(mode='OBJECT')
    image=bpy.data.images.new('pumpkin-rind',width=512,height=512)
    t=nodes.new('ShaderNodeTexImage'); t.image=image; nodes.active=t
    bpy.context.scene.render.bake.use_pass_direct=False; bpy.context.scene.render.bake.use_pass_indirect=False
    bpy.ops.object.bake(type='DIFFUSE'); links.new(t.outputs['Color'],p.inputs['Base Color']); image.pack()
    stem=material('Dry twisted stem',(.14,.11,.045),.95)
    bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=.045,radius2=.027,depth=.135,location=(.018,0,.705))
    o=bpy.context.object; o.rotation_euler=(.18,-.27,.2); o.data.materials.append(stem)
    export('jack' if carved else 'pumpkin')

def bowl():
    clear(); iron=material('Oxidised cast iron',(.065,.05,.038),.8,.5)
    # Outer bottom -> outer lip -> inner lip -> inner bowl -> inner bottom.
    profile=[(0,.015),(.34,.015),(.54,.12),(.7,.36),(.72,.42),(.69,.445),(.65,.41),(.59,.26),(.44,.13),(0,.115)]
    N=64; verts=[]
    for r,z in profile:
        verts += [(math.cos(i*2*math.pi/N)*r,math.sin(i*2*math.pi/N)*r,z) for i in range(N)]
    faces=[]
    for j in range(len(profile)-1):
        for i in range(N): faces.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
    me=bpy.data.meshes.new('Thick cast bowl'); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new('Brazier complete interior',me); bpy.context.collection.objects.link(o); o.data.materials.append(iron)
    for p in me.polygons:p.use_smooth=True
    coal=material('Charcoal',(.018,.014,.01),1)
    for i in range(13):
        a=i*2.399;r=.11+.32*((i%4)/3)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.1,location=(r*math.cos(a),r*math.sin(a),.23))
        bpy.context.object.scale=(1,.7,.65); bpy.context.object.data.materials.append(coal)
    export('brazier')

def facade():
    clear(); stone=material('Weathered dressed stone',(.7,.7,.66),.95,texture='castle_wall_varriation')
    # Facade overlay stays within the existing keep. Blender -Y faces the courtyard (glTF +Z).
    for x in [-23.9,-16.5,-8.6,8.6,16.5,23.9]:
        for z,w,d,h in [(1.0,1.5,1.1,2.0),(4.1,1.18,.8,4.2),(8.5,.92,.58,4.6),(12.5,.72,.4,3.4)]:
            cube('Stepped buttress', (x,-d/2,z),(w,d,h),stone,.055)
        for z in [2.03,6.24,10.83,14.23]:cube('Buttress coping',(x,-.48,z),(1.5,.98,.16),stone,.04)
    for z in [3.4,9.7,15.9]:
        # Entrance clearance: do not cross the doorway or its pointed arch.
        for x in [-14.35,14.35]:cube('String course',(x,-.17,z),(19.5,.35,.2),stone,.03)
    # Deep reveals and individually bevelled lintels on existing front windows.
    for x,z,h,w in [(x,6.8,3.6,1.5) for x in [-20.5,-12.5,-5,5,12.5,20.5]]+[(x,12.8,3.2,1.3) for x in [-17.3,17.3]]+[(x,12.8,3.6,1.6) for x in [-5,5]]:
        for side in [-1,1]:cube('Window jamb',(x+side*(w/2+.17),-.09,z),(.28,.38,h+.2),stone,.025)
        cube('Drip hood',(x,-.22,z+h/2+.19),(w+.7,.54,.21),stone,.045)
    export('keep-facade')

def plants():
    for name in ['fern_02','periwinkle_plant','rock_moss_set_01']:
        clear(); bpy.ops.import_scene.gltf(filepath=str(SOURCE/name/(name+'_1k.gltf')))
        print('SOURCE_MESHES',name,[(o.name,len(o.data.vertices)) for o in bpy.context.scene.objects if o.type=='MESH'],flush=True)
        meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
        chosen=min(meshes,key=lambda o:len(o.data.vertices))
        for o in meshes:
            if o!=chosen:bpy.data.objects.remove(o,do_unlink=True)
        # Each source is a catalogue of variants; export one plant/rock, not the catalogue layout.
        active(chosen); bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        corners=[chosen.matrix_world@Vector(c) for c in chosen.bound_box]
        lo=Vector(tuple(min(p[k] for p in corners) for k in range(3)))
        hi=Vector(tuple(max(p[k] for p in corners) for k in range(3)))
        chosen.location-=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
        bpy.ops.object.transform_apply(location=True,rotation=False,scale=False)
        for image in bpy.data.images:
            if max(image.size)>1024:
                w,h=image.size;k=1024/max(w,h);image.scale(int(w*k),int(h*k))
        export(name)

def gate_relief():
    clear();stone=material('Weathered dressed stone',(.7,.7,.66),.95,texture='stone_wall_04')
    def arc(span,spring,apex,n=12):
        h=span/2;a=apex-spring;r=(h*h+a*a)/(2*h);c=h-r;th=math.acos(-c/r)
        return [(-c+r*math.cos(math.pi-i/n*th),spring+r*math.sin(math.pi-i/n*th)) for i in range(n+1)]+[(c+r*math.cos(th-i/n*th),spring+r*math.sin(th-i/n*th)) for i in range(1,n+1)]
    outer=arc(7.4,4,8.6);inner=arc(6.4,4,7.9)
    # Individual masonry wedges with mortar joints and bevelled visible edges.
    for i in range(len(outer)-1):
        quad=[outer[i],outer[i+1],inner[i+1],inner[i]]
        cx=sum(p[0] for p in quad)/4;cz=sum(p[1] for p in quad)/4
        quad=[(cx+(x-cx)*.95,cz+(z-cz)*.98) for x,z in quad]
        verts=[(x,y,z) for y in [-.51,-.17] for x,z in quad]
        faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        me=bpy.data.meshes.new('Voussoir');me.from_pydata(verts,[],faces);me.update()
        ob=bpy.data.objects.new('Arch stone',me);bpy.context.collection.objects.link(ob);ob.data.materials.append(stone)
        active(ob);bevel=ob.modifiers.new('Chipped stone edge','BEVEL');bevel.width=.025;bevel.segments=2;bpy.ops.object.modifier_apply(modifier=bevel.name)
        uv=me.uv_layers.new(name='UVMap')
        for loop in me.loops: uv.data[loop.index].uv=(me.vertices[loop.vertex_index].co.x/3.4,me.vertices[loop.vertex_index].co.z/3.4)
    for s in [-1,1]:
        for j in range(5):cube('Portal jamb',(s*3.46,-.36,.4+j*.8),(.49,.48,.76),stone,.025)
        for j in range(11):cube('Gate pier course',(s*4.7,-.3,.6+j*1.12),(.68,.57,1.08),stone,.035)
        cube('Pier base',(s*4.7,-.4,.28),(.97,.8,.56),stone,.045)
        cube('Pier capital',(s*4.7,-.38,12.48),(.94,.74,.22),stone,.035)
    export('gate-relief')

def vine_leaf():
    # Keep a complete curved leaf and its scanned UVs; discard the pot and catalogue.
    clear(); bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/assets/props/potted_plant_02.glb'))
    ob=next(o for o in bpy.context.scene.objects if o.name.endswith('_leaves'))
    for o in list(bpy.context.scene.objects):
        if o!=ob:bpy.data.objects.remove(o,do_unlink=True)
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    seen=set();parts=[]
    for v in bm.verts:
        if v in seen:continue
        todo=[v];verts=set()
        while todo:
            k=todo.pop()
            if k in verts:continue
            verts.add(k);todo.extend(e.other_vert(k) for e in k.link_edges)
        seen.update(verts);faces={f for k in verts for f in k.link_faces}
        parts.append((sum(f.calc_area() for f in faces),verts,faces))
    _,keep,faces=max(parts,key=lambda p:p[0])
    n=sum((f.normal*f.calc_area() for f in faces),Vector()).normalized()
    import numpy as np
    coords=np.array([tuple(v.co) for v in keep]);_,axes=np.linalg.eigh(np.cov(coords.T))
    up=Vector(axes[:,-1]);up=(up-n*up.dot(n)).normalized()
    if up.z<0:up=-up
    right=n.cross(up).normalized();center=sum((v.co for v in keep),Vector())/len(keep)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v not in keep],context='VERTS')
    for v in bm.verts:
        p=v.co-center;v.co=Vector((p.dot(right),-p.dot(n),p.dot(up)))
    low=min(v.co.z for v in bm.verts)
    for v in bm.verts:v.co.z-=low
    bm.to_mesh(ob.data);bm.free();ob.location=(0,0,0);ob.rotation_euler=(0,0,0);ob.scale=(1,1,1)
    for img in bpy.data.images:
        if max(img.size)>1024:
            w,h=img.size;k=1024/max(w,h);img.scale(int(w*k),int(h*k))
    export('vine-leaf')

if '--jack-only' in sys.argv: pumpkin(True)
elif '--plants-only' in sys.argv: plants()
elif '--facade-only' in sys.argv: facade()
elif '--gate-only' in sys.argv: gate_relief()
elif '--leaf-only' in sys.argv: vine_leaf()
else: pumpkin(False); pumpkin(True); bowl(); facade(); gate_relief(); plants();vine_leaf()
(AUTHOR/'report.json').write_text(json.dumps(report,indent=2))
print('POLISH_COMPLETE',flush=True)
