// No-limit rules and readable public state. The original table retains seating,
// deck shuffling, blind rotation, dealing, and bot scheduling.
import { PokerTable as BaseTable, START_CHIPS } from './poker-core.js';
import { bestHand, handName, compareHands } from '../public/js/shared/poker-rules.js';
export { bestHand, handName } from '../public/js/shared/poker-rules.js';
export { START_CHIPS } from './poker-core.js';
const BB=20, STREETS=['preflop','flop','turn','river'];
export class PokerTable extends BaseTable {
  constructor(...args){super(...args);this.revision=0;this.history=[];this.refunds=[];this.settledPot=0;}
  _strength(cards,board){
    if(!board.length)return super._strength(cards,board);
    const {score}=bestHand([...cards,...board]);if(!score)return .1;
    let strength=[.14,.4,.62,.74,.82,.87,.93,.98,1][score[0]];
    if(score[0]===1)strength+=(score[1]-8)*.018;
    if(board.length<5){const suits={};for(const c of [...cards,...board])suits[c[1]]=(suits[c[1]]||0)+1;if(Object.values(suits).includes(4)&&score[0]<5)strength+=.14;}
    return Math.max(0,Math.min(1,strength));
  }
  _startHand(){this.history=[];this.refunds=[];this.settledPot=0;this.runoutAt=0;for(const s of this.seats)if(s)s.actedAt=0;super._startHand();if(this.phase==='preflop'&&this._roundDone())this._nextStreet();}
  _nextStreet(){for(const s of this.seats)if(s)s.actedAt=0;super._nextStreet();}
  _post(i,amount){super._post(i,Math.max(0,Math.floor(amount)));}
  _mayRaise(i){const s=this.seats[i];if(!s||s.folded||s.allin||!s.inHand)return false;if(!this.contenders().some(j=>j!==i&&!this.seats[j].allin))return false;return !s.acted||(s.actedAt===0&&this.currentBet>0)||this.currentBet-(s.actedAt||0)>=this.minRaise;}
  action(pid,act,amount=0,expected=null){
    expected??=this.requestToken?.pid===pid?this.requestToken:null;
    const reject=message=>{this.hooks.sendTo(pid,{t:'pke',table:this.id,e:'error',message});this.hooks.sendTo(pid,{t:'pk',st:this.publicState()});return false;};
    if(expected&&(expected.hand!==this.handNo||expected.revision!==this.revision))return reject('La mesa cambió. Revisá tu turno antes de confirmar.');
    const i=this.seatOf(pid);if(i<0||i!==this.turn||!STREETS.includes(this.phase))return false;
    const s=this.seats[i];if(!s.inHand||s.folded||s.allin||s.leaving)return false;
    const toCall=Math.max(0,this.currentBet-s.bet),beforeBet=this.currentBet;
    switch(act){
      case 'fold':s.folded=true;break;
      case 'check':if(toCall>0)return reject('Tenés que igualar la apuesta o retirarte.');break;
      case 'call':this._post(i,toCall);break;
      case 'raise':case 'bet':case 'allin':{
        const max=s.bet+s.chips;
        if(act!=='allin'&&(!Number.isSafeInteger(amount)||amount<=s.bet))return reject('Ingresá una cantidad válida de fichas.');
        const target=act==='allin'?max:Math.min(amount,max),minimum=this.currentBet>=BB?this.currentBet+this.minRaise:BB;
        if(target>this.currentBet){if(!this._mayRaise(i))return reject('Esta apuesta no habilita otra subida: podés igualar o retirarte.');if(target<minimum&&target!==max)return reject('La subida mínima es a '+minimum+' fichas.');}
        else if(target!==max)return reject('Esa cantidad no alcanza para subir.');
        const raiseBy=target-this.currentBet;this._post(i,target-s.bet);
        if(target>this.currentBet){if(raiseBy>=this.minRaise)this.minRaise=raiseBy;this.currentBet=target;}
        act=s.allin?'allin':beforeBet===0?'bet':'raise';break;
      }
      default:return false;
    }
    if(!this._automaticTimeout)s.timeouts=0;
    s.acted=true;s.actedAt=this.currentBet;
    this.lastAction={seat:i,name:s.name,act,amount:s.bet,seq:(this.actionSeq=(this.actionSeq||0)+1)};
    this.history=[...(this.history||[]),this.lastAction].slice(-12);
    this.hooks.broadcast({t:'pke',table:this.id,e:act,seat:i,amount:s.bet});this.botAt=0;this._advance();return true;
  }
  _roundDone(){const live=this.contenders().filter(i=>!this.seats[i].allin);if(!live.length)return true;if(live.length===1&&this.seats[live[0]].bet>=this.currentBet)return true;return live.every(i=>this.seats[i].acted&&this.seats[i].bet===this.currentBet);}
  leave(pid){const i=this.seatOf(pid);if(i<0)return;const s=this.seats[i];s.leaving=true;if(s.inHand&&!s.folded&&!s.allin&&STREETS.includes(this.phase)){s.folded=true;if(this.turn===i)this._advance();}if(!s.inHand||['idle','showdown'].includes(this.phase))this.seats[i]=null;if(!s.bot)this._fillBots();this._checkOnlyOne();this._publish();}
  rebuy(pid){const i=this.seatOf(pid),s=this.seats[i];if(!s||s.chips>0||s.inHand&&!['idle','showdown'].includes(this.phase))return;s.chips=START_CHIPS;s.sitOut=false;s.timeouts=0;this.hooks.sys(s.name+' recibió '+START_CHIPS+' fichas de juego.');this._maybeStart();this._publish();}
  _award(contenders,showdown=false){
    this.runoutAt=0;this.deadline=0;this.refunds=[];
    const all=this.seats.map((s,i)=>s?.inHand?i:-1).filter(i=>i>=0);
    const ranked=[...all].sort((a,b)=>this.seats[b].total-this.seats[a].total);
    if(ranked.length){const top=this.seats[ranked[0]],extra=top.total-(this.seats[ranked[1]]?.total||0);if(extra>0){top.total-=extra;top.bet=Math.max(0,top.bet-extra);top.chips+=extra;this.refunds.push({seat:ranked[0],name:top.name,amount:extra});}}
    const scores=new Map();if(showdown)for(const i of contenders)scores.set(i,bestHand([...this.seats[i].cards,...this.board]));
    const winners=new Map(),levels=[...new Set(all.map(i=>this.seats[i].total).filter(n=>n>0))].sort((a,b)=>a-b);
    const clockwise=(a,b)=>((a-this.dealer-1+this.seats.length)%this.seats.length)-((b-this.dealer-1+this.seats.length)%this.seats.length);
    const pay=(eligible,pot)=>{let best=[];for(const i of eligible){if(!best.length||showdown&&compareHands(scores.get(i).score,scores.get(best[0]).score)>0)best=[i];else if(!showdown||compareHands(scores.get(i).score,scores.get(best[0]).score)===0)best.push(i);}best.sort(clockwise);if(!best.length)return;let rem=pot%best.length;const share=Math.floor(pot/best.length);for(const i of best){const add=share+(rem-->0?1:0);this.seats[i].chips+=add;winners.set(i,(winners.get(i)||0)+add);}};
    if(contenders.length===1)pay(contenders,all.reduce((n,i)=>n+this.seats[i].total,0));
    else{let previous=0;for(const level of levels){const pot=all.reduce((n,i)=>n+Math.max(0,Math.min(this.seats[i].total,level)-previous),0);const eligible=contenders.filter(i=>this.seats[i].total>=level);previous=level;if(pot)pay(eligible.length?eligible:contenders,pot);}}
    this.phase='showdown';this.turn=-1;
    this.result=[...winners].map(([i,amount])=>({seat:i,name:this.seats[i].name,amount,hand:showdown?handName(scores.get(i).score):null,best:showdown?scores.get(i).cards:null}));
    this.settledPot=this.result.reduce((n,r)=>n+r.amount,0);
    for(const r of this.result)this.hooks.sys(r.name+' gana '+r.amount+' fichas'+(r.hand?' con '+r.hand:'')+'.');
    this.hooks.broadcast({t:'pke',table:this.id,e:'win'});
    for(const s of this.seats)if(s){s.bet=0;s.inHand=s.inHand&&!s.leaving;}
    this.nextAt=Date.now()+10000;this._publish();
  }
  tick(now){
    const current=this.seats[this.turn];this._automaticTimeout=!!current&&!current.bot&&!!this.deadline&&now>this.deadline;
    try{super.tick(now);}finally{this._automaticTimeout=false;}
    if(this.phase==='idle')for(const s of this.seats)if(s&&!this.nextAt){s.inHand=false;s.bet=0;s.total=0;}
  }
  publicState(){const st=super.publicState();return {...st,revision:this.revision||0,variant:'Texas Hold’em sin límite',turnMs:35000,settledPot:this.settledPot||0,refunds:this.refunds||[],history:this.history||[],seats:st.seats.map((s,i)=>s?{...s,total:this.seats[i].total,leaving:!!this.seats[i].leaving,raiseAllowed:this._mayRaise(i)}:null)};}
  _publish(){const key=this.handNo+':'+this.phase+':'+this.turn;if(this.turn>=0&&key!==this._turnKey){this._turnKey=key;this.deadline=Date.now()+35000;}this.revision=(this.revision||0)+1;super._publish();}
}
