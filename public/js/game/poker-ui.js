// Keyboard-first table UI; all financial decisions remain server-authoritative.
import { G } from '../core/G.js';
import { bestHand,describeHand,legalActions,pokerKey } from '../shared/poker-rules.js';
const SUITS={s:'♠',h:'♥',d:'♦',c:'♣'},SUIT_NAMES={s:'picas',h:'corazones',d:'diamantes',c:'tréboles'};
const fmt=n=>Math.max(0,Number(n)||0).toLocaleString('es-AR');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shortcut=(key,text,command,cls='')=>`<button type="button" class="pkr-action ${cls}" data-command="${command}"><kbd>${key}</kbd><span>${text}</span></button>`;
export function cardHTML(card,{small=false,winning=false,empty=false}={}){
 if(!/^[2-9TJQKA][shdc]$/.test(card||''))return `<span class="pkr-card ${empty?'empty':'back'} ${small?'small':''}" aria-label="${empty?'Carta por repartir':'Carta oculta'}"><span>${empty?'·':'D'}</span></span>`;
 const rank=card[0]==='T'?'10':card[0],suit=SUITS[card[1]];
 return `<span class="pkr-card ${/[hd]/.test(card[1])?'red':'black'} ${small?'small':''} ${winning?'winning':''}" aria-label="${rank} de ${SUIT_NAMES[card[1]]}"><span class="pkr-corner">${rank}<small>${suit}</small></span><span class="pkr-pip">${suit}</span><span class="pkr-corner bottom">${rank}<small>${suit}</small></span></span>`;
}
const actionText=a=>!a?'':({fold:'Se retiró',check:'Pasó sin apostar',call:`Igualó a ${fmt(a.amount)}`,bet:`Apostó ${fmt(a.amount)}`,raise:`Subió a ${fmt(a.amount)}`,allin:`Jugó todas · ${fmt(a.amount)}`})[a.act]||'';
const RANKING=[['Escalera real','Las cinco más altas del mismo palo.','As Ks Qs Js Ts'],['Escalera de color','Cinco consecutivas del mismo palo.','9h 8h 7h 6h 5h'],['Póker','Cuatro cartas del mismo valor.','Ks Kh Kd Kc 2d'],['Full','Un trío y un par.','Qs Qh Qd 8c 8d'],['Color','Cinco del mismo palo.','As Js 8s 5s 2s'],['Escalera','Cinco consecutivas de cualquier palo.','9s 8h 7d 6c 5s'],['Trío','Tres cartas del mismo valor.','7s 7h 7d Kc 2s'],['Doble par','Dos pares diferentes.','Js Jh 4d 4c As'],['Par','Dos cartas del mismo valor.','Ts Th Ad 7c 3s'],['Carta alta','Sin combinación: manda la más alta.','As Jh 8d 6c 2s']];
export class PokerInterface {
 constructor(view){
  this.view=view;this.root=view.panel;this.modal=null;this.pending=null;this.notice='';this.visible=false;if(!this.root)return;
  document.body.classList.remove('poker-focused');
  if(!document.querySelector('link[data-poker-style]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/css/poker.css';l.dataset.pokerStyle='1';document.head.append(l);}
  this.root.classList.add('pk-experience');this.root.tabIndex=-1;this.root.setAttribute('aria-label','Texas Hold’em sin límite');
  this.root.innerHTML=`<header class="pkr-header"><div><div class="pkr-eyebrow">DESMADRE / EL SALÓN</div><h1>Póker del salón</h1></div><div class="pkr-table-meta"><strong>TEXAS HOLD’EM <b>SIN LÍMITE</b></strong><span id="pkr-table-info"></span></div><div class="pkr-tools">${shortcut('H','Cómo jugar','help')}${shortcut('I','Jugadas','history')}${shortcut('X','Salir','leave')}</div></header>
  <nav class="pkr-streets" aria-label="Etapas de la mano"><span data-street="0"><b>01</b>Tus dos cartas</span><i></i><span data-street="1"><b>02</b>Tres compartidas</span><i></i><span data-street="2"><b>03</b>Una más</span><i></i><span data-street="3"><b>04</b>La última</span></nav>
  <main class="pkr-stage"><div class="pkr-felt"><div class="pkr-emboss">DESMADRE ♠ POKER CLUB</div></div><div id="pkr-seats"></div><section class="pkr-center" aria-label="Cartas compartidas"><div class="pkr-pot"><span class="pkr-chip-stack" aria-hidden="true"><i></i><i></i><i></i></span><div><small id="pkr-pot-label">EN EL POZO</small><strong id="pkr-pot">0</strong></div><em>fichas</em></div><div id="pkr-board"></div><p id="pkr-board-hint"></p><div id="pkr-sidepots"></div><div id="pkr-result" role="status"></div></section><section class="pkr-private"><div id="pkr-cards"></div><div class="pkr-private-info"><small>TUS CARTAS<span>SOLO VOS LAS VES</span></small><strong id="pkr-hand"></strong><span id="pkr-stack"></span></div></section></main>
  <footer class="pkr-footer"><div class="pkr-turnline"><div><strong id="pkr-turn" role="status" aria-live="polite"></strong><p id="pkr-hint"></p></div><div class="pkr-clock"><span id="pkr-countdown"></span><div><i id="pkr-timer"></i></div></div></div><div class="pkr-controls">${shortcut('Espacio','Pasar','match','primary')}${shortcut('A','Apostar','bet')}${shortcut('F','Retirarme','fold')}${shortcut('T','Todas mis fichas','allin')}<span id="pkr-return"></span></div><div class="pkr-footnote"><span>Tu teclado, tus decisiones. <kbd>V</kbd> para hablar.</span><span>Fichas de juego · Sin dinero real</span></div></footer>
  <div id="pkr-dialog" class="pkr-dialog" hidden><section class="pkr-modal" role="dialog" aria-modal="true" aria-labelledby="pkr-dialog-title" tabindex="-1"><div id="pkr-dialog-body"></div><button class="pkr-close" data-command="cancel" aria-label="Cerrar ventana">✕ <kbd>Esc</kbd></button></section></div>`;
  this.root.addEventListener('click',e=>{const b=e.target.closest('[data-command]');if(b&&!b.disabled)this.command(b.dataset.command);const p=e.target.closest('[data-preset]');if(p)this.setAmount(p.dataset.preset);});
  this.root.addEventListener('input',e=>{if(e.target.id==='pkr-amount')this.updateAmount();});
  this.keyHandler=e=>this.onKey(e);document.addEventListener('keydown',this.keyHandler,true);
 }
 $(id){return this.root?.querySelector('#pkr-'+id);}
 html(id,value){const el=this.$(id);if(el&&el._html!==value){el.innerHTML=value;el._html=value;}}
 text(id,value){const el=this.$(id);if(el&&el.textContent!==String(value))el.textContent=value;}
 get state(){return this.view.st;}get me(){return this.state?.seats?.[this.view.mySeat];}get legal(){return legalActions(this.state,this.view.mySeat);}get token(){return `${this.state?.handNo}:${this.state?.revision}`;}
 render(){
  if(!this.root)return;const st=this.state,seated=this.view.isSeated();this.root.classList.toggle('hidden',!seated);document.body.classList.toggle('poker-focused',seated);
  if(!seated){this.visible=false;this.pending=null;this.modal=null;this.$('dialog').hidden=true;return;}if(!st)return;
  if(!this.visible){this.root.focus({preventScroll:true});this.visible=true;}
  if(this.pending&&this.pending!==this.token){this.pending=null;this.notice='';}
  if(['bet','fold','allin'].includes(this.modal)&&this.modalToken!==this.token){this.close();this.notice='La mesa cambió: revisá la nueva apuesta.';}
  const me=this.me,l=this.legal,end=st.phase==='showdown',phase=['preflop','flop','turn','river'].indexOf(st.phase),results=end?st.result||[]:[];
  this.text('table-info',`Mano ${st.handNo||'—'} · Apuestas iniciales ${st.bb/2} / ${st.bb}`);
  this.root.querySelectorAll('[data-street]').forEach(el=>{el.classList.toggle('current',+el.dataset.street===phase);el.classList.toggle('done',+el.dataset.street<phase||end);});
  this.text('pot',fmt(end?st.settledPot:st.pot));this.text('pot-label',end?'POZO REPARTIDO':'EN EL POZO');
  const best=new Set(end?results.flatMap(r=>r.best||[]):[]);
  this.html('board',Array.from({length:5},(_,i)=>cardHTML(st.board[i],{empty:true,winning:best.has(st.board[i])})).join(''));
  this.text('board-hint',end?'Las mejores cinco cartas deciden la mano.':st.board.length?`${st.board.length} cartas para todos · Combiná con las tuyas`:'Las primeras tres cartas aparecen después de las apuestas.');
  this.html('result',results.map(r=>`<strong>${st.seats[r.seat]?.pid===G.myId?'Ganaste':esc(r.name)+' gana'} ${fmt(r.amount)} fichas</strong><span>${esc(r.hand||'Los demás se retiraron')}</span>`).join(''));
  this.html('sidepots',end?(st.refunds||[]).map(r=>`<span>${esc(r.name)} recupera ${fmt(r.amount)} sin igualar</span>`).join(''):st.seats.some(s=>s?.allin)?'<span>Con todas las fichas en juego: cada jugador disputa solo el pozo que cubre.</span>':'');
  this.html('cards',Array.from({length:2},(_,i)=>cardHTML(this.view.myCards[i],{winning:end&&results.some(r=>r.seat===this.view.mySeat&&(r.best||[]).includes(this.view.myCards[i]))})).join(''));
  this.$('cards').classList.toggle('folded',!!me?.folded);
  this.text('hand',me?.folded?'Te retiraste de esta mano':describeHand([...(this.view.myCards||[]),...st.board]));
  this.text('stack',`${fmt(me?.chips)} fichas disponibles${me?.bet?' · '+fmt(me.bet)+' ya apostadas':''}${st.dealer===this.view.mySeat?' · Repartís vos':''}`);
  this.html('seats',st.seats.map((s,i)=>{
   if(i===this.view.mySeat)return '';const pos=(i-this.view.mySeat+st.seats.length)%st.seats.length;
   if(!s)return `<div class="pkr-seat empty-seat pos-${pos}">ASIENTO LIBRE</div>`;
   const last=[...(st.history||[])].reverse().find(a=>a.seat===i),won=results.some(r=>r.seat===i),status=s.folded?'Fuera de esta mano':s.allin?'Todas las fichas en juego':s.sitOut?'En pausa':!s.inHand?'Espera la próxima':st.turn===i?'Pensando…':actionText(last);
   return `<div class="pkr-seat pos-${pos} ${st.turn===i?'acting':''} ${s.folded?'folded':''} ${won?'winner':''}"><div class="pkr-seat-top"><span class="pkr-avatar">${esc(s.name.slice(0,1))}</span><div><strong>${esc(s.name)}</strong><small>${s.bot?'Parroquiano':'Jugador'}${st.dealer===i?' · Reparte':''}</small></div>${st.dealer===i?'<b class="pkr-dealer" title="Reparte esta mano">D</b>':''}</div><span class="pkr-seat-money">${fmt(s.chips)} <small>fichas</small></span><span class="pkr-seat-status">${esc(status)}</span>${s.hasCards||s.shown?'<div class="pkr-mini-cards">'+(s.shown||[null,null]).map(c=>cardHTML(c,{small:true,winning:won})).join('')+'</div>':''}${s.bet?`<span class="pkr-wager">Apostó ${fmt(s.bet)}</span>`:''}</div>`;
  }).join(''));
  const title=this.pending?'Enviando tu jugada…':me?.sitOut?'Estás en pausa':end?'Mano terminada':st.phase==='idle'?'Preparando la mesa':me?.folded?'Seguís mirando esta mano':me?.allin?'Tus fichas ya están en juego':!me?.inHand?'Entrás en la próxima mano':l.ready?'Es tu turno':st.turn>=0?`Turno de ${st.seats[st.turn]?.name||'otro jugador'}`:'Se reparten las cartas que faltan';
  this.text('turn',title);this.root.classList.toggle('my-turn',l.ready&&!this.pending);
  this.text('hint',this.notice||(l.ready?(l.toCall?`Igualá ${fmt(l.pay)} fichas para seguir${l.pay<l.toCall?' (todas las que te quedan)':''}, aumentá la apuesta o retirate.`:'Nadie te pide más fichas. Podés pasar gratis o apostar.'):end?'La próxima mano empieza automáticamente.':me?.folded?'No perdés más fichas. Volvés en la próxima mano.':'Tus cartas son privadas. H abre la guía de jugadas.'));
  this.root.querySelector('[data-command="match"] span').textContent=l.toCall?`Igualar · ${fmt(l.pay)}`:'Pasar sin apostar';
  this.root.querySelector('[data-command="bet"] span').textContent=st.currentBet?'Subir apuesta':'Apostar';
  for(const cmd of ['match','bet','fold','allin'])this.root.querySelector(`[data-command="${cmd}"]`).disabled=!l.ready||!!this.pending||(['bet','allin'].includes(cmd)&&!l.canRaise&&(cmd==='bet'||l.max>st.currentBet));
  this.html('return',me?.sitOut?shortcut('R','Volver a jugar','return'):me?.chips===0&&['idle','showdown'].includes(st.phase)?shortcut('R','Recibir 2.000 fichas','return'):'');this.tick();
 }
 tick(){if(!this.visible||!this.state)return;const st=this.state,waiting=['idle','showdown'].includes(st.phase),deadline=waiting?st.nextAt:st.turn>=0?st.deadline:0,now=G.net?.now?.()||Date.now(),left=Math.max(0,Math.ceil((deadline-now)/1000));this.text('countdown',deadline?`${waiting?'Próxima mano':'Para decidir'} · ${left}s`:'');this.$('timer').style.width=(deadline?Math.max(0,Math.min(100,(deadline-now)/(waiting?10000:st.turnMs||35000)*100)):0)+'%';this.$('timer').classList.toggle('urgent',!waiting&&left<=8&&st.turn===this.view.mySeat);}
 onKey(e){
  if(!this.visible||this.root.classList.contains('hidden')||G.poker&&G.poker!==this.view||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.code==='Tab'&&this.modal){const list=[...this.$('dialog').querySelectorAll('button:not(:disabled),input')];if(list.length){e.preventDefault();e.stopImmediatePropagation();const i=list.indexOf(document.activeElement);list[(i+(e.shiftKey?-1:1)+list.length)%list.length].focus();}return;}
  const typing=e.target?.matches?.('input,textarea,select,[contenteditable="true"]'),amount=e.target?.id==='pkr-amount';if(typing&&!amount)return;
  const intent=pokerKey(e.code);if(!intent||amount&&!['confirm','cancel','less','more'].includes(intent))return;
  e.preventDefault();e.stopImmediatePropagation();if(!pokerKey(e.code,{repeat:e.repeat}))return;
  if(['more','less'].includes(intent)){if(this.modal==='bet')this.adjust((intent==='more'?1:-1)*(e.shiftKey?5:1));return;}this.command(intent);
 }
 command(cmd){const l=this.legal;
  if(cmd==='cancel'){this.modal?this.close():this.open('leave');return;}if(cmd==='confirm'){this.confirm();return;}
  if(['help','history','leave'].includes(cmd)){this.modal===cmd?this.close():this.open(cmd);return;}
  if(cmd==='return'){if(this.me?.sitOut)this.view.net.send({t:'pk',a:'sitin'});else if(this.me?.chips===0&&['idle','showdown'].includes(this.state.phase))this.view.net.send({t:'pk',a:'rebuy'});return;}
  if(cmd==='less'||cmd==='more'){this.adjust(cmd==='more'?1:-1);return;}
  if(this.modal||this.pending||!l.ready)return;
  if(cmd==='match'){l.pay===l.stack&&l.toCall>0?this.open('allin'):this.submit(l.toCall?'call':'check');}
  else if(cmd==='bet'&&l.canRaise)this.open('bet');else if(cmd==='fold')this.open('fold');else if(cmd==='allin'&&(l.canRaise||l.max<=this.state.currentBet))this.open('allin');
 }
 submit(act,amount=0){if(this.pending||!this.legal.ready)return;this.pending=this.token;this.close();if(this.view.act(act,amount)===false){this.pending=null;this.notice='La jugada no está disponible.';}this.render();}
 error(message){this.pending=null;this.notice=message||'Revisá la jugada.';this.render();}
 close(){this.modal=null;this.$('dialog').hidden=true;this.root.focus({preventScroll:true});}
 open(mode){
  this.modal=mode;this.modalToken=this.token;const l=this.legal;let body='';
  if(mode==='help')body=`<div class="pkr-eyebrow">GUÍA DE BOLSILLO</div><h2 id="pkr-dialog-title">Dos cartas tuyas.<br>Cinco para todos.</h2><p>Formá la mejor jugada de <b>cinco cartas</b> usando las tuyas y las compartidas. Podés usar las dos tuyas, una sola o ninguna. También ganás si todos los demás se retiran.</p><div class="pkr-rule-notes"><p><b>Pasar</b> no cuesta fichas y solo se permite si no te falta igualar nada. <b>Igualar</b> agrega lo que te falta para seguir. <b>Subir</b> aumenta la apuesta. <b>Retirarte</b> abandona esta mano y lo que ya apostaste.</p><p><b>Sin límite:</b> podés jugar hasta todas tus fichas. La subida mínima equivale a la última subida completa. Si no te alcanza para igualar, jugás lo que te queda y solo disputás el pozo que cubrís; los demás forman un pozo aparte.</p><p>Dos jugadores ponen las apuestas iniciales (10 y 20), rotando cada mano. Se reparten <b>3 + 1 + 1</b> cartas compartidas, con apuestas entre cada reparto. En empate se divide el pozo. Las cartas restantes de la jugada desempatan. El as puede ser alto o formar A–2–3–4–5.</p></div><h3>De mayor a menor</h3><div class="pkr-ranking">${RANKING.map((r,i)=>`<article><span class="pkr-rank-number">${String(i+1).padStart(2,'0')}</span><div><strong>${r[0]}</strong><div class="pkr-example">${r[2].split(' ').map(c=>cardHTML(c,{small:true})).join('')}</div><p>${r[1]}</p></div></article>`).join('')}</div><p class="pkr-warning">La partida online sigue mientras consultás la guía. H o Esc la cierran.</p>`;
  else if(mode==='history')body=`<div class="pkr-eyebrow">MANO ${this.state.handNo}</div><h2 id="pkr-dialog-title">Así viene la mano</h2><ol class="pkr-history">${(this.state.history||[]).map(a=>`<li><b>${esc(a.name||this.state.seats[a.seat]?.name)}</b><span>${esc(actionText(a))}</span></li>`).join('')||'<li>Todavía no hubo jugadas.</li>'}</ol><p>Las últimas doce acciones. Las cartas privadas nunca aparecen acá.</p>`;
  else if(mode==='bet')body=`<div class="pkr-eyebrow">TU JUGADA</div><h2 id="pkr-dialog-title">${this.state.currentBet?'Subir la apuesta':'Poner fichas en juego'}</h2><p>Elegí tu <b>apuesta total de esta ronda</b>. Ya pusiste ${fmt(this.me.bet)} fichas.</p><label class="pkr-amount-label">Apuesta total<input id="pkr-amount" type="number" inputmode="numeric" min="${l.min}" max="${l.max}" step="1" value="${l.min}" autocomplete="off"></label><div class="pkr-adjust"><button data-command="less" aria-label="Restar fichas">−</button><span><kbd>←</kbd> <kbd>→</kbd> Ajustar · Shift: paso grande<br>También podés escribir la cantidad exacta.</span><button data-command="more" aria-label="Sumar fichas">+</button></div><div class="pkr-presets"><button data-preset="min">Mínimo</button><button data-preset="half">Medio pozo</button><button data-preset="pot">Un pozo</button><button data-preset="max">Todas</button></div><p id="pkr-amount-info"></p>${shortcut('Enter','Confirmar apuesta','confirm','primary')}<p class="pkr-warning">Sin límite: hasta ${fmt(l.max)} en esta ronda. Esc cancela.</p>`;
  else{const all=mode==='allin',leave=mode==='leave';body=`<div class="pkr-eyebrow">CONFIRMAR JUGADA</div><h2 id="pkr-dialog-title">${all?`Jugar ${fmt(l.stack)} fichas`:leave?'¿Te levantás de la mesa?':'¿Te retirás de esta mano?'}</h2><p>${all?'No te quedan fichas para nuevas apuestas en esta mano. Seguís jugando por el pozo que te corresponde.':leave?(this.me?.allin?'El resultado se resolverá aunque salgas: tus fichas ya están en juego.':'Si la mano está en curso, dejás en el pozo lo que ya apostaste.'):(l.toCall?'Dejás lo apostado en el pozo. Volvés a jugar la próxima mano.':'Podés pasar sin poner más fichas. No hace falta retirarte para esperar.')}</p>${shortcut('Enter',all?'Confirmar: jugar todas':leave?'Sí, salir de la mesa':'Sí, retirarme','confirm','primary')}<p class="pkr-warning">Esc cancela. Nada se envía hasta confirmar.</p>`;}
  this.$('dialog-body').innerHTML=body;this.$('dialog').hidden=false;if(mode==='bet'){this.updateAmount();this.$('amount').focus();this.$('amount').select();}else this.$('dialog').querySelector('.pkr-modal').focus();
 }
 adjust(direction){const input=this.$('amount');if(!input||this.modal!=='bet')return;const l=this.legal;input.value=Math.max(l.min,Math.min(l.max,(Number(input.value)||l.min)+direction*(this.state.bb||20)));this.updateAmount();}
 setAmount(preset){if(this.modal!=='bet')return;const l=this.legal;this.$('amount').value=preset==='max'?l.max:preset==='min'?l.min:Math.max(l.min,Math.min(l.max,this.state.currentBet+Math.round((this.state.pot+l.toCall)*(preset==='half'?.5:1))));this.updateAmount();}
 updateAmount(){const input=this.$('amount');if(!input)return;const l=this.legal,n=Number(input.value),ok=input.value!==''&&Number.isSafeInteger(n)&&n>=l.min&&n<=l.max;this.text('amount-info',ok?`Agregás ${fmt(n-this.me.bet)} fichas · Te quedan ${fmt(l.max-n)}`:`Elegí entre ${fmt(l.min)} y ${fmt(l.max)} fichas.`);this.$('dialog').querySelector('[data-command="confirm"]').disabled=!ok;}
 confirm(){if(!this.modal)return;const mode=this.modal;if(['help','history'].includes(mode)){this.close();return;}if(mode==='leave'){this.close();this.view.leave();return;}if(this.modalToken!==this.token){this.close();this.error('La mesa cambió. Elegí de nuevo.');return;}if(mode==='bet'){const l=this.legal,input=this.$('amount'),n=Number(input.value);if(!input.value||!Number.isSafeInteger(n)||n<l.min||n>l.max||!l.canRaise)return;if(n===l.max){this.open('allin');return;}this.submit(this.state.currentBet?'raise':'bet',n);}else this.submit(mode==='allin'?'allin':'fold');}
 dispose(){document.removeEventListener('keydown',this.keyHandler,true);document.body.classList.remove('poker-focused');}
}
