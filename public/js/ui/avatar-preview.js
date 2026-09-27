import * as THREE from 'three';
import { HumanCharacter as Character } from '../char/human.js';

export class AvatarPreview {
  constructor(container,look){
    this.container=container;this.yaw=-.25;this.distance=3.15;this.drag=null;
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(37,1,.05,20);
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setClearColor(0x000000,0);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3;
    this.renderer.domElement.setAttribute('aria-label','Vista previa del personaje: arrastrá para girar, rueda para acercar');
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffeed4,0x3d4b59,2.2));
    const key=new THREE.DirectionalLight(0xffeed2,3.2);key.position.set(-2,3,4);this.scene.add(key);
    const rim=new THREE.DirectionalLight(0x81b1d4,2.5);rim.position.set(2,2,-2);this.scene.add(rim);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.64,.68,.035,64),new THREE.MeshStandardMaterial({color:0x2d3331,roughness:.7,metalness:.15}));base.position.y=-.018;this.scene.add(base);
    this.char=new Character(look);this.scene.add(this.char.root);this.lookKey=JSON.stringify(look);
    const canvas=this.renderer.domElement;canvas.style.touchAction='none';
    canvas.addEventListener('pointerdown',e=>{this.drag=e.clientX;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(this.drag!==null){this.yaw+=(e.clientX-this.drag)*.012;this.drag=e.clientX;}});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>this.drag=null);
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance=THREE.MathUtils.clamp(this.distance+e.deltaY*.002,1.4,4.5);},{passive:false});
    canvas.addEventListener('dblclick',()=>{this.distance=3.15;this.yaw=-.25;});
  }
  update(dt,look){
    const key=JSON.stringify(look);if(this.lookKey!==key){this.char.setLook(look);this.lookKey=key;}
    const rect=this.container.getBoundingClientRect();if(rect.width<1||rect.height<1)return;
    if(rect.width!==this.width||rect.height!==this.height){this.width=rect.width;this.height=rect.height;this.renderer.setSize(rect.width,rect.height);this.camera.aspect=rect.width/rect.height;this.camera.updateProjectionMatrix();}
    this.char.animate({speed:0,grounded:true},dt);this.char.update(dt);this.char.root.rotation.y=this.yaw;
    const focus=this.distance<2?1.42:.91;this.camera.position.set(0,focus+.18,this.distance);this.camera.lookAt(0,focus,0);
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.char.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
