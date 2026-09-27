// Shared hand evaluation. Only the server decides outcomes; clients evaluate their own visible cards.
export const RANKS='23456789TJQKA';
const HANDS=['Carta alta','Par','Doble par','Trío','Escalera','Color','Full','Póker','Escalera de color'];
const PLURAL={14:'ases',13:'reyes',12:'reinas',11:'jotas',10:'dieces',9:'nueves',8:'ochos',7:'sietes',6:'seises',5:'cincos',4:'cuatros',3:'treses',2:'doses'};
export const rankValue=c=>RANKS.indexOf(c[0])+2;
export function compareHands(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d;}return 0;}
function evaluateFive(cards){
 const v=cards.map(rankValue).sort((a,b)=>b-a),u=[...new Set(v)],flush=cards.every(c=>c[1]===cards[0][1]);
 const straight=u.length===5?(v[0]-v[4]===4?v[0]:v.join(',')==='14,5,4,3,2'?5:0):0;
 const counts=new Map();for(const n of v)counts.set(n,(counts.get(n)||0)+1);
 const g=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
 if(straight&&flush)return [8,straight];if(g[0][1]===4)return [7,g[0][0],g[1][0]];
 if(g[0][1]===3&&g[1][1]===2)return [6,g[0][0],g[1][0]];
 if(flush)return [5,...v];if(straight)return [4,straight];
 if(g[0][1]===3)return [3,...g.map(x=>x[0])];if(g[0][1]===2&&g[1][1]===2)return [2,...g.map(x=>x[0])];
 if(g[0][1]===2)return [1,...g.map(x=>x[0])];return [0,...v];
}
export function bestHand(cards){
 if(!Array.isArray(cards)||cards.length<5||cards.length>7||new Set(cards).size!==cards.length||cards.some(c=>!/^[2-9TJQKA][shdc]$/.test(c)))return {score:null,cards:[]};
 let score=null,best=[];const n=cards.length;
 for(let a=0;a<n-4;a++)for(let b=a+1;b<n-3;b++)for(let c=b+1;c<n-2;c++)for(let d=c+1;d<n-1;d++)for(let e=d+1;e<n;e++){
  const five=[cards[a],cards[b],cards[c],cards[d],cards[e]],s=evaluateFive(five);if(!score||compareHands(s,score)>0){score=s;best=five;}
 }
 return {score,cards:best};
}
export function handName(s){return !s?'Sin jugada':s[0]===8&&s[1]===14?'Escalera real':HANDS[s[0]];}
export function describeHand(cards){const h=bestHand(cards),s=h.score;if(!s)return cards.length===2&&cards[0][0]===cards[1][0]?`Par de ${PLURAL[rankValue(cards[0])]}`:'Esperando las cartas compartidas';if([1,3,7].includes(s[0]))return `${handName(s)} de ${PLURAL[s[1]]}`;if(s[0]===2)return `Doble par: ${PLURAL[s[1]]} y ${PLURAL[s[2]]}`;if(s[0]===6)return `Full de ${PLURAL[s[1]]} y ${PLURAL[s[2]]}`;return handName(s);}
export function legalActions(st,index){
 const me=st?.seats?.[index];const ready=!!me&&st.turn===index&&me.inHand!==false&&!me.folded&&!me.allin&&!me.leaving&&['preflop','flop','turn','river'].includes(st.phase);
 const toCall=me?Math.max(0,st.currentBet-me.bet):0,stack=me?.chips||0,max=(me?.bet||0)+stack;
 const fullMin=st?.currentBet>=(st?.bb||20)?st.currentBet+st.minRaise:(st?.bb||20);
 return {ready,toCall,pay:Math.min(toCall,stack),stack,max,min:Math.min(max,fullMin),fullMin,canRaise:ready&&max>st.currentBet&&me.raiseAllowed!==false,canCheck:ready&&toCall===0};
}
export function pokerKey(code,{repeat=false,typing=false,modified=false}={}){
 if(typing||modified||repeat&&!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(code))return null;
 return ({Space:'match',KeyA:'bet',KeyF:'fold',KeyT:'allin',KeyH:'help',KeyI:'history',KeyX:'leave',KeyR:'return',Enter:'confirm',Escape:'cancel',ArrowLeft:'less',ArrowDown:'less',ArrowRight:'more',ArrowUp:'more'})[code]||null;
}
