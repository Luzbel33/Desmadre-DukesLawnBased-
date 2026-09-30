// Photogrammetric foliage follows damp corners and joints. Entrances and windows stay clear.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../core/G.js';
import { whenAsset, instanceModel } from '../game/assets.js';
export function buildHabitat(scene) {
  const random = rng(29511), twigs = [], ferns = [], rocks = [], stems = [];
  const matrix = (p, rotation, s) => new THREE.Matrix4().compose(p,
    new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(s,s,s));
  const patches = [
    { x:-22.75,z:-102.7,h:5.9,width:1.15,yaw:0 },
    { x:22.85,z:-102.7,h:4.4,width:1.0,yaw:0 },
    { x:122.82,z:-19.1,h:2.6,width:.8,yaw:-Math.PI/2 },
  ];
  for (const p of patches) {
    const right = new THREE.Vector3(Math.cos(p.yaw),0,-Math.sin(p.yaw));
    const front = new THREE.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw));
    for (let branch=0;branch<3;branch++) {
      const h=p.h*[.64,1,.79][branch], phase=branch*1.8, path=[];
      for(let step=0;step<=16;step++) {
        const y=step/16*h;
        path.push(new THREE.Vector3(p.x,.075+y,p.z)
          .addScaledVector(right,(branch-1)*p.width*.29+Math.sin(y*.9+phase)*.16));
      }
      const curve=new THREE.CatmullRomCurve3(path);
      stems.push(new THREE.TubeGeometry(curve,24,.012,4,false));
      const count=Math.ceil(h*6.2);
      for(let k=0;k<count;k++) {
        const t=(k+.25)/count, side=k%2?1:-1;
        const pos=curve.getPoint(t).addScaledVector(front,.055).addScaledVector(right,side*.07);
        twigs.push(matrix(pos,new THREE.Euler(-.2,p.yaw+(random()-.5)*.5,side*(.45+random()*.4),'YXZ'),
          (.95-.35*t)*(.85+random()*.2)));
      }
    }
  }
  for(const [x,z,s] of [[-24.4,-101.4,.85],[-23.4,-101.3,.58],[-16.5,-101.9,.9],
    [-15.6,-101.7,.5],[23.9,-101.35,1],[22.9,-101.6,.62],[16.5,-101.7,.75],
    [17.15,-101.5,.48],[-8.9,-101.35,.55],[8.9,-101.55,.64],
    [-20.4,-65.2,.5],[-22.6,-65.8,.65],[29.2,-125.4,.55],[39.6,-124.3,.65]]) {
    ferns.push(matrix(new THREE.Vector3(x,.06,z),new THREE.Euler(0,random()*6.28,0),s));
  }
  for(const [x,z,s] of [[-23.8,-101.4,.9],[-16.25,-101.6,.55],[23.25,-101.5,.8],
    [16.3,-101.5,.5],[-22.4,-65.55,.65],[29.3,-125.3,.6]])
    rocks.push(matrix(new THREE.Vector3(x,.045,z),new THREE.Euler(0,random()*6.28,0),s));
  for(const [type,placements] of [['c_vineleaf',twigs],['c_fern',ferns],['c_mossrocks',rocks]])
    whenAsset(type,()=>{
      for(const m of instanceModel(scene,type,placements)||[]) {
        m.name='habitat-'+type;m.receiveShadow=true;m.userData.static=true;
      }
    });
  const geometry=mergeGeometries(stems);stems.forEach(g=>g.dispose());
  const branches=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0x504630,roughness:1}));
  branches.name='habitat-stems';branches.receiveShadow=true;scene.add(branches);
  return {branches};
}
