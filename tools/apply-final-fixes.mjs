import fs from 'node:fs';
function edit(file,before,after){const raw=fs.readFileSync(file,'utf8'),eol=raw.includes('\r\n')?'\r\n':'\n',src=raw.replace(/\r\n/g,'\n');if(src.includes(after))return;if(src.split(before).length!==2)throw new Error('Missing final patch '+file+': '+before.slice(0,100));fs.writeFileSync(file,src.replace(before,()=>after).replace(/\n/g,eol));}
edit('public/js/ui/social.js','.chat-roster{display:flex;', '.chat-roster[hidden]{display:none!important}\n.chat-roster{display:flex;');
// Keep the established drag strength: lowering it made a downed player stop following.
edit('public/js/game/player.js','RAPIER.JointData.spring(0.05, 1100, 85,','RAPIER.JointData.spring(0.05, 1800, 90,');
edit('tests/social-browser.mjs', "  assert.equal(await page.locator('#m-mask option').count(), 6);", `  assert.equal(await page.locator('#m-mask option').count(), 6);
  // The CI machine renders in software: reduce only its drawing resolution, not game logic.
  await page.evaluate(async () => { const { G } = await import('/js/core/G.js'); if (G.renderer) { G.renderer.setPixelRatio(.25); G.renderer.setSize(640, 400, false); G.renderer.shadowMap.enabled = false; } });
  console.log('Browser menu loaded', JSON.stringify(pageErrors));`);
edit('tests/social-browser.mjs', "  await page.locator('#m-play').click();", `  console.log('Play button', await page.locator('#m-play').evaluate(el => ({ disabled: el.disabled, rect: el.getBoundingClientRect().toJSON(), display: getComputedStyle(el).display })));
  await page.locator('#m-play').click({ timeout: 60000 });`);
const tests = 'tests/gameplay.test.mjs';
const suffix = `

test('physical severed limb can be grabbed, held and released without a stale spring', async () => {
  const { p, ph } = await fixture(); frame(p, ph);
  const hand = p.handPos('r', new THREE.Vector3());
  const body = ph.world.createRigidBody(ph.R.RigidBodyDesc.dynamic().setTranslation(hand.x, hand.y, hand.z));
  ph.tag(ph.world.createCollider(ph.R.ColliderDesc.ball(.08).setMass(.5), body), { kind: 'gib' });
  assert.equal(p.grab('r'), true, 'near-hand loose limb was not selected');
  assert.equal(p.hands.r.loose.body.handle, body.handle);
  assert.equal(body.grabCount, 1);
  for (let i = 0; i < 10; i++) frame(p, ph);
  assert.ok(Object.values(body.translation()).every(Number.isFinite));
  p.release('r', false);
  assert.equal(body.grabCount, 0);
  assert.equal(p.hands.r.loose, null);
  assert.equal(p.hands.r.joint, null);
  G.players = new Map(); ph.world.free();
});

test('stale loose body removal releases the hand instead of crashing the simulation', async () => {
  const { p, ph } = await fixture(); frame(p, ph);
  const hand = p.handPos('l', new THREE.Vector3());
  const body = ph.world.createRigidBody(ph.R.RigidBodyDesc.dynamic().setTranslation(hand.x, hand.y, hand.z));
  ph.tag(ph.world.createCollider(ph.R.ColliderDesc.ball(.08), body), { kind: 'gib' });
  assert.equal(p.grab('l'), true);
  ph.world.removeRigidBody(body);
  assert.doesNotThrow(() => p._gripTug(1 / 60));
  assert.equal(p.hands.l.joint, null);
  G.players = new Map(); ph.world.free();
});
`;
if (!fs.readFileSync(tests, 'utf8').includes("test('physical severed limb can be grabbed")) fs.appendFileSync(tests, suffix);
