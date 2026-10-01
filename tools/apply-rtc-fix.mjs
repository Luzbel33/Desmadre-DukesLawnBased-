import fs from 'node:fs';
function edit(file,before,after){const raw=fs.readFileSync(file,'utf8'),eol=raw.includes('\r\n')?'\r\n':'\n',src=raw.replace(/\r\n/g,'\n');if(src.includes(after))return;if(src.split(before).length!==2)throw new Error('Missing RTC patch '+file+': '+before.slice(0,100));fs.writeFileSync(file,src.replace(before,()=>after).replace(/\n/g,eol));}
const voice='public/js/audio/voice.js';
edit(voice, "    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });\n    peer.sender = tr.sender;\n    this._attachTrack(peer);", `    // Only the offerer creates a transceiver. The answerer must reuse the one
    // created by setRemoteDescription, otherwise its microphone has no negotiated m-line.
    if (initiator) {
      const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
      peer.sender = tr.sender;
    }`);
edit(voice, '      const offer = await peer.pc.createOffer();', '      await this._attachTrack(peer);\n      const offer = await peer.pc.createOffer();');
edit(voice, '        await peer.pc.setRemoteDescription(d.sdp);\n        peer.remoteSet = true;', `        await peer.pc.setRemoteDescription(d.sdp);
        if (d.sdp.type === 'offer') {
          const tr = peer.pc.getTransceivers?.().find(t => t.mid !== null && t.receiver.track.kind === 'audio');
          if (tr) {
            tr.direction = 'sendrecv';
            peer.sender = tr.sender;
            await this._attachTrack(peer);
          }
        }
        peer.remoteSet = true;`);
const test='tests/social-browser.mjs';
edit(test,"browser = await chromium.launch({ headless: true, args:","browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--mute-audio'], args:");
edit(test, `    const energy = async id => {
      const peer = voices.get(id).peers.get(1); if (!peer) return 0;
      const stats = await peer.pc.getStats(); let sum = 0;
      stats.forEach(s => { if (s.type === 'inbound-rtp' && s.kind === 'audio') sum += s.totalAudioEnergy || 0; }); return sum;
    };`, `    // This app routes decoded audio through Web Audio while muting its duplicate
    // HTMLAudioElement. Chromium's inbound totalAudioEnergy stays zero in that path.
    // Measure actual decoded PCM at the game's analyser, not that playback counter.
    const measured = new Map();
    const energy = async id => {
      const peer = voices.get(id).peers.get(1), samples = new Float32Array(512);
      peer?.nodes?.analyser.getFloatTimeDomainData(samples);
      const square = samples.reduce((n, x) => n + x * x, 0) / samples.length;
      const sum = (measured.get(id) || 0) + square;
      measured.set(id, sum); return sum;
    };`);
edit(test, "    if (!(energies[0] > 0 && energies[1] > 0)) throw new Error('Selected peers did not receive real audio: ' + energies);", `    if (!(energies[0] > .001 && energies[1] > .001)) throw new Error('Selected peers did not receive decoded audio: ' + energies);
    for (const voice of voices.values()) for (const peer of voice.peers.values()) {
      if (peer.pc.getTransceivers().length !== 1 || peer.pc.getTransceivers()[0].currentDirection !== 'sendrecv') throw new Error('Audio negotiation is not bidirectional');
    }`);
edit(test, '    for (const voice of voices.values()) voice.dispose(); osc.stop(); await ctx.close();', `    // The answerer must also be able to speak after the connection was established.
    const answerer = voices.get(2);
    answerer.stream = tone.stream; answerer.track = tone.stream.getAudioTracks()[0]; answerer.enabled = true;
    answerer.setRecipients([1]);
    await Promise.all([...answerer.peers.values()].map(peer => answerer._attachTrack(peer)));
    let reverseRms = 0;
    for (let i = 0; i < 40 && reverseRms < .01; i++) {
      await wait(100); const sample = new Float32Array(512);
      sender.peers.get(2).nodes?.analyser.getFloatTimeDomainData(sample);
      reverseRms = Math.sqrt(sample.reduce((n, x) => n + x*x, 0) / sample.length);
    }
    if (reverseRms < .01) throw new Error('Answerer microphone did not travel back to the offerer');
    console.log('Reverse audio RMS', reverseRms);
    for (const voice of voices.values()) voice.dispose(); osc.stop(); await ctx.close();`);
