/* game.js — single-screen (projector) game: UI, timer, scoring. Needs solver.js. */
/* ---------- Game state ---------- */
const $=id=>document.getElementById(id);
const S={puzzle:null,slots:[],history:[],sel:null,op:null,done:false,
  round:1,solved:0,skipped:0,best:null,start:0,tick:null,limit:0};

function fmtVal(v){
  if(v.d===1)return String(v.n);
  const sign=v.n<0?'−':'';
  return `${sign}<span class="frac"><i>${Math.abs(v.n)}</i><i>${v.d}</i></span>`;
}
function fmtText(v){return v.d===1?String(v.n):`${v.n}/${v.d}`}

function newPuzzle(p){
  S.puzzle=p||makePuzzle();
  S.slots=S.puzzle.nums.map(n=>({v:F(n),e:String(n),base:true}));
  S.history=[];S.sel=null;S.op=null;S.done=false;S.practice=false;
  hideOverlay();
  setMsg(S.puzzle.sols.length?'Pick a card, an operation, then another card.':'⚠ This set has no solution — can the class prove it?','');
  startTimer();render(true);
}

function render(animateAll){
  const wrap=$('cards');wrap.innerHTML='';
  S.slots.forEach((s,i)=>{
    const c=document.createElement('div');
    c.className='card'+(s?'':' empty')+(S.sel===i?' sel':'')+((s&&(animateAll||s.fresh))?' pop':'');
    if(s){
      c.innerHTML=`<span class="key">${i+1}</span><div class="val">${fmtVal(s.v)}</div>`+
        (s.base?'':`<div class="expr">${s.e}</div>`);
      c.onclick=()=>clickCard(i);
      s.fresh=false;
    }
    wrap.appendChild(c);
  });
  document.querySelectorAll('.op').forEach(b=>b.classList.toggle('sel',b.dataset.op===S.op));
  $('sRound').textContent=S.round;$('sSolved').textContent=S.solved;$('sSkipped').textContent=S.skipped;
  $('sBest').textContent=S.best==null?'–':S.best.toFixed(1)+'s';
}

function clickCard(i){
  if(S.done)return;
  if(S.sel===null){S.sel=i;render();return}
  if(S.sel===i){S.sel=null;S.op=null;render();return}
  if(!S.op){S.sel=i;render();return} // change selection
  const a=S.slots[S.sel],b=S.slots[i];
  const v=apply(S.op,a.v,b.v);
  if(!v){setMsg("You can't divide by zero!",'bad');S.op=null;render();return}
  S.history.push(S.slots.map(s=>s&&{...s}));
  const inner=x=>x.base?x.e:`(${x.e})`;
  S.slots[i]={v,e:`${inner(a)} ${S.op} ${inner(b)}`,base:false,fresh:true};
  S.slots[S.sel]=null;S.sel=i;S.op=null;
  const left=S.slots.filter(Boolean);
  if(left.length===1){
    if(is24(v))win(left[0].e);
    else setMsg(`That makes ${fmtText(v)}, not 24. Undo or reset and try again!`,'bad');
  }else setMsg('Keep going…','');
  render();
}
function pickOp(op){if(S.done)return;if(S.sel===null){setMsg('Pick a card first.','bad');return}S.op=op;render()}
function undo(){if(!S.history.length||S.done)return;S.slots=S.history.pop();S.sel=null;S.op=null;setMsg('Undone.','');render()}
function reset(){if(S.done)return;S.slots=S.puzzle.nums.map(n=>({v:F(n),e:String(n),base:true}));S.history=[];S.sel=null;S.op=null;setMsg('Reset to the starting numbers.','');render(true)}

function win(expr){
  S.done=true;stopTimer();
  if(S.practice){
    setMsg('🎉 24! Nice work.','good');
    showOverlay('24! 🎉',`${expr} = 24`,'Practice round — not scored',altText());
    confetti();render();return;
  }
  const t=(performance.now()-S.start)/1000;
  S.solved++;if(S.best==null||t<S.best)S.best=t;
  setMsg('🎉 24!','good');
  showOverlay('24! 🎉',`${expr} = 24`,`Solved in ${t.toFixed(1)} seconds`,altText());
  confetti();render();
}
function reveal(){
  if(S.done){showOverlayAgain();return}
  S.done=true;stopTimer();if(!S.practice)S.skipped++;
  const sols=S.puzzle.sols;
  if(!sols.length)showOverlay('No solution','These four numbers can’t make 24.','Well spotted if you said so!','');
  else showOverlay('Solution',`${sols[0].e} = 24`,`${sols.length} different way${sols.length>1?'s':''} to make 24`,altText());
  render();
}
function altText(){
  const s=S.puzzle.sols.slice(1,4).map(x=>x.e);
  return s.length?'Other ways: '+s.join('  ·  '):'';
}
function next(){S.round++;newPuzzle()}
// Closing the results panel unlocks the same puzzle for another go (practice — scores don't change)
function backToPuzzle(){
  hideOverlay();
  if(!S.done)return;
  S.done=false;S.practice=true;
  S.slots=S.puzzle.nums.map(n=>({v:F(n),e:String(n),base:true}));
  S.history=[];S.sel=null;S.op=null;
  setMsg('Practice mode — try it yourself! (Not scored)','');
  render(true);
}

/* ---------- Overlay / messages ---------- */
let lastOv=null;
function showOverlay(t,e,sub,alts){lastOv=[t,e,sub,alts];$('ovTitle').textContent=t;$('ovExpr').textContent=e;$('ovSub').textContent=sub;$('ovAlts').textContent=alts;$('overlay').classList.add('show')}
function showOverlayAgain(){if(lastOv)showOverlay(...lastOv)}
function hideOverlay(){$('overlay').classList.remove('show')}
function setMsg(t,cls){const m=$('msg');m.textContent=t;m.className=cls}

/* ---------- Timer ---------- */
function startTimer(){
  stopTimer();S.limit=+$('timerMode').value;S.start=performance.now();
  S.tick=setInterval(()=>{
    const el=(performance.now()-S.start)/1000,t=$('timer');
    if(S.limit){
      const rem=Math.max(0,S.limit-el);t.textContent=rem.toFixed(1)+'s';t.classList.toggle('warn',rem<=10);
      if(rem<=0){stopTimer();if(!S.done){S.done=true;S.skipped++;setMsg("⏰ Time's up!",'bad');
        const s=S.puzzle.sols[0];showOverlay("Time's up!",s?`${s.e} = 24`:'No solution exists','',altText());render()}}
    }else{t.textContent=el.toFixed(1)+'s';t.classList.remove('warn')}
  },100);
}
function stopTimer(){clearInterval(S.tick)}

/* ---------- Confetti ---------- */
function confetti(){
  const cols=['#fca311','#2ec4b6','#e63946','#4361ee','#ffffff','#9b5de5'];
  for(let i=0;i<120;i++){
    const d=document.createElement('div');d.className='confetti';
    d.style.left=Math.random()*100+'vw';d.style.background=cols[i%cols.length];
    d.style.animationDuration=(1.8+Math.random()*2)+'s';d.style.animationDelay=Math.random()*.5+'s';
    document.body.appendChild(d);setTimeout(()=>d.remove(),4500);
  }
}

/* ---------- Wiring ---------- */
document.querySelectorAll('.op').forEach(b=>b.onclick=()=>pickOp(b.dataset.op));
$('undoBtn').onclick=undo;$('resetBtn').onclick=reset;$('revealBtn').onclick=reveal;$('nextBtn').onclick=next;
$('ovNext').onclick=next;$('ovClose').onclick=backToPuzzle;
$('timerMode').onchange=()=>{if(!S.done)startTimer()};
$('fsBtn').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
$('resetStats').onclick=()=>{S.round=1;S.solved=0;S.skipped=0;S.best=null;newPuzzle()};
$('customBtn').onclick=()=>{
  const nums=($('customNums').value.match(/-?\d+/g)||[]).map(Number);
  if(nums.length!==4||nums.some(n=>n<1||n>9)){setMsg('Enter exactly four whole numbers from 1 to 9.','bad');return}
  newPuzzle({nums,sols:solve(nums)});
};
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
  const k=e.key;
  if(k>='1'&&k<='4'){const i=+k-1;if(S.slots[i])clickCard(i)}
  else if(k==='+')pickOp('+');else if(k==='-')pickOp('−');
  else if(k==='*'||k==='x'||k==='X')pickOp('×');else if(k==='/'){e.preventDefault();pickOp('÷')}
  else if(k==='Backspace')undo();else if(k==='r'||k==='R')reset();
  else if(k==='n'||k==='N')next();else if(k==='s'||k==='S')reveal();
  else if(k==='Escape')backToPuzzle();
});
newPuzzle();
