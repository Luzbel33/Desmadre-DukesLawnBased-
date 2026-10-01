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
edit(test, "    if (!(energies[0] > 0 && energies[1] > 0)) throw new Error('Selected peers did not receive real audio: ' + energies);", `    if (!(energies[0] > 0 && energies[1] > 0)) {
      const details = [];
      for (const [owner, voice] of voices) for (const peer of voice.peers.values()) {
        const samples = new Float32Array(512); peer.nodes?.analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((n, x) => n + x*x, 0) / samples.length);
        const stats = [...(await peer.pc.getStats()).values()].filter(s => ['inbound-rtp', 'outbound-rtp', 'media-source'].includes(s.type));
        details.push({ owner, id: peer.id, error: voice.error, rms, enabled: peer.outboundTrack?.enabled,
          state: peer.pc.connectionState, transceivers: peer.pc.getTransceivers().map(t => ({mid:t.mid,current:t.currentDirection})), stats });
      }
      throw new Error('Audio diagnostic ' + JSON.stringify({energies, context:ctx.state, details}));
    }
    for (const voice of voices.values()) for (const peer of voice.peers.values()) {
      if (peer.pc.getTransceivers().length !== 1 || peer.pc.getTransceivers()[0].currentDirection !== 'sendrecv') throw new Error('Audio negotiation is not bidirectional');
    }`);
