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
  if(slot===5){
    // fajo de billetes con su faja
    const bill=new THREE.MeshStandardMaterial({map:billTexture(),roughness:.9});
    const edge=new THREE.MeshStandardMaterial({color:0xcfe0c0,roughness:1});
    const stack=mesh(new THREE.BoxGeometry(.155,.035,.068),[edge,edge,bill,bill,edge,edge]);stack.position.set(0,0,.02);group.add(stack);
    const band=mesh(new THREE.BoxGeometry(.03,.037,.07),new THREE.MeshStandardMaterial({color:0xc9a13b,roughness:.5}));band.position.set(0,0,.02);group.add(band);
  } else if(slot===6){
    // pistola: armazón negro, corredera, cañón hacia adelante
    const black=new THREE.MeshStandardMaterial({color:0x151517,roughness:.35,metalness:.6});
    const grip=new THREE.MeshStandardMaterial({color:0x2a2420,roughness:.8});
    group.add(mesh(new THREE.BoxGeometry(.03,.034,.19),black,0,.035,.07));
    const g2=mesh(new THREE.BoxGeometry(.028,.11,.045),grip,0,-.02,-.005);g2.rotation.x=-.25;group.add(g2);
    const barrel=mesh(new THREE.CylinderGeometry(.007,.007,.03,12),black,0,.035,.17);barrel.rotation.x=Math.PI/2;group.add(barrel);
    const flash=new THREE.Mesh(new THREE.ConeGeometry(.035,.14,10),new THREE.MeshBasicMaterial({color:0xffd070,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
    flash.rotation.x=Math.PI/2;flash.position.set(0,.035,.25);flash.name='flash';group.add(flash);
  } else if(slot===7){
    // granada de mano con su palanca y el anillo
    const olive=new THREE.MeshStandardMaterial({color:0x3d4a26,roughness:.7,metalness:.2});
    const body=mesh(new THREE.SphereGeometry(.036,16,12),olive,0,.02,0);body.scale.set(1,1.2,1);group.add(body);
    group.add(mesh(new THREE.CylinderGeometry(.013,.015,.022,12),metal,0,.07,0));
    const lever=mesh(new THREE.BoxGeometry(.012,.06,.006),metal,.018,.05,0);lever.rotation.z=-.25;group.add(lever);
    const ring=mesh(new THREE.TorusGeometry(.012,.002,6,16),metal,-.018,.078,0);ring.rotation.y=Math.PI/2;group.add(ring);
  }
  if(slot===8){
    // poción de la bruja: frasco redondo de vidrio con líquido que brilla, corcho y etiqueta de papel
    const liquid=new THREE.MeshStandardMaterial({color:0x2aff70,emissive:0x19ff5a,emissiveIntensity:1.4,roughness:.2,transparent:true,opacity:.9});
    const glass=new THREE.MeshPhysicalMaterial({color:0xcfe8dc,roughness:.05,metalness:0,transparent:true,opacity:.35,clearcoat:1,depthWrite:false});
    const ball=mesh(new THREE.SphereGeometry(.045,20,14),glass,0,.0,0);group.add(ball);
    const fill=mesh(new THREE.SphereGeometry(.041,18,12,0,Math.PI*2,Math.PI*.3,Math.PI*.7),liquid,0,0,0);fill.name='liquid';group.add(fill);
    group.add(mesh(new THREE.CylinderGeometry(.013,.016,.05,14),glass,0,.058,0));
    group.add(mesh(new THREE.CylinderGeometry(.012,.011,.022,10),new THREE.MeshStandardMaterial({color:0x8a6238,roughness:.9}),0,.09,0));
    const collar=mesh(new THREE.TorusGeometry(.017,.003,6,16),new THREE.MeshStandardMaterial({color:0x6a2090,roughness:.6}),0,.066,0);
    collar.rotation.x=Math.PI/2;group.add(collar);
  } else if(slot===9){
    // choripán: pan francés abierto con el chorizo y chimichurri
    const bread=new THREE.MeshStandardMaterial({color:0xc98e4a,roughness:.85});
    const chori=new THREE.MeshStandardMaterial({color:0x7a2a18,roughness:.55});
    const chimi=new THREE.MeshStandardMaterial({color:0x3f6a1e,roughness:.8});
    const b=new THREE.Group();b.rotation.z=Math.PI/2;
    for(const s of[-1,1]){const h=mesh(new THREE.CapsuleGeometry(.024,.13,6,12),bread,s*.013,0,0);h.scale.set(.85,1,1);b.add(h);}
    b.add(mesh(new THREE.CapsuleGeometry(.017,.15,6,12),chori,0,0,.012));
    const c=mesh(new THREE.BoxGeometry(.012,.12,.012),chimi,0,0,.03);b.add(c);
    group.add(b);
  } else if(slot===10){
    // manzana acaramelada en su palito
    const apple=mesh(new THREE.SphereGeometry(.038,20,16),new THREE.MeshPhysicalMaterial({color:0x9a0a10,roughness:.12,clearcoat:1,clearcoatRoughness:.05}),0,.06,0);apple.scale.set(1,.9,1);group.add(apple);
    group.add(mesh(new THREE.CylinderGeometry(.003,.003,.12,6),new THREE.MeshStandardMaterial({color:0xd8c29a,roughness:.9}),0,0,0));
  }
  return group;
}
let _bill=null;
function billTexture(){
  if(_bill||typeof document==='undefined')return _bill;
  const c=document.createElement('canvas');c.width=256;c.height=112;const g=c.getContext('2d');
  g.fillStyle='#b9d4a0';g.fillRect(0,0,256,112);g.strokeStyle='#3e6a3a';g.lineWidth=5;g.strokeRect(6,6,244,100);
  g.fillStyle='#2f5a2e';g.font='bold 40px Georgia, serif';g.textAlign='center';g.fillText('666',60,72);g.fillText('666',196,72);
  g.beginPath();g.ellipse(128,56,26,34,0,0,7);g.fill();g.fillStyle='#b9d4a0';g.font='bold 26px Georgia';g.fillText('⛧',128,66);
  _bill=new THREE.CanvasTexture(c);_bill.colorSpace=THREE.SRGBColorSpace;return _bill;
}
export { billTexture };
export class EquipmentView {
  constructor(scene){this.scene=scene;this.group=null;this.slot=0;}
  update(char,slot,yaw,action,actionT=0,hidden=false){
    const desired=hidden||![1,2,3,5,6,7,8,9,10].includes(slot)?0:slot;
    if(desired!==this.slot){this.dispose();this.slot=desired;if(desired){this.group=createEquippedModel(desired);this.scene.add(this.group);}}
    if(!this.group)return;
    char.root.updateWorldMatrix(true,true);char.handR.getWorldPosition(this.group.position);
    this.group.rotation.set(0,yaw,0,'YXZ');
    if(action==='drink'&&(slot===1||slot===8))this.group.rotateX(-1.3*Math.sin(Math.min(1,actionT/1.7)*Math.PI));
    if(slot===2){this.group.position.y+=.018;const ember=this.group.getObjectByName('ember');if(ember)ember.material.emissiveIntensity=action==='smoke'?2:.65;}
    if(slot===3&&action==='spray')this.group.rotateX(-.15);
    if(slot===6){this.group.rotateX(-(char.aimPitch||0));const f=this.group.getObjectByName('flash');if(f){this.flashT=Math.max(0,(this.flashT||0)-1/60);f.material.opacity=this.flashT>0?1:0;}}
  }
  shoot(){this.flashT=.05;}
  dispose(){
    if(this.group){const geos=new Set(),mats=new Set(),maps=new Set();this.group.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[]){mats.add(m);if(m.map)maps.add(m.map);}});this.group.removeFromParent();for(const g of geos)g.dispose();for(const m of mats)m.dispose();for(const t of maps)t.dispose();}
    this.group=null;this.slot=0;
  }
}
