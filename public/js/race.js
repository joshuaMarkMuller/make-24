/* race.js — two-player race screen with matches and a scoreboard (Stages 2–3). Talks to server/index.js over Socket.IO. Needs solver.js. */

const $=id=>document.getElementById(id);
const socket=io();
const SUITS=[{s:'♠',red:false},{s:'♥',red:true},{s:'♣',red:false},{s:'♦',red:true}];
const PREC={'+':1,'−':1,'×':2,'÷':2};

const R={
  me:null,myId:null,state:null,
  nums:null,suits:null,slots:[],history:[],moves:[],sel:null,op:null,
  locked:true,start:0,tick:null,shownResultRound:0
};

/* ---------- Screens ---------- */
function showScreen(name){
  for(const id of ['joinPanel','lobbyPanel','countdown','board'])$(id).hidden=(id!==name);
}
function setMsg(t,cls){const m=$('msg');m.textContent=t;m.className=cls||''}

/* ---------- Joining ---------- */
$('joinForm').onsubmit=e=>{
  e.preventDefault();
  const name=$('nameInput').value.trim();
  if(!name){$('joinMsg').textContent='Type your name first.';return}
  socket.emit('join',name,res=>{
    if(!res.ok){$('joinMsg').textContent=res.error;return}
    R.me=res.name;R.myId=res.id;$('youPanel').textContent='You: '+R.me;
    render();
  });
};
$('readyBtn').onclick=()=>socket.emit('ready');
$('againBtn').onclick=()=>{
  stopCascade();
  if(R.state&&R.state.phase==='final'){hide('resultDlg');socket.emit('ready');return} // new match → waiting room
  socket.emit('ready');$('againBtn').disabled=true;
};
$('roundsSel').onchange=()=>socket.emit('setRounds',+$('roundsSel').value);

/* ---------- Server updates ---------- */
socket.on('connect',()=>{$('status').textContent='Connected'});
socket.on('disconnect',()=>{$('status').textContent='Connection lost. Refresh the page to rejoin.';R.me=null;stopTimer()});
socket.on('notice',t=>{$('lobbyMsg').textContent=t});
socket.on('state',s=>{R.state=s;render()});
socket.on('round',r=>{
  // Same cards for both players; suits are just for looks
  R.nums=r.nums;R.suits=r.nums.map(()=>SUITS[Math.floor(Math.random()*4)]);
  resetBoard();R.locked=true;hide('resultDlg');stopCascade();
  O.seq=null;O.layout=[true,true,true,true];O.pending=null;buildOpp('deal');
  if(!R.me)return;
  showScreen('countdown');
  let n=Math.round(r.countdownMs/1000);
  const cd=$('countdown');cd.classList.remove('go');cd.textContent=n;
  const iv=setInterval(()=>{
    n--;
    if(n>0){cd.textContent=n;return}
    clearInterval(iv);
    R.locked=false;showScreen('board');
    setMsg('Go! Pick a card, an operation, then another card.');
    renderCards('deal');startTimer();
  },1000);
});

function render(){
  const s=R.state;if(!s)return;
  const me=s.players.find(p=>p.id===R.myId);
  const opp=s.players.find(p=>p.id!==R.myId);
  $('status').textContent=(s.phase==='lobby'||!s.matchRound)?`Waiting room · ${s.matchRounds}-round match`:`Round ${s.matchRound} of ${s.matchRounds}`;
  $('scorePanel').textContent=me&&s.matchRound&&s.phase!=='lobby'?`Score: ${me.points.toLocaleString()}`+(opp?` – ${opp.points.toLocaleString()}`:''):'Score: –';
  $('oppPanel').textContent='Opponent: '+(opp?opp.name:'–');
  renderOpp(opp,s);

  if(!me){ // not joined yet
    showScreen('joinPanel');
    $('joinMsg').textContent=s.players.length>=2?'This game already has two players.':'';
    return;
  }
  if(s.phase==='lobby'){
    stopTimer();showScreen('lobbyPanel');
    const list=$('playerList');list.innerHTML='';
    for(let i=0;i<2;i++){
      const p=s.players[i],li=document.createElement('li');
      if(p){li.innerHTML=`<span>${esc(p.name)}${p.id===R.myId?'<span class="you">(you)</span>':''}</span><span class="tag${p.ready?' ready':''}">${p.ready?'Ready':'Not ready'}</span>`}
      else{li.className='empty';li.textContent='Waiting for a player to join…'}
      list.appendChild(li);
    }
    $('lobbyTitle').textContent=s.players.length<2?'Waiting for an opponent':'Both players are here';
    const host=s.players.find(p=>p.id===s.hostId),amHost=s.hostId===R.myId;
    $('roundsSel').value=String(s.matchRounds);$('roundsSel').disabled=!amHost;
    $('roundsNote').textContent=amHost?'You choose the match length.':`Chosen by ${host?host.name:'the host'}.`;
    $('readyBtn').disabled=me.ready;
    $('readyBtn').textContent=me.ready?'Waiting for opponent…':"I'm Ready";
    if(s.players.length<2)$('lobbyMsg').textContent=$('lobbyMsg').textContent||'Ask someone to open this page and join.';
    else if(me.ready)$('lobbyMsg').textContent='The round starts when both players are ready.';
    else $('lobbyMsg').textContent='Press I\'m Ready when you\'re set.';
  }
  if(s.phase==='playing'&&me.gaveUp)setMsg('You gave up. Your opponent can still finish.','bad');
  if((s.phase==='result'||s.phase==='final')&&s.result&&R.shownResultRound!==s.round){R.shownResultRound=s.round;showResult(s.result,s)}
  if(s.phase==='result'){ // waiting for both players to press Next Round
    const oppReady=opp&&opp.ready;
    $('againBtn').disabled=me.ready;
    if(me.ready)$('againNote').textContent=`Waiting for ${opp?opp.name:'your opponent'}…`;
    else if(oppReady)$('againNote').textContent=`${opp.name} is ready for the next round.`;
  }
}

function showResult(res,s){
  R.locked=true;R.sel=null;R.op=null;stopTimer();
  const won=res.winnerId===R.myId,final=s.phase==='final';
  const roundName=`round ${s.matchRound}`;
  let icon,title,expr,sub;
  if(res.winner){
    title=won?`You won ${roundName}!`:`${res.winner} won ${roundName}`;
    expr=`${res.expr} = 24`;
    sub=`${won?'You':res.winner} made 24 in ${res.time.toFixed(1)} seconds: +${res.points} points.`;
    setMsg(won?'You made 24 first!':`${res.winner} made 24 first.`,won?'good':'bad');
  }else{
    title=`Nobody won ${roundName}`;
    expr=res.solution?`${res.solution} = 24`:'';
    sub='Both players gave up, so no points this round. Here is one answer.';
  }
  icon=won?'★':(res.winner?'!':'i');
  // Scoreboard: most points first, then most rounds won
  const rows=[...s.players].sort((a,b)=>b.points-a.points||b.wins-a.wins);
  const top=rows[0],tie=rows.length>1&&rows[1].points===top.points&&rows[1].wins===top.wins;
  if(final){
    const meWin=!tie&&top.id===R.myId;
    title=tie?"It's a draw!":(meWin?'You win the match!':`${top.name} wins the match!`);
    icon=tie?'=':(meWin?'★':'!');
    sub=`Last round: ${sub}`;
  }
  $('resIcon').textContent=icon;$('resIcon').classList.toggle('warn',icon==='!');
  $('resTitle').textContent=title;$('resExpr').textContent=expr;$('resSub').textContent=sub;
  // Scoreboard: one progress bar per player. The top score fills the bar; the
  // others are scaled against it, so the bar lengths show the gap between players.
  const max=Math.max(...rows.map(p=>p.points));
  const pct=v=>max>0?(v/max)*100:0;
  $('scoreRows').innerHTML=rows.map((p,i)=>{
    const same=q=>q&&q.points===p.points&&q.wins===p.wins;
    const rank=rows.findIndex(same)+1,tied=rows.filter(same).length>1;
    const before=p.points-(p.gained||0);
    return `<div class="sb-row${p.id===R.myId?' me':''}${i===0&&!tie&&max>0?' lead':''}">`+
      `<span class="sb-rank">${tied?rank+'=':rank}</span>`+
      `<span class="sb-name"><span class="sb-line"><b>${esc(p.name)}</b>${p.id===R.myId?' <span class="you">(you)</span>':''}</span><small>${p.wins} round${p.wins===1?'':'s'} won</small></span>`+
      `<span class="sb-track"><span class="sb-fill" data-to="${pct(p.points)}" style="width:${pct(before)}%"></span></span>`+
      `<span class="sb-pts"><span class="sb-num" data-from="${before}" data-to="${p.points}">${before}</span>`+
      `${p.gained?`<span class="gain">+${p.gained}</span>`:''}</span></div>`;
  }).join('');
  const left=s.matchRounds-s.matchRound;
  $('againBtn').textContent=final?'New Match':'Next Round';$('againBtn').disabled=false;
  $('againNote').textContent=final?'Match over.':`${left} round${left>1?'s':''} to go.`;
  renderCards();
  const celebrate=final?(!tie&&top.id===R.myId):won;
  const open=()=>{show('resultDlg');growScores()};
  if(celebrate)runCascade(open);else open();
}

// Grow each scoreboard bar from its old length to its new one and count the points up
function growScores(){
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,dur=reduce?0:900;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    document.querySelectorAll('#scoreRows .sb-fill').forEach(f=>{f.style.transitionDuration=dur+'ms';f.style.width=f.dataset.to+'%'});
  }));
  const nums=[...document.querySelectorAll('#scoreRows .sb-num')],t0=performance.now();
  const tick=now=>{
    const k=dur?Math.min(1,(now-t0)/dur):1,e=1-Math.pow(1-k,3);
    nums.forEach(n=>{const a=+n.dataset.from,b=+n.dataset.to;n.textContent=Math.round(a+(b-a)*e).toLocaleString()});
    if(k<1)requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- Playing the cards ---------- */
const fmtText=v=>String(v).replace('-','−');
function resetBoard(){
  R.slots=R.nums.map((n,i)=>({v:n,e:String(n),prec:3,base:true,suit:R.suits[i]}));
  R.history=[];R.moves=[];R.sel=null;R.op=null;
}
function renderCards(anim){
  const wrap=$('cards');wrap.innerHTML='';
  R.slots.forEach((s,i)=>{
    const slot=document.createElement('div');slot.className='slot';
    if(s){
      const c=document.createElement('div');const label=fmtText(s.v);
      c.className='card'+(s.suit.red?' red':'')+(R.sel===i?' sel':'')+(anim==='deal'?' deal':(s.fresh?' pop':''));
      if(anim==='deal')c.style.animationDelay=(i*0.09)+'s';
      c.innerHTML=`<span class="corner tl">${label}<span class="s">${s.suit.s}</span></span>`+
        `<div class="val">${label}</div><div class="suit-big">${s.suit.s}</div>`+
        (s.base?'':`<div class="expr">${s.e}</div>`)+
        `<span class="corner br">${label}<span class="s">${s.suit.s}</span></span>`;
      c.onclick=()=>clickCard(i);s.fresh=false;
      slot.appendChild(c);slot.insertAdjacentHTML('beforeend',`<span class="key">${i+1}</span>`);
    }
    wrap.appendChild(slot);
  });
  document.querySelectorAll('.op').forEach(b=>b.classList.toggle('sel',b.dataset.op===R.op));
}
function canPlay(){
  const me=R.state&&R.state.players.find(p=>p.id===R.myId);
  return !R.locked&&R.state&&R.state.phase==='playing'&&me&&!me.gaveUp;
}
function clickCard(i){
  if(!canPlay())return;
  if(R.sel===null){R.sel=i;renderCards();sendProgress();return}
  if(R.sel===i){R.sel=null;R.op=null;renderCards();sendProgress();return}
  if(!R.op){R.sel=i;renderCards();sendProgress();return}
  const a=R.slots[R.sel],b=R.slots[i],op=R.op;
  let v;
  if(op==='+')v=a.v+b.v;else if(op==='−')v=a.v-b.v;else if(op==='×')v=a.v*b.v;
  else{
    if(b.v===0){setMsg("You can't divide by zero!",'bad');R.op=null;renderCards();return}
    if(a.v%b.v!==0){setMsg(`${fmtText(a.v)} ÷ ${fmtText(b.v)} isn't a whole number. Try something else.`,'bad');R.op=null;renderCards();return}
    v=a.v/b.v;
  }
  R.history.push(R.slots.map(s=>s&&{...s}));R.moves.push({a:R.sel,b:i,op});
  const p=PREC[op];
  const L=a.prec<p?`(${a.e})`:a.e;
  const Rt=(b.prec<p||(b.prec===p&&(op==='−'||op==='÷')))?`(${b.e})`:b.e;
  R.slots[i]={v,e:`${L} ${op} ${Rt}`,prec:p,base:false,fresh:true,suit:b.suit};
  const from=R.sel;
  R.slots[R.sel]=null;R.sel=i;R.op=null;
  const left=R.slots.filter(Boolean).length;
  if(left===1)R.sel=null;
  sendProgress({move:{a:from,b:i}});
  if(left===1){
    if(v===24){
      R.locked=true;R.sel=null;setMsg('Checking…');
      socket.emit('submit',R.moves,res=>{if(!res.ok){R.locked=false;setMsg(res.error,'bad')}});
    }else setMsg(`That makes ${fmtText(v)}, not 24. Undo or reset and try again.`,'bad');
  }else setMsg('Keep going…');
  renderCards();
}
function pickOp(op){if(!canPlay())return;if(R.sel===null){setMsg('Pick a card first.','bad');return}R.op=op;renderCards()}
function undo(){if(!canPlay()||!R.history.length)return;R.slots=R.history.pop();R.moves.pop();R.sel=null;R.op=null;sendProgress({kind:'undo'});setMsg('Undone.');renderCards()}
function reset(){if(!canPlay())return;resetBoard();sendProgress({kind:'reset'});setMsg('Cards reset.');renderCards('deal')}
function giveUp(){if(!canPlay())return;R.locked=true;R.sel=null;sendProgress();socket.emit('giveUp');setMsg('You gave up. Your opponent can still finish.','bad');renderCards()}

/* ---------- Opponent's face-down cards ----------
 * We only ever learn the shape of their board (which slots hold cards, which is
 * selected, and each move), never the numbers.
 */
function sendProgress(extra){socket.emit('progress',{layout:R.slots.map(Boolean),sel:R.sel,...(extra||{})})}
const O={seq:null,layout:[true,true,true,true],animating:false,pending:null};
const miniCards=()=>[...document.querySelectorAll('#oppCards .mini-card')];
function buildOpp(anim,popAt){
  miniCards().forEach((c,i)=>{
    c.className='mini-card'+(O.layout[i]?'':' gone')+(anim==='deal'&&O.layout[i]?' deal':'')+(popAt===i?' pop':'');
    c.style.transform='';c.style.animationDelay=anim==='deal'?(i*0.07)+'s':'';
  });
}
function renderOpp(opp,s){
  const side=$('oppSide');
  side.hidden=!opp;
  if(!opp)return;
  if(O.animating){O.pending=[opp,s];return}
  $('oppName').textContent=opp.name;
  side.classList.toggle('gave-up',!!opp.gaveUp);
  const oppWon=s.result&&s.result.winnerId===opp.id&&(s.phase==='result'||s.phase==='final');
  $('oppStatus').innerHTML=oppWon?'Made 24!':opp.gaveUp?'Gave up':(s.phase==='playing'?'Thinking<span class="dots"><i>.</i><i>.</i><i>.</i></span>':'');
  const layout=(opp.layout||[true,true,true,true]).map(Boolean);
  if(O.seq!==opp.moveSeq){
    const prevSeq=O.seq;O.seq=opp.moveSeq;
    const m=opp.lastMove;
    if(prevSeq!==null&&m&&m.kind==='move'&&O.layout[m.a]&&O.layout[m.b]){ // slide card a onto card b
      const cards=miniCards(),ca=cards[m.a],cb=cards[m.b];
      const ra=ca.getBoundingClientRect(),rb=cb.getBoundingClientRect();
      ca.classList.remove('sel');cb.classList.remove('sel');ca.classList.add('moving');
      O.animating=true;
      requestAnimationFrame(()=>{ca.style.transform=`translate(${rb.left-ra.left}px,${rb.top-ra.top}px)`});
      setTimeout(()=>{
        O.animating=false;O.layout=layout;buildOpp(null,m.b);
        const p=O.pending;O.pending=null;if(p)renderOpp(...p);else applySel(opp,oppWon,layout);
      },matchMedia('(prefers-reduced-motion: reduce)').matches?0:340);
      return;
    }
    // undo, reset or a fresh round: show the new shape, dealing in any card that came back
    const back=layout.map((v,i)=>v&&!O.layout[i]);
    O.layout=layout;buildOpp();
    miniCards().forEach((c,i)=>{if(back[i])c.classList.add('deal')});
  }
  applySel(opp,oppWon,layout);
}
function applySel(opp,oppWon,layout){
  miniCards().forEach((c,i)=>{
    c.classList.toggle('sel',opp.sel===i&&!opp.gaveUp&&!oppWon);
    c.classList.toggle('win',oppWon&&layout.filter(Boolean).length===1&&!!layout[i]);
  });
}

/* ---------- Timer ---------- */
function startTimer(){stopTimer();R.start=performance.now();const t=$('timer');
  const f=()=>{t.textContent='Time: '+Math.floor((performance.now()-R.start)/1000)};f();R.tick=setInterval(f,250)}
function stopTimer(){clearInterval(R.tick)}

/* ---------- Win cascade (same as the projector game) ---------- */
let cascadeRAF=null,cascadeDone=null;
function runCascade(onDone){
  const cv=$('cascade'),felt=$('felt');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){onDone();return}
  const fr=felt.getBoundingClientRect();cv.width=fr.width;cv.height=fr.height;cv.classList.add('on');
  const ctx=cv.getContext('2d');
  const rects=[...document.querySelectorAll('.slot')].map(s=>s.getBoundingClientRect());
  const w=rects[0].width*0.6,h=w*1.4;
  const queue=[];for(let r=0;r<3;r++)R.nums.forEach((n,i)=>queue.push({n,suit:R.suits[i],x:rects[i].left-fr.left+(rects[i].width-w)/2,y:rects[i].top-fr.top}));
  let cur=null;cascadeDone=onDone;
  const draw=c=>{ctx.fillStyle='#fff';ctx.strokeStyle='#000';ctx.beginPath();ctx.roundRect?ctx.roundRect(c.x,c.y,w,h,8):ctx.rect(c.x,c.y,w,h);ctx.fill();ctx.stroke();
    ctx.fillStyle=c.suit.red?'#d40000':'#000';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`bold ${w*0.55}px "Times New Roman",serif`;ctx.fillText(c.n,c.x+w/2,c.y+h*0.45);
    ctx.font=`${w*0.25}px serif`;ctx.fillText(c.suit.s,c.x+w/2,c.y+h*0.78)};
  const step=()=>{
    if(!cur){if(!queue.length){finishCascade();return}cur=queue.shift();cur.vx=(Math.random()<.5?-1:1)*(3+Math.random()*5);cur.vy=-(2+Math.random()*8)}
    cur.vy+=0.6;cur.x+=cur.vx;cur.y+=cur.vy;if(cur.y+h>cv.height){cur.y=cv.height-h;cur.vy=-cur.vy*0.78}
    draw(cur);if(cur.x>cv.width||cur.x+w<0)cur=null;cascadeRAF=requestAnimationFrame(step)};
  step();
}
function finishCascade(){const cb=cascadeDone;stopCascade();if(cb)cb()}
function stopCascade(){cancelAnimationFrame(cascadeRAF);cascadeRAF=null;cascadeDone=null;const cv=$('cascade');cv.classList.remove('on');cv.getContext('2d').clearRect(0,0,cv.width,cv.height)}
$('cascade').onclick=finishCascade;

/* ---------- Dialogs, menus, buttons, keys ---------- */
function show(id){closeMenus();$(id).classList.add('show')}
function hide(id){$(id).classList.remove('show')}
function closeMenus(){document.querySelectorAll('.menu.open').forEach(m=>m.classList.remove('open'))}
function esc(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
document.querySelectorAll('.menu-title').forEach(t=>{
  t.onclick=e=>{e.stopPropagation();const m=t.parentElement,was=m.classList.contains('open');closeMenus();if(!was)m.classList.add('open')};
  t.onmouseenter=()=>{if(document.querySelector('.menu.open')&&!t.parentElement.classList.contains('open')){closeMenus();t.parentElement.classList.add('open')}};
});
document.addEventListener('click',closeMenus);
const ACTIONS={undo,reset,giveUp,howto:()=>show('helpDlg'),
  fullscreen:()=>{(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>{})}};
document.querySelectorAll('.menu-list button').forEach(b=>b.onclick=()=>{closeMenus();ACTIONS[b.dataset.act]()});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>hide(b.dataset.close));
document.querySelectorAll('.op').forEach(b=>b.onclick=()=>pickOp(b.dataset.op));
$('undoBtn').onclick=undo;$('resetBtn').onclick=reset;$('giveUpBtn').onclick=giveUp;

document.addEventListener('keydown',e=>{
  const k=e.key;
  if(k==='F1'){e.preventDefault();show('helpDlg');return}
  const open=document.querySelector('.modal.show');
  if(open){if(k==='Escape'&&open.id==='helpDlg')hide('helpDlg');if(k==='Enter'&&open.id==='resultDlg')$('againBtn').click();return}
  if(cascadeRAF){finishCascade();return}
  if(e.target.tagName==='INPUT')return;
  if(k>='1'&&k<='4'){const i=+k-1;if(R.slots[i])clickCard(i)}
  else if(k==='+')pickOp('+');else if(k==='-')pickOp('−');
  else if(k==='*'||k==='x'||k==='X')pickOp('×');else if(k==='/'){e.preventDefault();pickOp('÷')}
  else if(k==='Backspace'){e.preventDefault();undo()}else if(k==='r'||k==='R')reset();
});

showScreen('joinPanel');$('nameInput').focus();
