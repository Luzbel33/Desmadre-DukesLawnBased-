// Real GLB bodies and the real Rapier solver, without loading the expensive full map.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),fixture=path.join(root,'public/_body-qa.html'),out=path.join(root,'artifacts/poker/body');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'body-qa-'));fs.mkdirSync(out,{recursive:true});fs.copyFileSync(path.join(__dirname,'body-browser.html'),fixture);
const port=3180,base=`http://127.0.0.1:${port}`,server=spawn(process.execPath,['server/server.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir},stdio:'pipe'});
let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);const pause=ms=>new Promise(r=>setTimeout(r,ms));let browser;
(async()=>{try{
 for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');if(r.ok)break;}catch{}if(i===99)throw new Error(logs||'server startup');await pause(100);}
 browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/_body-qa.html');await page.waitForFunction(()=>window.bodyQA?.ready,{},{timeout:60000});
 const report={models:[],errors};
 for(const model of ['eric','carla','claudia']){
  await page.evaluate(model=>bodyQA.spawn(model),model);const idle=await page.evaluate(()=>bodyQA.draw('Postura inicial'));
  assert.ok(idle.finite&&idle.enabled===11);await page.screenshot({path:path.join(out,model+'-idle.png')});
  const hit=await page.evaluate(()=>bodyQA.hit());assert.ok(hit.finite);assert.equal(hit.mode,'rag');
  await page.evaluate(()=>bodyQA.draw('Respuesta a impacto'));await page.screenshot({path:path.join(out,model+'-impact.png')});
  await page.evaluate(model=>bodyQA.spawn(model),model);const injury=await page.evaluate(()=>bodyQA.cut());assert.ok(injury.finite);assert.ok(injury.hp>0,'arm injury killed a healthy character');assert.ok(injury.gore&(1<<4));
  await page.evaluate(()=>bodyQA.draw('Lesión localizada, personaje vivo'));await page.screenshot({path:path.join(out,model+'-injury.png')});
  const body=await page.evaluate(()=>bodyQA.die());assert.ok(body.finite);assert.ok(body.peakY<4,'body launched above the scene');assert.ok(body.peakSpeed<15,'body failed to settle');
  await page.evaluate(()=>bodyQA.draw('Cuerpo tras tres segundos de física'));await page.screenshot({path:path.join(out,model+'-settled.png')});
  report.models.push({model,idle,hit,injury,body});
 }
 assert.deepEqual(errors,[]);report.result='PASS';fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();server.kill('SIGTERM');await pause(150);fs.rmSync(fixture,{force:true});fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
