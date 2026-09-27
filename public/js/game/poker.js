// The world table and NPCs stay in poker-world.js; seated play uses a dedicated interface.
import { PokerView as WorldPoker } from './poker-world.js';
import { PokerInterface } from './poker-ui.js';
import { legalActions } from '../shared/poker-rules.js';
import { G } from '../core/G.js';
export class PokerView extends WorldPoker {
  _bindUI(){this.ui=new PokerInterface(this);}
  _renderPanel(){this.ui?.render();}
  act(act,amt=0){
    const l=legalActions(this.st,this.mySeat);
    if(!l.ready||(['bet','raise'].includes(act)&&!l.canRaise)||act==='allin'&&!l.canRaise&&l.max>this.st.currentBet)return false;
    this.net.send({t:'pk',a:'act',act,amt,hand:this.st.handNo,revision:this.st.revision});
    G.sfx?.trigger(act==='fold'?'card-shove':act==='check'?'ui':'chip-lay');this.onAct?.(act);return true;
  }
  applyState(st){
    if(!st||!Array.isArray(st.seats))return;
    if(this.st&&st.handNo<this.st.handNo)return;
    const prev=this.st;this.st=st;
    const mine=st.seats.findIndex(s=>s&&s.pid===G.myId&&!s.leaving);
    if(mine>=0&&this.mySeat<0){this.mySeat=mine;this.pendingSeat=null;this.onSit?.(this.seats[mine]);}
    else if(mine<0&&this.mySeat>=0){this.mySeat=-1;this.myCards=[];this.onLeave?.();}
    if(prev&&st.handNo!==prev.handNo&&this._cardsHand!==st.handNo)this.myCards=[];
    if(st.phase==='showdown'&&st.result&&st.handNo!==this._wonHand){this._wonHand=st.handNo;const result=st.result.find(r=>st.seats[r.seat]?.pid===G.myId);if(result)this.onWin?.(result);for(const r of st.result)this._botEmote?.(r.seat,'clap',2);}
    this._syncBots();this._render();
  }
  event(message){if(message.e==='error'){this.ui?.error(message.message);return;}super.event(message);}
  update(camera,dt=1/60){super.update(camera,dt);this.ui?.tick();}
}
