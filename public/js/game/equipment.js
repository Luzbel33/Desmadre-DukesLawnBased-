// Visible held items. These are presentation meshes, not a dual-hand physics system.
import * as THREE from 'three';
import { SLOT_KIND } from '../shared/consumables.js';

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
  if(slot===8||(slot>=20&&slot<=23)){
    // poción de la bruja: frasco redondo de vidrio con líquido que brilla, corcho y etiqueta de papel (el color dice cuál es)
    const lc=[0x2aff70,0xff2a3a,0x2affb0,0x3a8cff,0xff3ad8][slot===8?0:slot-19];
    const liquid=new THREE.MeshStandardMaterial({color:lc,emissive:lc,emissiveIntensity:1.2,roughness:.2,transparent:true,opacity:.9});
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
  if(slot>=11&&slot<=19)consumableModel(slot,group);
  if(slot>=24&&slot<=27)relicModel(slot,group);
  if(slot===28){ // encendedor tipo zippo con la tapa abierta y la llamita (se ve al usarlo)
    const chrome=new THREE.MeshStandardMaterial({color:0xd8d8d0,metalness:1,roughness:.25});
    group.add(mesh(new THREE.BoxGeometry(.038,.05,.014),chrome,0,.03,0));
    const lid=mesh(new THREE.BoxGeometry(.038,.022,.014),chrome,-.02,.07,0);lid.rotation.z=1.2;group.add(lid);
    const f=mesh(new THREE.ConeGeometry(.008,.035,8),new THREE.MeshBasicMaterial({color:0xffa030,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),0,.075,0);f.name='flame';f.castShadow=false;group.add(f);
  }
  return group;
}

// Las reliquias del cofre del laberinto (shared/relics.js). Las partes con nombre las anima EquipmentView al usarlas:
// la mandíbula y los ojos de la calavera, el humo de la bola, la panza del patito
function relicModel(slot,group){
  const gold=new THREE.MeshStandardMaterial({color:0xe0b03a,metalness:1,roughness:.22,emissive:0x3a2400,emissiveIntensity:.25});
  const dark=new THREE.MeshStandardMaterial({color:0x080604,roughness:.9});
  if(slot===24){ // calavera de oro: cráneo, pómulos, cuencas negras con ojos que se prenden y la mandíbula suelta
    const skull=new THREE.Group();skull.position.y=.05;group.add(skull);
    const head=mesh(new THREE.SphereGeometry(.055,24,18),gold,0,.012,-.004);head.scale.set(.92,1,1.12);skull.add(head);
    const face=mesh(new THREE.BoxGeometry(.07,.045,.05),gold,0,-.022,.026);skull.add(face);
    for(const sx of[-1,1]){
      const sock=mesh(new THREE.SphereGeometry(.0155,14,10),dark,sx*.021,-.004,.05);sock.scale.set(1,1.1,.6);skull.add(sock);
      const eye=mesh(new THREE.SphereGeometry(.007,10,8),new THREE.MeshBasicMaterial({color:0xff2010,transparent:true,opacity:0}),sx*.021,-.004,.054);eye.name='eyes';skull.add(eye);
    }
    const nose=mesh(new THREE.ConeGeometry(.008,.016,3),dark,0,-.026,.052);nose.rotation.x=Math.PI;skull.add(nose);
    for(let k=0;k<6;k++)skull.add(mesh(new THREE.BoxGeometry(.007,.01,.006),new THREE.MeshStandardMaterial({color:0xf2e6c0,roughness:.4}),-.0175+k*.007,-.043,.048));
    const jaw=new THREE.Group();jaw.name='jaw';jaw.position.set(0,-.045,.0);skull.add(jaw);
    const jb=mesh(new THREE.BoxGeometry(.06,.016,.05),gold,0,-.008,.022);jaw.add(jb);
    for(let k=0;k<6;k++)jaw.add(mesh(new THREE.BoxGeometry(.007,.009,.006),new THREE.MeshStandardMaterial({color:0xf2e6c0,roughness:.4}),-.0175+k*.007,.002,.046));
  } else if(slot===25){ // bola de cristal en su pie de bronce, con humo violeta adentro
    const glass=new THREE.MeshPhysicalMaterial({color:0xd8ccff,roughness:.02,metalness:0,transparent:true,opacity:.32,clearcoat:1,depthWrite:false});
    const core=mesh(new THREE.SphereGeometry(.038,18,14),new THREE.MeshBasicMaterial({color:0x8a40ff,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false}),0,.07,0);core.name='core';core.castShadow=false;group.add(core);
    const ball=mesh(new THREE.SphereGeometry(.055,24,18),glass,0,.07,0);ball.castShadow=false;group.add(ball);
    const brass=new THREE.MeshStandardMaterial({color:0x9a6a28,metalness:.85,roughness:.35});
    group.add(mesh(new THREE.CylinderGeometry(.03,.042,.022,20),brass,0,.008,0));
    const ring=mesh(new THREE.TorusGeometry(.033,.006,8,24),brass,0,.024,0);ring.rotation.x=Math.PI/2;group.add(ring);
  } else if(slot===26){ // silbato de la muerte: una calaverita de barro con el pico para soplar
    const clay=new THREE.MeshStandardMaterial({color:0x8a6a4a,roughness:.95});
    const head=mesh(new THREE.SphereGeometry(.026,16,12),clay,0,.03,0);head.scale.set(1,1.05,1.1);group.add(head);
    for(const sx of[-1,1]){const e=mesh(new THREE.SphereGeometry(.0075,10,8),dark,sx*.01,.034,.024);group.add(e);}
    group.add(mesh(new THREE.BoxGeometry(.012,.006,.004),dark,0,.019,.027));
    const pipe=mesh(new THREE.CylinderGeometry(.006,.008,.03,10),clay,0,.03,-.035);pipe.rotation.x=Math.PI/2;group.add(pipe);
    const cord=mesh(new THREE.TorusGeometry(.012,.0018,6,14),new THREE.MeshStandardMaterial({color:0x6a1a10,roughness:.9}),0,.06,0);group.add(cord);
  } else if(slot===27){ // patito de goma, pero de oro
    const duck=new THREE.Group();duck.name='duck';duck.position.y=.03;group.add(duck);
    const body=mesh(new THREE.SphereGeometry(.04,20,14),gold,0,0,0);body.scale.set(1,.78,1.25);duck.add(body);
    const tail=mesh(new THREE.ConeGeometry(.016,.03,10),gold,0,.012,-.05);tail.rotation.x=-1.0;duck.add(tail);
    const head=mesh(new THREE.SphereGeometry(.024,16,12),gold,0,.04,.026);duck.add(head);
    const beak=mesh(new THREE.ConeGeometry(.011,.026,10),new THREE.MeshStandardMaterial({color:0xd06a10,metalness:.8,roughness:.3}),0,.036,.054);beak.rotation.x=Math.PI/2;beak.scale.set(1.3,1,.6);duck.add(beak);
    for(const sx of[-1,1])duck.add(mesh(new THREE.SphereGeometry(.0045,8,6),dark,sx*.012,.048,.044));
  }
}

// Lo que se pide en el Búnker (shared/consumables.js): tragos, blunt, habano, pipa, bong y brownie
function consumableModel(slot,group){
  const glass=new THREE.MeshStandardMaterial({color:0xdfe8ee,roughness:.06,metalness:.1,transparent:true,opacity:.32,depthWrite:false});
  const liquid=(col,em=0,ei=0)=>new THREE.MeshStandardMaterial({color:col,roughness:.15,emissive:em,emissiveIntensity:ei,transparent:true,opacity:.92});
  const ice=new THREE.MeshStandardMaterial({color:0xeaf6ff,roughness:.05,transparent:true,opacity:.6,depthWrite:false});
  const ember=()=>new THREE.MeshStandardMaterial({color:0x68260b,emissive:0xff3d08,emissiveIntensity:.65,roughness:1});
  if(slot===11){ // fernet con coca: vaso alto, oscuro, la espuma clarita, hielo y sorbete
    group.add(mesh(new THREE.CylinderGeometry(.034,.029,.15,24,1,true),glass,0,.02));
    group.add(mesh(new THREE.CylinderGeometry(.031,.027,.11,20),liquid(0x2a1206),0,0));
    group.add(mesh(new THREE.CylinderGeometry(.031,.031,.02,20),liquid(0xb98a5a),0,.065));
    for(let k=0;k<2;k++){const c=mesh(new THREE.BoxGeometry(.018,.018,.018),ice,(k-.5)*.02,.07,(k-.5)*.012);c.rotation.set(k,k*.7,0);group.add(c);}
    group.add(mesh(new THREE.CylinderGeometry(.003,.003,.16,6),new THREE.MeshStandardMaterial({color:0xff3060,roughness:.6}),.012,.06,0));
  } else if(slot===12){ // whisky: vaso corto con un hielo grande
    group.add(mesh(new THREE.CylinderGeometry(.038,.035,.085,24,1,true),glass,0,0));
    group.add(mesh(new THREE.CylinderGeometry(.036,.034,.006,24),glass,0,-.04));
    group.add(mesh(new THREE.CylinderGeometry(.034,.033,.045,20),liquid(0xb86a1a),0,-.016));
    const c=mesh(new THREE.BoxGeometry(.028,.026,.028),ice,0,.01,0);c.rotation.set(.3,.5,.2);group.add(c);
  } else if(slot===13){ // sangre del diablo: copa con algo rojo que brilla y una llamita arriba
    group.add(mesh(new THREE.LatheGeometry([[0,0],[.045,.05],[.046,.052]].map(([r,y])=>new THREE.Vector2(r,y)),24),glass,0,.03));
    const fill=new THREE.ConeGeometry(.04,.044,24,1,true);fill.rotateX(Math.PI);group.add(mesh(fill,liquid(0xa00010,0xff1020,1.2),0,.058));
    group.add(mesh(new THREE.CylinderGeometry(.004,.004,.07,8),glass,0,-.005));
    group.add(mesh(new THREE.CylinderGeometry(.028,.028,.004,20),glass,0,-.04));
    const fl=mesh(new THREE.ConeGeometry(.012,.04,10),new THREE.MeshBasicMaterial({color:0xff8a20,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}),0,.1);fl.name='flame';fl.castShadow=false;group.add(fl);
  } else if(slot===14){ // absenta: vasito con el verde que brilla y la cucharita con el terrón
    group.add(mesh(new THREE.CylinderGeometry(.03,.024,.075,20,1,true),glass,0,0));
    group.add(mesh(new THREE.CylinderGeometry(.027,.022,.04,20),liquid(0x40d020,0x30ff20,.9),0,-.015));
    group.add(mesh(new THREE.BoxGeometry(.075,.002,.016),new THREE.MeshStandardMaterial({color:0xb9b9ac,metalness:.8,roughness:.32}),0,.04));
    group.add(mesh(new THREE.BoxGeometry(.012,.01,.012),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8}),0,.046));
  } else if(slot===15||slot===16){ // blunt y habano: palito gordo con brasa (el habano con su anillo dorado)
    const stick=new THREE.Group();stick.rotation.x=Math.PI/2;
    const len=slot===15?.11:.14,r=slot===15?.008:.011;
    stick.add(cylinder(r,len,new THREE.MeshStandardMaterial({color:slot===15?0x5a3a1e:0x4a2a12,roughness:.9}),len/2));
    if(slot===16)stick.add(cylinder(r+.0006,.012,new THREE.MeshStandardMaterial({color:0xc9a13b,roughness:.4,metalness:.5}),len*.8));
    const coal=cylinder(r*.92,.004,ember(),len+.002);coal.name='ember';stick.add(coal);
    group.add(stick);
  } else if(slot===17){ // pipa: cazoleta de madera, brasa y boquilla
    group.add(mesh(new THREE.CylinderGeometry(.018,.015,.035,16),new THREE.MeshStandardMaterial({color:0x5a2e14,roughness:.45}),0,.02,0));
    const coal=mesh(new THREE.CylinderGeometry(.014,.014,.003,12),ember(),0,.037,0);coal.name='ember';group.add(coal);
    const stem=mesh(new THREE.CylinderGeometry(.005,.006,.1,8),new THREE.MeshStandardMaterial({color:0x151515,roughness:.3}),0,.008,.055);stem.rotation.x=Math.PI/2-.2;group.add(stem);
  } else if(slot===18){ // bong de vidrio con agua, el tubito y la brasa
    const teal=new THREE.MeshStandardMaterial({color:0x5fd8c8,roughness:.06,transparent:true,opacity:.42,depthWrite:false});
    group.add(mesh(new THREE.CylinderGeometry(.026,.026,.24,20,1,true),teal,0,.08));
    group.add(mesh(new THREE.SphereGeometry(.055,20,14),teal,0,-.06));
    group.add(mesh(new THREE.SphereGeometry(.05,16,10,0,Math.PI*2,Math.PI/2,Math.PI/2),liquid(0x6ab0c8),0,-.065));
    const ds=mesh(new THREE.CylinderGeometry(.006,.006,.08,8),glass,.035,-.03,0);ds.rotation.z=-.7;group.add(ds);
    group.add(mesh(new THREE.CylinderGeometry(.014,.008,.018,12),glass,.062,0,0));
    const coal=mesh(new THREE.CylinderGeometry(.011,.011,.003,10),ember(),.062,.008,0);coal.name='ember';group.add(coal);
  } else if(slot===19){ // brownie
    group.add(mesh(new THREE.BoxGeometry(.07,.034,.065),new THREE.MeshStandardMaterial({color:0x3a1e0e,roughness:.85}),0,0));
    group.add(mesh(new THREE.BoxGeometry(.066,.004,.061),new THREE.MeshStandardMaterial({color:0x5a3018,roughness:.6}),0,.019));
  }
}
let _bill=null;
// Billete de 100 dólares (verde grisáceo, guarda, retrato en óvalo, sellos, "100" en las esquinas). Se dibuja una vez y
// lo comparten el fajo en la mano, la pila del Búnker y la lluvia de billetes.
function billTexture(){
  if(_bill||typeof document==='undefined')return _bill;
  const W=512,H=224,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  const bg=g.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#cfdcbf');bg.addColorStop(.5,'#bccfab');bg.addColorStop(1,'#c8d6b6');
  g.fillStyle=bg;g.fillRect(0,0,W,H);
  // guilloché: ondas finas que se cruzan
  g.lineWidth=1;g.strokeStyle='rgba(70,110,80,.18)';
  for(let k=0;k<26;k++){g.beginPath();for(let x=0;x<=W;x+=6){const y=H/2+Math.sin(x*.035+k*.5)*(30+k*3);x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
  // guarda
  g.strokeStyle='#2c4632';g.lineWidth=7;g.strokeRect(9,9,W-18,H-18);
  g.lineWidth=2;g.strokeRect(19,19,W-38,H-38);
  g.fillStyle='rgba(44,70,50,.85)';
  for(let x=24;x<W-24;x+=9){g.fillRect(x,12,4,4);g.fillRect(x,H-16,4,4);}
  // textos
  g.fillStyle='#22382a';g.textAlign='center';g.textBaseline='middle';
  g.font='bold 21px Georgia, serif';g.fillText('THE UNITED STATES OF AMERICA',W/2,38);
  g.font='bold 17px Georgia, serif';g.fillText('ONE HUNDRED DOLLARS',W/2,H-36);
  g.font='bold 46px Georgia, serif';
  for(const [x,y] of [[60,58],[W-60,58],[60,H-58],[W-60,H-58]])g.fillText('100',x,y);
  // retrato en el óvalo (busto genérico)
  const ox=W/2,oy=H/2+4;
  g.fillStyle='#e6ead9';g.beginPath();g.ellipse(ox,oy,50,64,0,0,7);g.fill();
  g.strokeStyle='#2c4632';g.lineWidth=4;g.stroke();g.lineWidth=1.5;g.beginPath();g.ellipse(ox,oy,56,70,0,0,7);g.stroke();
  const sh=g.createLinearGradient(ox-40,oy-40,ox+40,oy+60);sh.addColorStop(0,'#5d7461');sh.addColorStop(1,'#2a3f2f');
  g.fillStyle=sh;g.beginPath();g.ellipse(ox,oy-12,20,25,0,0,7);g.fill();
  g.beginPath();g.moveTo(ox-44,oy+64);g.quadraticCurveTo(ox-40,oy+16,ox,oy+12);g.quadraticCurveTo(ox+40,oy+16,ox+44,oy+64);g.closePath();g.fill();
  // sello de la reserva (izquierda, negro) y del tesoro (derecha, verde)
  g.strokeStyle='#1e2a22';g.lineWidth=3;g.beginPath();g.arc(128,H/2+6,24,0,7);g.stroke();
  g.fillStyle='#1e2a22';g.font='bold 24px Georgia, serif';g.fillText('B',128,H/2+7);
  g.strokeStyle='#2f7a45';g.fillStyle='rgba(47,122,69,.2)';g.lineWidth=3;g.beginPath();g.arc(W-128,H/2+6,24,0,7);g.fill();g.stroke();
  for(let k=0;k<16;k++){const a=k/16*Math.PI*2;g.beginPath();g.moveTo(W-128+Math.cos(a)*24,H/2+6+Math.sin(a)*24);g.lineTo(W-128+Math.cos(a)*29,H/2+6+Math.sin(a)*29);g.stroke();}
  // números de serie en verde
  g.fillStyle='#2f7a45';g.font='bold 15px "Courier New", monospace';g.fillText('LB 66606660 D',150,72);g.fillText('LB 66606660 D',W-150,H-72);
  _bill=new THREE.CanvasTexture(c);_bill.colorSpace=THREE.SRGBColorSpace;_bill.anisotropy=4;return _bill;
}
export { billTexture };
export class EquipmentView {
  constructor(scene){this.scene=scene;this.group=null;this.slot=0;}
  update(char,slot,yaw,action,actionT=0,hidden=false){
    const desired=hidden||!([1,2,3,5,6,7,8,9,10,24,25,26,27,28].includes(slot)||SLOT_KIND[slot])?0:slot;
    if(desired!==this.slot){this.dispose();this.slot=desired;if(desired){this.group=createEquippedModel(desired);this.scene.add(this.group);}}
    if(!this.group)return;
    char.root.updateWorldMatrix(true,true);char.handR.getWorldPosition(this.group.position);
    this.group.rotation.set(0,yaw,0,'YXZ');
    if(action==='drink'&&(slot===1||slot===8||SLOT_KIND[slot]==='drink'||slot===18))this.group.rotateX(-1.3*Math.sin(Math.min(1,actionT/1.7)*Math.PI));
    if(slot===2||SLOT_KIND[slot]==='smoke'){if(slot===2)this.group.position.y+=.018;const ember=this.group.getObjectByName('ember');if(ember)ember.material.emissiveIntensity=action==='smoke'||(slot===18&&action==='drink')?2:.65;}
    if(slot===3&&action==='spray')this.group.rotateX(-.15);
    if(slot>=24&&slot<=27)this._relic(slot,action==='relic'?actionT:-1);
    if(slot===28){const f=this.group.getObjectByName('flame');if(f){const on=action==='fartflame'&&actionT>.25&&actionT<2;f.material.opacity=on?.9:0;f.scale.setScalar(on?1+Math.random()*.4:1);}}
    if(slot===6){this.group.rotateX(-(char.aimPitch||0));const f=this.group.getObjectByName('flash');if(f){this.flashT=Math.max(0,(this.flashT||0)-1/60);f.material.opacity=this.flashT>0?1:0;}}
  }
  shoot(){this.flashT=.05;}
  // las reliquias al usarlas (t: segundos desde el click, -1 en reposo)
  _relic(slot,t){
    const g=this.group,on=t>=0&&t<1.6;
    if(slot===24){
      const jaw=g.getObjectByName('jaw');if(jaw)jaw.rotation.x=on?.25+.25*Math.sin(t*38):0;
      g.traverse(o=>{if(o.name==='eyes')o.material.opacity=on?Math.min(1,t*4):Math.max(0,o.material.opacity-.05);});
      if(on)g.rotateZ(Math.sin(t*20)*.06);
    } else if(slot===25){
      const c=g.getObjectByName('core');if(c){const k=on?1:0;c.material.opacity=.4+.4*k+.15*Math.sin(performance.now()*.004);c.scale.setScalar(.8+.25*Math.sin(performance.now()*.003)+.25*k);c.material.color.setHSL(.75+.08*Math.sin(performance.now()*.001),1,.5+.2*k);}
    } else if(slot===27){
      const d=g.getObjectByName('duck');if(d){const sq=on&&t<.35?Math.sin(t/.35*Math.PI):0;d.scale.set(1+sq*.18,1-sq*.3,1+sq*.12);}
    }
  }
  dispose(){
    if(this.group){const geos=new Set(),mats=new Set(),maps=new Set();this.group.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[]){mats.add(m);if(m.map)maps.add(m.map);}});this.group.removeFromParent();for(const g of geos)g.dispose();for(const m of mats)m.dispose();for(const t of maps)t.dispose();}
    this.group=null;this.slot=0;
  }
}
