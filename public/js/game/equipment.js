// Visible held items. These are presentation meshes, not a dual-hand physics system.
import * as THREE from 'three';

function labelTexture(title, subtitle, background) {
  if (typeof document === 'undefined') return null; // geometry-only tests
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const c=canvas.getContext('2d');c.fillStyle=background;c.fillRect(0,0,512,256);
  c.strokeStyle='#d9c89d';c.lineWidth=5;c.strokeRect(10,10,492,236);
  c.fillStyle='#f2ecd9';c.textAlign='center';c.font='bold 46px Georgia, serif';c.fillText(title,256,112);
  c.font='18px Arial, sans-serif';c.fillText(subtitle,256,161);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;return tex;
}
function mesh(geo,material,x=0,y=0,z=0){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
function cylinder(radius,height,material,y=0){return mesh(new THREE.CylinderGeometry(radius,radius,height,32),material,0,y);}
export function createEquippedModel(slot){
  const group=new THREE.Group();group.name=`equipped-${slot}`;
  const metal=new THREE.MeshStandardMaterial({color:0xb9b9ac,metalness:.8,roughness:.32});
  if(slot===1){
    const profile=[[0,-.105],[.028,-.105],[.032,-.095],[.033,.065],[.030,.089],[.014,.125],[.012,.18],[.015,.184],[.015,.191],[.010,.193]].map(([r,y])=>new THREE.Vector2(r,y));
    const glass=new THREE.MeshPhysicalMaterial({color:0x29491c,roughness:.17,metalness:.05,clearcoat:1,clearcoatRoughness:.12});
    group.add(mesh(new THREE.LatheGeometry(profile,40),glass));
    const tex=labelTexture('DESMADRE','MALTA  ·  330 mL','#26382b');
    group.add(cylinder(.0337,.115,new THREE.MeshStandardMaterial({map:tex,color:0xf3f0da,roughness:.83}),-.002));
    group.add(cylinder(.0158,.011,metal,.19));
    // Small highlights for condensation, baked into one instanced draw.
    const water=new THREE.MeshPhysicalMaterial({color:0xb4cdaa,roughness:.08,metalness:.08,transparent:true,opacity:.55,clearcoat:1});
    const drops=new THREE.InstancedMesh(new THREE.SphereGeometry(1,5,4),water,35);const o=new THREE.Object3D();
    for(let i=0;i<35;i++){const a=i*2.399963,y=-.085+(i%9)*.018;o.position.set(Math.sin(a)*.034,y,Math.cos(a)*.034);o.scale.set(.0008+(i%3)*.0003,.0016,.0009);o.updateMatrix();drops.setMatrixAt(i,o.matrix);}group.add(drops);
  } else if(slot===2){
    const paper=new THREE.MeshStandardMaterial({color:0xe9ddbc,roughness:1});
    const tobacco=new THREE.MeshStandardMaterial({color:0x9d703a,roughness:1});
    const ember=new THREE.MeshStandardMaterial({color:0x68260b,emissive:0xff3d08,emissiveIntensity:.65,roughness:1});
    const stick=new THREE.Group();stick.rotation.x=Math.PI/2;
    stick.add(cylinder(.005,.07,paper,.036));stick.add(cylinder(.0052,.018,tobacco,-.008));
    stick.add(cylinder(.0053,.006,new THREE.MeshStandardMaterial({color:0x7a756c,roughness:1}),.074));
    const coal=cylinder(.0048,.003,ember,.078);coal.name='ember';stick.add(coal);group.add(stick);
  } else if(slot===3){
    const tex=labelTexture('TRAZO','PINTURA  ·  400 mL','#292b30');
    group.add(cylinder(.033,.165,new THREE.MeshStandardMaterial({map:tex,color:0xf3f3e9,metalness:.25,roughness:.45}),.023));
    group.add(mesh(new THREE.SphereGeometry(.033,32,12,0,Math.PI*2,0,Math.PI/2),metal,0,.107));
    group.add(cylinder(.033,.009,metal,-.062));
    const cap=new THREE.MeshStandardMaterial({color:0xeeeee5,roughness:.48});
    group.add(cylinder(.011,.018,cap,.143));
    const nozzle=mesh(new THREE.CylinderGeometry(.0028,.0028,.014,12),new THREE.MeshStandardMaterial({color:0x202020}),0,.143,.009);nozzle.rotation.x=Math.PI/2;group.add(nozzle);
  }
  return group;
}
export class EquipmentView {
  constructor(scene){this.scene=scene;this.group=null;this.slot=0;}
  update(char,slot,yaw,action,actionT=0,hidden=false){
    const desired=hidden||![1,2,3].includes(slot)?0:slot;
    if(desired!==this.slot){this.dispose();this.slot=desired;if(desired){this.group=createEquippedModel(desired);this.scene.add(this.group);}}
    if(!this.group)return;
    char.root.updateWorldMatrix(true,true);char.handR.getWorldPosition(this.group.position);
    this.group.rotation.set(0,yaw,0,'YXZ');
    if(action==='drink'&&slot===1)this.group.rotateX(-1.3*Math.sin(Math.min(1,actionT/1.7)*Math.PI));
    if(slot===2){this.group.position.y+=.018;const ember=this.group.getObjectByName('ember');if(ember)ember.material.emissiveIntensity=action==='smoke'?2:.65;}
    if(slot===3&&action==='spray')this.group.rotateX(-.15);
  }
  dispose(){
    if(this.group){const geos=new Set(),mats=new Set(),maps=new Set();this.group.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[]){mats.add(m);if(m.map)maps.add(m.map);}});this.group.removeFromParent();for(const g of geos)g.dispose();for(const m of mats)m.dispose();for(const t of maps)t.dispose();}
    this.group=null;this.slot=0;
  }
}
