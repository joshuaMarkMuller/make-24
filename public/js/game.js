/* game.js — single-screen (projector) game: UI, timer, scoring, menus. Needs solver.js. */

/* ---------- State ---------- */
const $=id=>document.getElementById(id);
const SUITS=[{s:'♠',red:false},{s:'♥',red:true},{s:'♣',red:false},{s:'♦',red:true}];
const S={puzzle:null,slots:[],history:[],sel:null,op:null,done:false,practice:false,
  round:1,solved:0,skipped:0,best:null,start:0,tick:null,limit:0};

const fmtText=v=>v.d===1?String(v.n):`${v.n}/${v.d}`;
function fmtVal(v){
  if(v.d===1)return String(v.n).replace('-','−');
  return `${v.n<0?'−':''}<span class="frac"><i>${Math.abs(v.n)}</i><i>${v.d}</i></span>`;
}
const timerMode=()=>+document.querySelector('input[name=timerMode]:checked').value;
const PREC={'+':1,'−':1,'×':2,'÷':2};
const startSlots=()=>S.puzzle.nums.map((n,i)=>({v:F(n),e:String(n),prec:3,base:true,suit:S.puzzle.suits[i]}));

/* ---------- Dealing ---------- */
function newPuzzle(p){
  stopCascade();
  S.puzzle=p||makePuzzle();
  // Give each card a random suit (just for looks)
  S.puzzle.suits=S.puzzle.nums.map(()=>SUITS[Math.floor(Math.random()*4)]);
  S.slots=startSlots();
  S.history=[];S.sel=null;S.op=null;S.done=false;S.practice=false;
  closeAll();
  setMsg(S.puzzle.sols.length?'Pick a card, an operation, then another card.':'This set can’t make 24 without brackets. Can the class prove it?','');
  startTimer();render('deal');
}

/* ---------- Drawing the felt ---------- */
function render(anim){
  const wrap=$('cards');wrap.innerHTML='';
  S.slots.forEach((s,i)=>{
    const slot=document.createElement('div');slot.className='slot';
    if(s){
      const c=document.createElement('div');
      const label=fmtText(s.v).replace('-','−');
      c.className='card'+(s.suit.red?' red':'')+(S.sel===i?' sel':'')+
        (anim==='deal'?' deal':(s.fresh?' pop':''));
      if(anim==='deal')c.style.animationDelay=(i*0.09)+'s';
      c.innerHTML=
        `<span class="corner tl">${label}<span class="s">${s.suit.s}</span></span>`+
        `<div class="val">${fmtVal(s.v)}</div><div class="suit-big">${s.suit.s}</div>`+
        (s.base?'':`<div class="expr">${s.e}</div>`)+
        `<span class="corner br">${label}<span class="s">${s.suit.s}</span></span>`;
      c.onclick=()=>clickCard(i);
      s.fresh=false;
      slot.appendChild(c);
      slot.insertAdjacentHTML('beforeend',`<span class="key">${i+1}</span>`);
    }
    wrap.appendChild(slot);
  });
  document.querySelectorAll('.op').forEach(b=>b.classList.toggle('sel',b.dataset.op===S.op));
  $('status').textContent=`Round ${S.round}`+(S.practice?' (practice)':'');
  $('sSolved').textContent=S.solved;$('sSkipped').textContent=S.skipped;
  $('sBest').textContent=S.best==null?'–':S.best.toFixed(1)+'s';
}

/* ---------- Playing ---------- */
function clickCard(i){
  if(S.done)return;
  if(S.sel===null){S.sel=i;render();return}
  if(S.sel===i){S.sel=null;S.op=null;render();return}
  if(!S.op){S.sel=i;render();return}
  const a=S.slots[S.sel],b=S.slots[i];
  const v=apply(S.op,a.v,b.v);
  if(!v){setMsg("You can't divide by zero!",'bad');S.op=null;render();return}
  if(v.d!==1){ // no fractional cards
    setMsg(`${fmtText(a.v)} ÷ ${fmtText(b.v)} isn't a whole number. Try something else.`,'bad');
    S.op=null;render();return;
  }
  S.history.push(S.slots.map(s=>s&&{...s}));
  // Only add brackets where order of operations needs them
  const p=PREC[S.op];
  const L=a.prec<p?`(${a.e})`:a.e;
  const R=(b.prec<p||(b.prec===p&&(S.op==='−'||S.op==='÷')))?`(${b.e})`:b.e;
  S.slots[i]={v,e:`${L} ${S.op} ${R}`,prec:p,base:false,fresh:true,suit:b.suit};
  S.slots[S.sel]=null;S.sel=i;S.op=null;
  const left=S.slots.filter(Boolean);
  if(left.length===1){
    if(is24(v)){render();win(left[0].e);return}
    setMsg(`That makes ${fmtText(v)}, not 24. Undo or reset and try again.`,'bad');
  }else setMsg('Keep going…','');
  render();
}
function pickOp(op){if(S.done)return;if(S.sel===null){setMsg('Pick a card first.','bad');return}S.op=op;render()}
function undo(){if(!S.history.length||S.done)return;S.slots=S.history.pop();S.sel=null;S.op=null;setMsg('Undone.','');render()}
function reset(){if(S.done)return;S.slots=startSlots();S.history=[];S.sel=null;S.op=null;setMsg('Cards reset.','');render('deal')}

function win(expr){
  S.done=true;stopTimer();S.sel=null;
  const t=(performance.now()-S.start)/1000;
  let sub;
  if(S.practice)sub='Practice round, not scored.';
  else{S.solved++;if(S.best==null||t<S.best)S.best=t;sub=`Solved in ${t.toFixed(1)} seconds.`}
  setMsg('You made 24!','good');render();
  runCascade(()=>showResult('★','You made 24!',`${expr} = 24`,sub,altText(),false));
}
function reveal(){
  if(S.done){if(lastResult)showResult(...lastResult);return}
  S.done=true;stopTimer();if(!S.practice)S.skipped++;
  const sols=S.puzzle.sols;
  if(!sols.length)showResult('!','No solution','These four numbers can’t make 24 without brackets.','Well spotted if you said so!','',true);
  else showResult('i','Solution',`${sols[0].e} = 24`,`There ${sols.length>1?'are':'is'} ${sols.length} way${sols.length>1?'s':''} to make 24.`,altText(),false);
  render();
}
function altText(){const s=S.puzzle.sols.slice(1,4).map(x=>x.e);return s.length?'Other ways: '+s.join('   ·   '):''}
function next(){S.round++;newPuzzle()}
// Closing the result dialog unlocks the same puzzle for another go (practice, not scored)
function backToPuzzle(){
  stopCascade();hide('overlay');
  if(!S.done)return;
  S.done=false;S.practice=true;S.slots=startSlots();S.history=[];S.sel=null;S.op=null;
  setMsg('Practice: try it yourself. This one isn’t scored.','');
  render('deal');
}

/* ---------- Dialogs & messages ---------- */
let lastResult=null;
function showResult(icon,title,expr,sub,alts,warn){
  lastResult=[icon,title,expr,sub,alts,warn];
  $('ovIcon').textContent=icon;$('ovIcon').classList.toggle('warn',!!warn);
  $('ovTitle').textContent=title;$('ovExpr').textContent=expr;$('ovSub').textContent=sub;$('ovAlts').textContent=alts;
  show('overlay');$('ovNext').focus();
}
function show(id){closeMenus();$(id).classList.add('show')}
function hide(id){$(id).classList.remove('show')}
function closeAll(){document.querySelectorAll('.modal.show').forEach(m=>m.classList.remove('show'));closeMenus()}
function anyModal(){return document.querySelector('.modal.show')}
function setMsg(t,cls){const m=$('msg');m.textContent=t;m.className=cls}

/* ---------- Timer ---------- */
function startTimer(){
  stopTimer();S.limit=timerMode();S.start=performance.now();
  const t=$('timer');t.classList.remove('warn');
  const tickFn=()=>{
    const el=(performance.now()-S.start)/1000;
    if(S.limit){
      const rem=Math.max(0,S.limit-el);t.textContent='Time left: '+Math.ceil(rem);t.classList.toggle('warn',rem<=10);
      if(rem<=0){stopTimer();if(!S.done){S.done=true;if(!S.practice)S.skipped++;setMsg("Time's up!",'bad');
        const s=S.puzzle.sols[0];showResult('!',"Time's up!",s?`${s.e} = 24`:'No solution exists','',altText(),true);render()}}
    }else t.textContent='Time: '+Math.floor(el);
  };
  tickFn();S.tick=setInterval(tickFn,200);
}
function stopTimer(){clearInterval(S.tick)}

/* ---------- Winning card cascade ---------- */
let cascadeRAF=null,cascadeDone=null;
function runCascade(onDone){
  const cv=$('cascade'),felt=$('felt');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){onDone();return}
  const fr=felt.getBoundingClientRect();
  cv.width=fr.width;cv.height=fr.height;cv.classList.add('on');
  const ctx=cv.getContext('2d');
  const slotRects=[...document.querySelectorAll('.slot')].map(s=>s.getBoundingClientRect());
  const w=slotRects[0].width*0.6,h=w*1.4;
  // Launch the original four cards, three times over
  const queue=[];
  for(let r=0;r<3;r++)S.puzzle.nums.forEach((n,i)=>queue.push({n,suit:S.puzzle.suits[i],x:slotRects[i].left-fr.left+(slotRects[i].width-w)/2,y:slotRects[i].top-fr.top}));
  let cur=null;cascadeDone=onDone;
  const drawCard=c=>{
    ctx.fillStyle='#fff';ctx.strokeStyle='#000';ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect?ctx.roundRect(c.x,c.y,w,h,8):ctx.rect(c.x,c.y,w,h);ctx.fill();ctx.stroke();
    ctx.fillStyle=c.suit.red?'#d40000':'#000';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`bold ${w*0.55}px "Times New Roman",serif`;ctx.fillText(c.n,c.x+w/2,c.y+h*0.45);
    ctx.font=`${w*0.25}px serif`;ctx.fillText(c.suit.s,c.x+w/2,c.y+h*0.78);
    ctx.font=`bold ${w*0.16}px "Times New Roman",serif`;ctx.textAlign='left';ctx.fillText(c.n+c.suit.s,c.x+6,c.y+w*0.14);
  };
  const step=()=>{
    if(!cur){
      if(!queue.length){finishCascade();return}
      cur=queue.shift();cur.vx=(Math.random()<.5?-1:1)*(3+Math.random()*5);cur.vy=-(2+Math.random()*8);
    }
    cur.vy+=0.6;cur.x+=cur.vx;cur.y+=cur.vy;
    if(cur.y+h>cv.height){cur.y=cv.height-h;cur.vy=-cur.vy*0.78}
    drawCard(cur);
    if(cur.x>cv.width||cur.x+w<0)cur=null;
    cascadeRAF=requestAnimationFrame(step);
  };
  step();
}
function finishCascade(){const cb=cascadeDone;stopCascade();if(cb)cb()}
function stopCascade(){
  cancelAnimationFrame(cascadeRAF);cascadeRAF=null;cascadeDone=null;
  const cv=$('cascade');cv.classList.remove('on');cv.getContext('2d').clearRect(0,0,cv.width,cv.height);
}
$('cascade').onclick=finishCascade;

/* ---------- Menus ---------- */
function closeMenus(){document.querySelectorAll('.menu.open').forEach(m=>m.classList.remove('open'))}
document.querySelectorAll('.menu-title').forEach(t=>{
  t.onclick=e=>{e.stopPropagation();const m=t.parentElement,was=m.classList.contains('open');closeMenus();if(!was)m.classList.add('open')};
  t.onmouseenter=()=>{if(document.querySelector('.menu.open')&&!t.parentElement.classList.contains('open')){closeMenus();t.parentElement.classList.add('open')}};
});
document.addEventListener('click',closeMenus);
const ACTIONS={
  next,undo,reset,reveal,
  options:()=>{show('optionsDlg');$('customMsg').textContent=''},
  howto:()=>show('helpDlg'),about:()=>show('aboutDlg'),
  fullscreen:()=>{(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>{})},
  resetStats:()=>{S.round=1;S.solved=0;S.skipped=0;S.best=null;newPuzzle()}
};
document.querySelectorAll('.menu-list button').forEach(b=>b.onclick=()=>{closeMenus();ACTIONS[b.dataset.act]()});

/* ---------- Buttons ---------- */
document.querySelectorAll('.op').forEach(b=>b.onclick=()=>pickOp(b.dataset.op));
$('undoBtn').onclick=undo;$('resetBtn').onclick=reset;$('revealBtn').onclick=reveal;$('nextBtn').onclick=next;
$('ovNext').onclick=next;$('ovClose').onclick=backToPuzzle;$('ovX').onclick=backToPuzzle;
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>hide(b.dataset.close));
document.querySelectorAll('input[name=timerMode]').forEach(r=>r.onchange=()=>{if(!S.done)startTimer()});
$('customBtn').onclick=()=>{
  const nums=($('customNums').value.match(/-?\d+/g)||[]).map(Number);
  if(nums.length!==4||nums.some(n=>n<1||n>9)){$('customMsg').textContent='Enter exactly four whole numbers from 1 to 9.';return}
  newPuzzle({nums,sols:solve(nums)});
};
$('customNums').onkeydown=e=>{if(e.key==='Enter')$('customBtn').click()};

/* ---------- Keyboard ---------- */
document.addEventListener('keydown',e=>{
  const k=e.key;
  if(k==='F1'){e.preventDefault();ACTIONS.howto();return}
  if(k==='F2'){e.preventDefault();next();return}
  const open=anyModal();
  if(open){
    if(k==='Escape'){open.id==='overlay'?backToPuzzle():hide(open.id)}
    return;
  }
  if(cascadeRAF){finishCascade();return}
  if(e.target.tagName==='INPUT')return;
  if(k==='Escape'){closeMenus();return}
  if(k>='1'&&k<='4'){const i=+k-1;if(S.slots[i])clickCard(i)}
  else if(k==='+')pickOp('+');else if(k==='-')pickOp('−');
  else if(k==='*'||k==='x'||k==='X')pickOp('×');else if(k==='/'){e.preventDefault();pickOp('÷')}
  else if(k==='Backspace'){e.preventDefault();undo()}else if(k==='r'||k==='R')reset();
  else if(k==='n'||k==='N')next();else if(k==='s'||k==='S')reveal();
});

newPuzzle();
