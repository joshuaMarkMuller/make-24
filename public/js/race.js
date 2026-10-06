/* race.js — two-player race screen (Stage 2). Talks to server/index.js over Socket.IO. Needs solver.js. */

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
$('againBtn').onclick=()=>{hide('resultDlg');stopCascade();socket.emit('ready')};

/* ---------- Server updates ---------- */
socket.on('connect',()=>{$('status').textContent='Connected'});
socket.on('disconnect',()=>{$('status').textContent='Connection lost. Refresh the page to rejoin.';R.me=null;stopTimer()});
socket.on('notice',t=>{$('lobbyMsg').textContent=t});
socket.on('state',s=>{R.state=s;render()});
socket.on('round',r=>{
  // Same cards for both players; suits are just for looks
  R.nums=r.nums;R.suits=r.nums.map(()=>SUITS[Math.floor(Math.random()*4)]);
  resetBoard();R.locked=true;hide('resultDlg');stopCascade();
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
  $('status').textContent=s.round?`Round ${s.round}`:'Waiting room';
  $('oppPanel').textContent='Opponent: '+(opp?opp.name+(s.phase==='playing'?(opp.gaveUp?' (gave up)':` (${opp.cardsLeft} card${opp.cardsLeft>1?'s':''} left)`):''):'–');

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
    $('readyBtn').disabled=me.ready;
    $('readyBtn').textContent=me.ready?'Waiting for opponent…':"I'm Ready";
    if(s.players.length<2)$('lobbyMsg').textContent=$('lobbyMsg').textContent||'Ask someone to open this page and join.';
    else if(me.ready)$('lobbyMsg').textContent='The round starts when both players are ready.';
    else $('lobbyMsg').textContent='Press I\'m Ready when you\'re set.';
  }
  if(s.phase==='playing'&&me.gaveUp)setMsg('You gave up. Your opponent can still finish.','bad');
  if(s.phase==='result'&&s.result&&R.shownResultRound!==s.round){R.shownResultRound=s.round;showResult(s.result)}
}

function showResult(res){
  R.locked=true;R.sel=null;R.op=null;stopTimer();
  const won=res.winnerId===R.myId;
  if(res.winner){
    $('resIcon').textContent=won?'★':'!';$('resIcon').classList.toggle('warn',!won);
    $('resTitle').textContent=won?'You finished first!':`${res.winner} finished first`;
    $('resExpr').textContent=`${res.expr} = 24`;
    $('resSub').textContent=`${won?'You':res.winner} made 24 in ${res.time.toFixed(1)} seconds.`;
    setMsg(won?'You made 24 first!':`${res.winner} made 24 first.`,won?'good':'bad');
  }else{
    $('resIcon').textContent='i';$('resIcon').classList.remove('warn');
    $('resTitle').textContent='Nobody solved it';
    $('resExpr').textContent=res.solution?`${res.solution} = 24`:'';
    $('resSub').textContent='Both players gave up. Here is one answer.';
  }
  renderCards();
  if(won)runCascade(()=>show('resultDlg'));else show('resultDlg');
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
  if(R.sel===null){R.sel=i;renderCards();return}
  if(R.sel===i){R.sel=null;R.op=null;renderCards();return}
  if(!R.op){R.sel=i;renderCards();return}
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
  R.slots[R.sel]=null;R.sel=i;R.op=null;
  const left=R.slots.filter(Boolean).length;
  socket.emit('progress',left);
  if(left===1){
    if(v===24){
      R.locked=true;R.sel=null;setMsg('Checking…');
      socket.emit('submit',R.moves,res=>{if(!res.ok){R.locked=false;setMsg(res.error,'bad')}});
    }else setMsg(`That makes ${fmtText(v)}, not 24. Undo or reset and try again.`,'bad');
  }else setMsg('Keep going…');
  renderCards();
}
function pickOp(op){if(!canPlay())return;if(R.sel===null){setMsg('Pick a card first.','bad');return}R.op=op;renderCards()}
function undo(){if(!canPlay()||!R.history.length)return;R.slots=R.history.pop();R.moves.pop();R.sel=null;R.op=null;socket.emit('progress',R.slots.filter(Boolean).length);setMsg('Undone.');renderCards()}
function reset(){if(!canPlay())return;resetBoard();socket.emit('progress',4);setMsg('Cards reset.');renderCards('deal')}
function giveUp(){if(!canPlay())return;R.locked=true;R.sel=null;socket.emit('giveUp');setMsg('You gave up. Your opponent can still finish.','bad');renderCards()}

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
