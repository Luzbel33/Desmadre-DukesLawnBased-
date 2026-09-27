// Preserve the room's protocol, authorization and rate limiter. Poker action tokens
// are carried into its synchronous dispatch so stale keystrokes cannot bet twice.
import { Room as BaseRoom } from './room-core.js';
export class Room extends BaseRoom {
  onMessage(player,data,isBinary){
    let token=null;
    if(!isBinary&&player.ready&&data.length<=256*1024){
      try{const message=JSON.parse(data);if(message?.t==='pk'&&message.a==='act'&&(message.hand!==undefined||message.revision!==undefined))token={pid:player.id,hand:message.hand,revision:message.revision};}catch{/* BaseRoom handles malformed packets. */}
    }
    this.poker.requestToken=token;
    try{return super.onMessage(player,data,isBinary);}finally{this.poker.requestToken=null;}
  }
}
