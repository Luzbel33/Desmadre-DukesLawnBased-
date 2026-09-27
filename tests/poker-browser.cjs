// UI input and layout verification plus one real browser-to-server poker action.
// The fixture is copied into public only during this test and is removed afterward.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),fixture=path.join(root,'public/_poker-qa.html');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'desmadre-poker-'));
const screenshots=path.join(root,'artifacts/poker');fs.mkdirSync(screenshots,{recursive:true});
fs.copyFileSync(path.join(__dirname,'poker-browser.html'),fixture);
const port=3179,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['server/server.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dataDir},stdio:'pipe'});
let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
const pause=ms=>new Promise(r=>setTimeout(r,ms));let browser;
async function visible(page,id){assert.equal(await page.locator(id).isVisible(),true,id);}
(async()=>{try{
 for(let i=0;i<100;i++){try{const r=await fetch(base+'/health');if(r.ok)break;}catch{}if(i===99)throw new Error(logs||'Server did not start');await pause(100);}
 browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/_poker-qa.html');await page.waitForFunction(()=>window.pokerQA?.ready);
 await visible(page,'#pkr-cards');assert.equal(await page.locator('#pkr-board .pkr-card').count(),5);assert.equal(await page.locator('#pkr-cards .pkr-card').count(),2);
 await page.screenshot({path:path.join(screenshots,'desktop.png')});
 await page.keyboard.press('h');await visible(page,'#pkr-dialog');assert.equal(await page.locator('.pkr-ranking article').count(),10);
 await page.screenshot({path:path.join(screenshots,'help.png')});await page.keyboard.press('Escape');assert.equal(await page.locator('#pkr-dialog').isVisible(),false);assert.equal(await page.evaluate(()=>pokerQA.view.mySeat),0);
 await page.keyboard.press('a');await visible(page,'#pkr-amount');assert.equal(await page.inputValue('#pkr-amount'),'100');await page.keyboard.press('ArrowRight');assert.equal(await page.inputValue('#pkr-amount'),'120');
 await page.fill('#pkr-amount','375');await page.keyboard.press('Enter');let sent=await page.evaluate(()=>pokerQA.sent);assert.equal(sent.length,1);assert.equal(sent[0].act,'raise');assert.equal(sent[0].amt,375);assert.equal(sent[0].hand,7);assert.equal(sent[0].revision,21);
 await page.keyboard.press('Space');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>pokerQA.sent.length),1,'duplicate action while pending');
 await page.evaluate(()=>pokerQA.seed({revision:22}));await page.keyboard.press('t');assert.equal(await page.evaluate(()=>pokerQA.sent.length),1,'all-in sent before confirmation');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>pokerQA.sent.length),1);
 await page.keyboard.press('t');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>pokerQA.sent.at(-1).act),'allin');
 await page.evaluate(()=>pokerQA.seed({revision:23}));await page.keyboard.press('f');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>pokerQA.sent.length),2);await page.keyboard.press('f');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>pokerQA.sent.at(-1).act),'fold');
 await page.evaluate(()=>pokerQA.seed({revision:24,turn:1}));const n=await page.evaluate(()=>pokerQA.sent.length);await page.keyboard.press('Space');await page.keyboard.press('t');assert.equal(await page.evaluate(()=>pokerQA.sent.length),n,'out-of-turn action');
 await page.evaluate(()=>pokerQA.seed({revision:25}));await page.keyboard.press('a');await page.fill('#pkr-amount','-1');assert.equal(await page.locator('#pkr-dialog [data-command="confirm"]').isDisabled(),true);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>pokerQA.sent.length),n);await page.keyboard.press('Escape');
 await page.keyboard.press('x');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>pokerQA.view.mySeat),0);await page.keyboard.press('x');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>pokerQA.view.mySeat),-1);
 await page.evaluate(()=>pokerQA.seed({revision:26}));await page.setViewportSize({width:390,height:844});await pause(100);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow');
 const cardBox=await page.locator('#pkr-cards').boundingBox(),footer=await page.locator('.pkr-footer').boundingBox();assert.ok(cardBox.y+cardBox.height<=footer.y+15,'private cards hidden behind controls');
 await page.screenshot({path:path.join(screenshots,'mobile.png')});
 const online=await browser.newPage({viewport:{width:1280,height:800}});online.on('pageerror',e=>errors.push(e.message));await online.goto(base+'/_poker-qa.html');await online.waitForFunction(()=>window.pokerQA?.ready);await online.evaluate(()=>pokerQA.connect());
 await online.waitForFunction(()=>pokerQA.legal().ready,{},{timeout:25000});assert.equal(await online.evaluate(()=>pokerQA.view.myCards.length),2);
 await online.keyboard.press('Space');await online.waitForFunction(()=>pokerQA.view.st.history.some(a=>a.name==='Prueba de teclado'&&a.act==='call'),{},{timeout:10000});
 await online.screenshot({path:path.join(screenshots,'live-socket.png')});await online.evaluate(()=>pokerQA.socket.close());
 assert.deepEqual(errors,[],'browser runtime errors');
 const report={result:'PASS',checks:['desktop and mobile layout','five board slots and two private cards','keyboard raise with exact chip amount','double-submit prevention','explicit all-in and fold confirmation','out-of-turn and invalid-amount guards','help ranking and Escape semantics','leaving the table','real browser WebSocket join, private deal and call'],screenshots:['desktop.png','mobile.png','help.png','live-socket.png']};
 fs.writeFileSync(path.join(screenshots,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();server.kill('SIGTERM');await pause(150);fs.rmSync(fixture,{force:true});fs.rmSync(dataDir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
