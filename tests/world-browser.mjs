// Full-world rendering and wired-input checks. Uses real assets in a private local room.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let chromium;
try {({chromium}=require('playwright'));} catch {({chromium}=require('/tmp/browser-qa/node_modules/playwright'));}
const origin='http://127.0.0.1:31993';
const server=spawn(process.execPath,['server/server.js'],{env:{...process.env,PORT:'31993'},stdio:'pipe'});
let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
const wait=ms=>new Promise(r=>setTimeout(r,ms));let browser;
try {
  for(let i=0;;i++){try{if((await fetch(origin)).ok)break;}catch{}if(i>100)throw Error(log);await wait(100);}
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:960,height:640}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/Error en el frame|Shader Error|TypeError|ReferenceError/.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>localStorage.setItem('dukes.graphics','rendimiento'));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.locator('#m-mask').waitFor({state:'visible',timeout:90000});
  await page.locator('#m-name').fill('World QA');await page.locator('#m-room').fill('world-regressions');
  await page.locator('#m-play').dispatchEvent('click');
  await page.waitForFunction(()=>!!window.G?.me&&G.myId>0,null,{timeout:90000,polling:100});
  await page.evaluate(()=>{window.__dukesPause=true;});
  await page.waitForFunction(()=>G.inGame&&!__dukes.preparingJoin&&G.net.connected,null,{timeout:90000,polling:100});
  await page.evaluate(async()=>{
    const {loadHuman}=await import('/js/char/human.js');
    await Promise.all(['v_tabernero','v_vecino','v_hincha','v_granjero','toro','coneja'].map(loadHuman));
    // Software rendering QA: preserve real geometry/materials but skip the expensive post pipeline.
    G.renderer.setPixelRatio(1);G.renderer.setSize(640,420,false);G.renderer.shadowMap.enabled=false;
    G.camera.aspect=640/420;G.camera.far=60;G.camera.updateProjectionMatrix();
    G.world._baked=true;G.post.render=()=>{};
    for(const mesh of G.grass?.meshes||[])mesh.visible=false;
    window.drawWorld=()=>{const own=G.me.char.root.visible;G.me.char.root.visible=false;try{G.renderer.setRenderTarget(null);G.renderer.render(G.scene,G.camera);return G.renderer.domElement.toDataURL('image/png');}finally{G.me.char.root.visible=own;}};
    window.pose=(position,look)=>{
      G.me.teleport(new G.camera.position.constructor(...position));
      G.camera.position.set(...position);G.camera.lookAt(...look);G.camera.updateMatrixWorld(true);
      G.world.update(1/60,G.me.pos,{bake:false});for(let i=0;i<35;i++){G.time+=1/60;G.villagers.update(1/60,G.camera);}
      G.post.render(1/60);
    };
    pose([100,1.8,-5.8],[98,1.5,-9.5]);
  });
  fs.mkdirSync('/tmp/media-qa',{recursive:true});
  const capture=async name=>{const image=await page.evaluate(()=>drawWorld());fs.writeFileSync('/tmp/media-qa/'+name+'.png',Buffer.from(image.split(',')[1],'base64'));console.log('CAPTURE',name,await page.evaluate(()=>G.renderer.info.render));};
  await capture('cinema-vendor');
  const cinema=await page.evaluate(()=>{
    const v=G.villagers.byKey;return {vendor:!!v.cineVendor?.char,viewers:[0,1,2,3].map(i=>v['cineViewer'+i]).filter(n=>n?.data.seat&&n.sit).length,sign:!!G.scene.getObjectByName('cinema-popcorn-sign')};
  });
  assert.deepEqual(cinema,{vendor:true,viewers:4,sign:true});
  await page.evaluate(()=>pose([117,2.2,4],[109,1.2,1]));
  await capture('cinema-viewers');
  await page.evaluate(()=>pose([99,1.8,-23],[96.1,1.2,-25.2]));
  await capture('bar-seats');
  const seats=await page.evaluate(()=>['toro2','venus2','barTito','barFan'].map(k=>{
    const n=G.villagers.byKey[k];return !!(n?.data.seat&&n.sit&&Math.abs(n.pos.y+.46-n.data.seat.y)<.03);
  }));
  assert.ok(seats.every(Boolean),'bar patrons must sit at the real seat height');
  await page.evaluate(()=>{document.getElementById('pause').classList.remove('hidden');document.querySelector('[data-sec="imagen"]').open=true;__dukes.mode='pause';});
  for(const side of ['right','center','left']) {
    await page.locator('#o-camera-shoulder').selectOption(side);
    assert.equal(await page.evaluate(()=>G.opts.cameraShoulder),side);
    assert.equal(await page.evaluate(()=>localStorage.getItem('dukes.camera.shoulder')),side);
  }
  await page.evaluate(()=>document.getElementById('pause').classList.add('hidden'));
  console.log('PASS actual pause-menu shoulder selector and saved preference');
  await page.evaluate(()=>{
    __dukes.mode='game';__dukes.cameraMode=2;G.input.enabled=true;G.input.locked=true;G.input.releaseAll();G.me.giveItem('pistol');document.getElementById('game').focus();
  });
  await page.keyboard.press('y');await page.evaluate(()=>__dukesStep());
  console.log('FRONT_CAMERA_INPUT',await page.evaluate(()=>({mode:__dukes.mode,camera:__dukes.cameraMode,ingame:G.inGame,locked:G.input.locked,enabled:G.input.enabled})));
  assert.equal(await page.evaluate(()=>__dukes.cameraMode),3);
  const oldShot=await page.evaluate(()=>G.items.shotT);
  await page.mouse.click(480,320);await page.keyboard.press('f');await page.keyboard.press('r');await page.keyboard.press('g');await page.evaluate(()=>__dukesStep());
  assert.equal(await page.evaluate(()=>G.items.shotT),oldShot);
  assert.equal(await page.evaluate(()=>G.me.combatBlocked),true);
  assert.equal(await page.evaluate(()=>G.me._canUseArms()),false);
  await page.evaluate(()=>{__dukes.cameraMode=2;__dukesStep();});
  await page.mouse.click(480,320);await page.evaluate(()=>__dukesStep());
  assert.ok(await page.evaluate(old=>G.items.shotT>old,oldShot),'normal camera must still shoot');
  await page.evaluate(()=>{
    pose([100,1.8,-5.8],[98,1.3,-9.5]);
    const n=G.villagers.byKey.cineVendor;n.ignite(3);
    G.owner.bodyFire.update(G.time,[{seconds:n.burnT,char:n.char}],G.camera,0);
    G.post.render(1/60);
  });
  await capture('npc-burning');
  const burning=await page.evaluate(()=>({parts:G.owner.bodyFire.active,finite:G.villagers.byKey.cineVendor.pos.toArray().every(Number.isFinite)}));
  assert.ok(burning.parts>=5&&burning.finite);
  assert.deepEqual(errors,[],'world runtime/shader errors');
  console.log('PASS full-world cinema vendor/viewers, real bar seating, frontal camera input blocking with normal-camera shooting preserved, and visible animated NPC fire',JSON.stringify({cinema,seats,burning}));
}finally{await browser?.close();server.kill('SIGTERM');}
