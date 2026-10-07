/* race.js — player screen for the class race (Stages 2–4): up to 24 players race in pairs
 * (or a three), with matches, a shared scoreboard and a 30-second limit. The teacher runs
 * the game from host.html. Talks to server/index.js
 * over Socket.IO. Needs solver.js. */

const $=id=>document.getElementById(id);
const socket=io();
const SUITS=[{s:'♠',red:false},{s:'♥',red:true},{s:'♣',red:false},{s:'♦',red:true}];
const PREC={'+':1,'−':1,'×':2,'÷':2};

const R={
  me:null,myId:null,state:null,
  nums:null,suits:null,slots:[],history:[],moves:[],sel:null,op:null,
  locked:true,deadline:0,tick:null,shownResultRound:0,solvedRound:0,beatenRound:0,celebratedRound:0,
  notice:'',noticeAt:0
};

/* ---------- Helpers ---------- */
function showScreen(name){
  for(const id of ['joinPanel','lobbyPanel','countdown','board'])$(id).hidden=(id!==name);
}
function setMsg(t,cls){const m=$('msg');m.textContent=t;m.className=cls||''}
function esc(t){return String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const ordinal=n=>n+(['th','st','nd','rd'][(n%100-20)%10]||['th','st','nd','rd'][n%100]||'th');
const listNames=a=>a.length<2?(a[0]||''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];
// How the class will be split, e.g. 7 players → "2 pairs and 1 group of three"
function describeGroups(n){
  if(n<2)return'';
  const trio=n%2===1?1:0,pairs=(n-3*trio)/2;
  const parts=[];
  if(pairs)parts.push(`${pairs} pair${pairs>1?'s':''}`);
  if(trio)parts.push('1 group of three');
  return `${n} players → ${parts.join(' and ')} each round`;
}
function standings(s){return rankPlayers(s)}

/* ---------- Joining ---------- */
// The code can come from the link (?code=KQ7PX); name and code are remembered for a quick rejoin
const cleanCode=c=>String(c||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);
try{
  $('codeInput').value=cleanCode(new URLSearchParams(location.search).get('code')||sessionStorage.getItem('make24-code'));
  $('nameInput').value=sessionStorage.getItem('make24-name')||'';
}catch{}
// Emoji picker: a button showing the chosen emoji opens a grid of big emoji (remembers the last choice)
function setEmoji(e){$('emojiInput').value=e;$('emojiBtn').innerHTML=`<span class="emo idle">${e}</span>`;$('emojiBtn').setAttribute('aria-label',`Your emoji: ${(EMOJIS.find(x=>x[0]===e)||[])[1]||''}. Change`);
  $('emojiGrid').querySelectorAll('.emoji-opt').forEach(b=>b.setAttribute('aria-pressed',b.dataset.e===e))}
$('emojiGrid').innerHTML=[...new Set(EMOJIS.map(x=>x[2]))].map(g=>`<div class="emoji-group">${g}</div>`+
  EMOJIS.filter(x=>x[2]===g).map(([e,n])=>`<button type="button" class="emoji-opt" data-e="${e}" title="${n}" aria-label="${n}"><span class="emo idle" style="animation-delay:-${Math.round(Math.random()*2400)}ms">${e}</span></button>`).join('')).join('');
function openGrid(open){$('emojiGrid').hidden=!open;$('emojiBtn').setAttribute('aria-expanded',open);
  if(open)($('emojiGrid').querySelector('[aria-pressed="true"]')||$('emojiGrid').querySelector('.emoji-opt')).focus()}
$('emojiBtn').onclick=e=>{e.stopPropagation();openGrid($('emojiGrid').hidden)};
$('emojiGrid').onclick=e=>{e.stopPropagation();const b=e.target.closest('.emoji-opt');if(!b)return;setEmoji(b.dataset.e);openGrid(false);$('nameInput').focus()};
$('emojiGrid').onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'){openGrid(false);$('emojiBtn').focus()}};
document.addEventListener('click',()=>{if(!$('emojiGrid').hidden)openGrid(false)});
{let saved=null;try{saved=sessionStorage.getItem('make24-emoji')}catch{}setEmoji(EMOJIS.some(x=>x[0]===saved)?saved:randomEmoji())}
$('codeInput').oninput=()=>{const c=cleanCode($('codeInput').value);if($('codeInput').value!==c)$('codeInput').value=c};
// A private token for this device (never shown). If the connection drops, or the page is
// reloaded, the server uses it to give the player their own seat back, with their score or lives.
const TOKEN=(()=>{let t='';try{t=localStorage.getItem('make24-device')||''}catch{}
  if(!/^[a-z0-9]{16,}$/.test(t)){t=[...crypto.getRandomValues(new Uint8Array(12))].map(b=>b.toString(36).padStart(2,'0')).join('');try{localStorage.setItem('make24-device',t)}catch{}}
  return t})();
function join(code,name,emoji,auto){
  socket.emit('join',{code,name,emoji,token:TOKEN},res=>{
    if(!res||!res.ok){
      R.joined=null;R.me=null;R.offline=false;try{sessionStorage.removeItem('make24-auto')}catch{}
      netBanner(false);showScreen('joinPanel');hide('resultDlg');stopCascade();stopTimer();
      $('joinMsg').textContent=(auto?'Couldn’t rejoin: ':'')+(res?res.error:'Something went wrong. Try again.');return}
    $('joinMsg').textContent='';
    R.joined={code:res.code,name:res.name,emoji:res.emoji};R.offline=false;
    R.me=res.name;R.emoji=res.emoji;R.myId=res.id;R.code=res.code;$('youPanel').textContent=`You: ${R.emoji} ${R.me}`;
    try{sessionStorage.setItem('make24-code',res.code);sessionStorage.setItem('make24-name',res.name);sessionStorage.setItem('make24-emoji',res.emoji);sessionStorage.setItem('make24-auto','1')}catch{}
    try{history.replaceState(null,'','?code='+res.code)}catch{}
    document.title=`Make 24 Race · ${res.code}`;
    netBanner(false);
    if(auto&&res.rejoined){R.notice='You’re back in the game.';R.noticeAt=Date.now()}
    catchUp();render();
    // An answer that was on its way when the connection dropped: send it again
    if(R.pendingSubmit&&R.state&&R.state.round===R.pendingSubmit.round)submitMoves(R.pendingSubmit.moves);
    else if(R.boardRound&&R.slots.length&&canPlay())sendProgress();
  });
}
$('joinForm').onsubmit=e=>{
  e.preventDefault();
  const code=cleanCode($('codeInput').value),name=$('nameInput').value.trim();
  if(code.length!==5){$('joinMsg').textContent='Type the 5-character lobby code from the host\'s screen.';$('codeInput').focus();return}
  if(!name){$('joinMsg').textContent='Type your name first.';$('nameInput').focus();return}
  $('joinMsg').textContent='Joining…';
  join(code,name,$('emojiInput').value,false);
};
// Reloaded the page while in a game: go straight back in
try{if(sessionStorage.getItem('make24-auto')==='1'&&cleanCode($('codeInput').value).length===5&&$('nameInput').value)
  R.joined={code:cleanCode($('codeInput').value),name:$('nameInput').value,emoji:$('emojiInput').value}}catch{}

// The host screen (host.html) starts rounds; players just close the results to look at the felt

/* ---------- Server updates ---------- */
socket.on('connect',()=>{
  $('status').textContent='Connected';
  if(R.joined){netBanner(true,'Rejoining…');join(R.joined.code,R.joined.name,R.joined.emoji,true)}
});
// Connection dropped (Wi-Fi blip, phone locked…): keep everything on screen and rejoin automatically.
// The cards are paused until we're back, so no moves get lost on the way.
socket.on('disconnect',reason=>{
  if(!R.joined)return;
  if(reason==='io server disconnect'){   // this device rejoined from another tab, which now has the seat
    R.joined=null;R.me=null;R.offline=false;netBanner(false);stopTimer();hide('resultDlg');stopCascade();showScreen('joinPanel');
    try{sessionStorage.removeItem('make24-auto')}catch{}
    $('joinMsg').textContent='You’re playing in another tab or window now. Close this one.';$('status').textContent='Not connected';return}
  R.offline=true;R.sel=null;R.op=null;if(R.slots.length)renderCards();
  socket.sendBuffer=[];      // don't replay old moves on the new connection
  $('status').textContent='Reconnecting…';netBanner(true,'Connection lost. Reconnecting…');
});
function netBanner(on,text){const b=$('netBanner');b.hidden=!on;if(text)b.textContent=text}
socket.on('progress',d=>{
  const s=R.state,p=s&&s.players.find(q=>q.id===d.id);if(!p||s.phase!=='playing')return;
  Object.assign(p,{layout:d.layout,sel:d.sel,lastMove:d.lastMove,moveSeq:d.moveSeq});
  const me=s.players.find(q=>q.id===R.myId),g=me&&me.group!==null?s.groups.find(x=>x.id===me.group):null;
  if(!g||!g.members.includes(d.id))return;
  // Only my opponents' face-down cards change
  renderOpps(g.members.filter(id=>id!==R.myId).map(id=>s.players.find(q=>q.id===id)).filter(Boolean),s,g);
});
socket.on('notice',t=>{R.notice=t;R.noticeAt=Date.now();render()});
socket.on('state',s=>{R.state=s;R.nextAt=s.nextInMs!=null?performance.now()+s.nextInMs:0;catchUp();render()});
// The host changed my name in the waiting room
socket.on('renamed',name=>{R.me=name;$('youPanel').textContent=`You: ${R.emoji||''} ${name}`;R.notice=`The host changed your name to ${name}.`;R.noticeAt=Date.now();render()});
socket.on('round',r=>{
  // Every group gets the same cards; suits are just for looks
  R.nums=r.nums;R.suits=r.nums.map(()=>SUITS[Math.floor(Math.random()*4)]);R.boardRound=r.round;R.pendingSubmit=null;
  clearTimeout(R.wrongTimer);R.wrongIdx=null;clearTimeout(R.heartTimer);$('heartLoss').hidden=true;
  resetBoard();R.locked=true;hide('resultDlg');stopCascade();clearOpps();clearInterval(R.nextTick);SFX.stop('cascade');
  R.deadline=performance.now()+r.countdownMs+r.limitMs;R.limitMs=r.limitMs;R.practice=false;
  if(!R.me)return;
  showScreen('countdown');
  let n=Math.round(r.countdownMs/1000);
  const cd=$('countdown');cd.textContent=n;
  const iv=setInterval(()=>{
    n--;
    if(n>0){cd.textContent=n;return}
    clearInterval(iv);
    const me=R.state&&R.state.players.find(p=>p.id===R.myId);
    R.practice=practising(R.state,me);
    if(!me||(me.group===null&&!R.practice)){render();return}       // joined mid-round: wait for the next one
    if(R.state.phase!=='countdown'&&R.state.phase!=='playing')return;   // the host ended the game during the countdown
    R.locked=false;showScreen('board');
    setMsg(R.practice?'You’re out, but you can still practise on the same cards. This doesn’t count.':'Go! Pick a card, an operation, then another card.');
    renderCards('deal');startTimer();render();
  },1000);
});

// Back after a dropped connection, in a race whose cards we never received: deal them now
function catchUp(){
  const s=R.state;if(!s||!R.me||R.offline)return;
  const me=s.players.find(p=>p.id===R.myId);
  if(s.phase!=='playing'||!me||(me.group===null&&!practising(s,me))||R.boardRound===s.round||!s.nums)return;
  R.practice=practising(s,me);
  R.nums=s.nums;R.suits=s.nums.map(()=>SUITS[Math.floor(Math.random()*4)]);R.boardRound=s.round;R.pendingSubmit=null;
  clearTimeout(R.wrongTimer);R.wrongIdx=null;resetBoard();hide('resultDlg');stopCascade();clearOpps();clearInterval(R.nextTick);
  R.deadline=performance.now()+(s.timeLeftMs||0);R.limitMs=s.limitMs;
  R.locked=false;showScreen('board');setMsg('Go! Pick a card, an operation, then another card.');
  renderCards('deal');startTimer();
}

function render(){
  const s=R.state;if(!s)return;
  const me=s.players.find(p=>p.id===R.myId);
  const inPlay=s.phase==='countdown'||s.phase==='playing'||s.phase==='result'||s.phase==='final';
  const myGroup=me&&me.group!==null&&inPlay?s.groups.find(g=>g.id===me.group):null;
  const opps=myGroup?myGroup.members.filter(id=>id!==R.myId).map(id=>s.players.find(p=>p.id===id)).filter(Boolean):[];

  // Status bar
  $('status').textContent=(s.phase==='lobby'||!s.matchRound)
    ?`Waiting room · ${s.players.length} player${s.players.length===1?'':'s'} · ${isElim(s)?'Elimination':s.matchRounds+' rounds'} · ${s.cardCount} cards`
    :isElim(s)?`Round ${s.matchRound} · ${s.players.filter(p=>!p.out).length} left`:`Round ${s.matchRound} of ${s.matchRounds}`;
  if(me&&s.matchRound&&s.phase!=='lobby'){
    const rows=standings(s),rank=rows.findIndex(p=>samePlace(s,p,me))+1;
    const place=allTied(s)?'':` · ${ordinal(rank)} of ${rows.length}`;
    $('scorePanel').textContent=isElim(s)?(me.out?`Out (round ${me.outRound})`:`Lives: ${hearts(s,me)}`):`Score: ${me.points.toLocaleString()}${place}`;
  }else $('scorePanel').textContent='Score: –';
  if(s.hold&&(s.phase==='countdown'||s.phase==='playing'||s.phase==='result'))$('status').textContent+=s.phase==='result'?' · Paused by the host':' · Paused after this round';
  $('oppPanel').textContent='Racing: '+(opps.length?listNames(opps.map(o=>o.name)):'–');
  renderOpps(opps,s,myGroup);

  if(!me){ // not joined yet
    if(R.joined)return;            // rejoining: the server's reply with my new id is on its way
    showScreen('joinPanel');
    $('joinMsg').textContent=s.players.length>=s.maxPlayers?`This game is full (${s.maxPlayers} players).`:'';
    return;
  }

  const sittingOut=(s.phase==='countdown'||s.phase==='playing')&&me.group===null&&!practising(s,me);
  if(s.phase==='lobby'||sittingOut){
    stopTimer();showScreen('lobbyPanel');if(!sittingOut){hide('resultDlg');stopCascade()}
    const list=$('playerList'),sig=s.players.map(p=>p.id+p.name+p.emoji+emojiMood(s,p.id)).join('|');
    if(list.dataset.sig!==sig)list.dataset.sig=sig,list.innerHTML=s.players.map(p=>`<li><span>${emojiTag(s,p)}${esc(p.name)}${p.id===R.myId?'<span class="you">(you)</span>':''}</span>`+
      `</li>`).join('')||'<li class="empty">Nobody has joined yet.</li>';
    $('roundsSel').value=String(s.matchRounds);$('roundsSel').disabled=true;$('roundsSel').hidden=isElim(s);
    $('roundsNote').textContent=isElim(s)?`Elimination: everyone has ${s.maxLives} lives, last one standing wins · ${s.cardCount}-card game.`:`Chosen by the host · ${s.cardCount}-card game.`;
    $('startBtn').hidden=true;
    if(sittingOut&&isElim(s)&&me.out){
      $('lobbyTitle').textContent='You’re out!';
      $('groupPreview').textContent=`${s.players.filter(p=>!p.out).length} players are still in.`;
      $('lobbyMsg').textContent=`You’ve lost all ${s.maxLives} lives. Watch the projector to see who’s the last one standing.`;
    }else if(sittingOut){
      $('lobbyTitle').textContent='Round in progress';
      $('groupPreview').textContent='';
      $('lobbyMsg').textContent='You’ll join in from the next round.';
    }else{
      $('lobbyTitle').textContent=`${s.players.length} of ${s.maxPlayers} players have joined`;
      $('groupPreview').textContent=describeGroups(s.players.length);
      const recent=R.notice&&Date.now()-R.noticeAt<8000?R.notice+' ':'';
      $('lobbyMsg').textContent=recent+(s.hostConnected
        ?'Waiting for the host to start the match.'
        :'The host has disconnected. Waiting for them to come back…');
    }
    return;
  }

  // I made 24: show my points straight away, then wait for everyone else
  if(s.phase==='playing'&&me.solved&&R.solvedRound!==s.round){
    R.solvedRound=s.round;R.locked=true;R.sel=null;R.op=null;renderCards();
    const first=myGroup&&myGroup.winnerId===R.myId;
    setMsg(`You made 24! +${me.gained} points${first?` (including +${s.firstBonus} for finishing first)`:''}. Waiting for the others…`,'good');
    R.celebratedRound=s.round;runCascade(null);
    showSolved(s,me,first);
  }
  // While I wait for the others, keep the scoreboard on top of the cascade up to date
  else if(s.phase==='playing'&&me.solved&&R.liveRound===s.round){
    const sig=s.players.map(p=>p.id+':'+p.points+':'+p.bonks+':'+p.lives).join();
    if(sig!==R.liveSig){R.liveSig=sig;renderScoreRows(s,false)}
  }
  // An opponent beat me to it, but I can still score
  if(s.phase==='playing'&&!me.solved&&!me.gaveUp&&myGroup&&myGroup.winnerId&&myGroup.winnerId!==R.myId&&R.beatenRound!==s.round){
    R.beatenRound=s.round;
    const w=s.players.find(p=>p.id===myGroup.winnerId);
    if(isElim(s)&&me.beaten){
      // Elimination: the race is over for me. Stop the board and break a heart in the middle of the screen.
      clearTimeout(R.wrongTimer);R.wrongIdx=null;R.locked=true;R.sel=null;R.op=null;renderCards();
      setMsg(`${w?w.name:'Your opponent'} made 24 first. You lose a life.`,'bad');
      heartLoss(s,me,w);
    }else setMsg(`${w?w.name:'Your opponent'} made 24 first, but you can still score points. Keep going!`,'bad');
  }
  if(s.phase==='playing'&&me.gaveUp)setMsg('You gave up. Waiting for the others…','bad');

  if((s.phase==='result'||s.phase==='final')&&s.result&&R.shownResultRound!==s.round){R.shownResultRound=s.round;showResult(s.result,s)}
}

// I made 24 while others are still racing: the cascade plays and the scoreboard shows on top
function showSolved(s,me,first){
  const last=R.slots.find(Boolean);
  $('resIcon').textContent=first?'★':'✓';$('resIcon').classList.remove('warn');
  $('resTitle').textContent=first?'You won your race!':'You made 24!';
  $('resExpr').textContent=last?`${last.e} = 24`:'';
  $('resSub').textContent=`+${me.gained} points${first?` (including +${s.firstBonus} for finishing first)`:''}.`;
  clearInterval(R.nextTick);$('againNote').textContent='Waiting for the others to finish…';
  R.liveRound=s.round;R.liveSig=s.players.map(p=>p.id+':'+p.points+':'+p.bonks+':'+p.lives).join();
  renderScoreRows(s,true);show('resultDlg');growScores();
}

function showResult(res,s){
  R.locked=true;R.sel=null;R.op=null;stopTimer();
  const final=s.phase==='final';
  const mine=res.groups.find(g=>g.members.includes(R.myId));
  const solve=mine&&mine.solvers.find(x=>x.id===R.myId);
  const won=!!solve&&solve.first;
  let icon,title,expr,sub;
  if(!mine){
    title=`Round ${s.matchRound} results`;icon='i';
    expr=res.solution?`${res.solution} = 24`:'';
    const meOut=s.players.find(p=>p.id===R.myId);
    sub=isElim(s)&&meOut&&meOut.out?'You’re out. Watch for the last one standing, and keep practising on the same cards each round.':'You’ll race from the next round.';
  }else if(solve){
    title=won?'You won your race!':'You made 24!';
    icon=won?'★':'✓';
    expr=`${solve.expr} = 24`;
    sub=`You made 24 in ${solve.time.toFixed(1)} seconds: +${solve.points} points${won?` (including +${s.firstBonus} for finishing first)`:''}.`;
    if(!won&&mine.winner)sub+=` ${mine.winner} was first.`;
    setMsg(won?'You made 24 first!':'You made 24!','good');
  }else{
    const me=s.players.find(p=>p.id===R.myId);
    const timedOut=res.reason==='time'&&me&&!me.gaveUp;
    if(timedOut)outOfTime();      // in case my clock hadn't quite reached zero
    title=timedOut?'Out of time!':'You didn’t make 24 this round';icon=timedOut?'⏱':'i';
    expr=res.solution?`${res.solution} = 24`:'';
    sub=(mine.winner?`${mine.winner} won your race. `:'')+'No points this round. Here is one answer.';
    if(!timedOut&&!(isElim(s)&&me&&me.beaten))setMsg(res.reason==='host'?'The host ended the game.':'Time’s up!','bad');
  }
  const meNow=s.players.find(p=>p.id===R.myId);
  if(isElim(s)&&mine&&meNow){
    // Elimination: the result is about lives, not points
    if(!won&&!solve&&mine.winner){title='You lost your race';icon='!'}
    if(meNow.out&&meNow.outRound===s.matchRound){title='You’re out!';icon='✕'}
    if(won)sub=`You won your race and keep your lives: ${hearts(s,meNow)}.`;
    else if(res.reason==='host')sub='The host ended the game, so nobody lost a life this round.';
    else sub=(solve?`${mine.winner} was first, so you lose a life. `:mine.winner?`${mine.winner} won your race, so you lose a life. `:'Nobody in your group made 24, so you each lose a life. ')+
      (meNow.out?'That was your last life.':`Lives left: ${hearts(s,meNow)}.`);
    if(res.wipeout)sub+=' Everyone left would have been knocked out at once, so they all stay in on one life.';
  }
  if(res.fastest)sub+=` Fastest in the class: ${res.fastest.id===R.myId?'you':res.fastest.name} (${res.fastest.time.toFixed(1)} s).`;

  const rows=standings(s);
  const top=rows[0],tie=rows.length>1&&samePlace(s,rows[1],top);
  if(final){
    const meWin=!tie&&top.id===R.myId;
    const leaders=rows.filter(p=>samePlace(s,p,top)).map(p=>p.name);
    const nobody=!isElim(s)&&top.points===0;
    title=nobody?'Game over':tie?`It's a tie between ${listNames(leaders)}!`:isElim(s)?(meWin?'You’re the last one standing!':`${top.name} is the last one standing!`):(meWin?'You win the match!':`${top.name} wins the match!`);
    icon=nobody?'i':tie?'=':(meWin?'★':'!');
    sub=res.endedEarly?(isElim(s)?`The host ended the game in round ${s.matchRound}. ${sub}`:`The host ended the game after round ${s.matchRound} of ${s.matchRounds}. ${sub}`):`Last round: ${sub}`;
  }
  $('resIcon').textContent=icon;$('resIcon').classList.toggle('warn',icon==='!');
  $('resTitle').textContent=title;$('resExpr').textContent=expr;$('resSub').textContent=sub;

  // If the scoreboard is already up (I made 24 earlier), update it in place instead of regrowing the bars
  const already=R.liveRound===s.round;R.liveRound=null;
  renderScoreRows(s,!already);

  const left=s.matchRounds-s.matchRound;
  clearInterval(R.nextTick);
  if(final)$('againNote').textContent='Match over. Waiting for the host…';
  else{
    // The next round starts by itself after a 3-second countdown
    // …unless the host has paused, in which case it waits for them
    const f=()=>{const st=R.state||s,n=R.nextAt?Math.max(1,Math.min(3,Math.ceil((R.nextAt-performance.now())/1000))):3;
      const pre=isElim(s)?`${s.players.filter(p=>!p.out).length} players still in.`:`${left} round${left>1?'s':''} to go.`;
      $('againNote').textContent=st.hold?`${pre} Paused by the host. The next round starts when they’re ready.`:`${pre} Next round in ${n}…`};
    f();R.nextTick=setInterval(f,200);
  }
  renderCards();

  const open=()=>{show('resultDlg');if(!already)growScores()};
  // If I just ran out of time, let the grey-out animation play before the results appear
  let waitFor=R.timedOutRound===s.round?Math.max(0,OUT_OF_TIME_MS-(performance.now()-R.timedOutAt)):0;
  // …and let a breaking heart finish before the results cover it
  if(R.heartRound===s.round)waitFor=Math.max(waitFor,(reduceMotion()?1500:HEART_MS)-(performance.now()-R.heartAt));
  if(waitFor>0){setTimeout(open,waitFor);return}
  const celebrate=final?(!tie&&top.id===R.myId):(!!solve&&R.celebratedRound!==s.round);
  // The scoreboard opens straight away, on top of the win cascade (no buttons to press:
  // the next round, or the host's next match, closes it)
  if(celebrate&&!cascadeRAF){R.celebratedRound=s.round;runCascade(null)}
  open();
}

// Scoreboard: one progress bar per player. The top score fills the bar; the others are
// scaled against it, so the bar lengths show the gap between players. grow=true starts
// each bar at last round's score so growScores() can animate it; bonkId shakes that row.
function renderScoreRows(s,grow,bonkId,bonkTaken){
  const elim=isElim(s);
  const rows=standings(s);
  const top=rows[0],tie=rows.length>1&&samePlace(s,rows[1],top);
  // Points: bars scaled to the top score. Elimination: bars show lives left out of 3.
  const val=p=>elim?p.lives:p.points;
  const max=elim?(s.maxLives||3):Math.max(...rows.map(p=>p.points));
  const pct=v=>max>0?(v/max)*100:0;
  const box=$('scoreRows');box.classList.toggle('compact',rows.length>8);
  const level=allTied(s);   // everyone level: no ranks (they'd all say "1=")
  box.innerHTML=rows.map((p,i)=>{
    const same=q=>samePlace(s,q,p);
    const rank=rows.findIndex(same)+1,tied=rows.filter(same).length>1;
    const before=elim?(grow&&p.lostLife?p.lives+1:p.lives):(grow?p.points-(p.gained||0):p.points);
    const bonked=p.id===bonkId;
    return `<div class="sb-row${p.id===R.myId?' me':''}${i===0&&!tie&&max>0&&!(elim&&p.out)?' lead':''}${elim&&p.out?' out':''}${bonked?' bonked':''}">`+
      `<span class="sb-rank">${level?'':tied?rank+'=':rank}</span>`+
      `<span class="sb-name"><span class="sb-line">${emojiTag(s,p)}<b>${esc(p.name)}</b>${p.id===R.myId?' <span class="you">(you)</span>':''}</span><small>${elim&&p.out?`Out in round ${p.outRound} · `:''}${p.wins} race${p.wins===1?'':'s'} won${p.bonks?` · ${p.bonks} bonk${p.bonks>1?'s':''}`:''}</small></span>`+
      (elim
        ?`<span class="sb-hearts" aria-label="${p.lives} lives">${hearts(s,p)}</span>`+
          `<span class="sb-pts">${bonked?'<span class="gain minus">−❤️</span>':grow&&p.lostLife?'<span class="gain minus">−❤️</span>':''}</span>`
        :`<span class="sb-track"><span class="sb-fill" data-to="${pct(val(p))}" style="width:${pct(before)}%"></span></span>`+
          `<span class="sb-pts"><span class="sb-num" data-from="${before}" data-to="${p.points}">${before.toLocaleString()}</span>`+
          `${bonked?`<span class="gain minus">−${bonkTaken}</span>`:grow&&p.gained?`<span class="gain">+${p.gained}</span>`:''}</span>`)+
      (bonked?'<span class="bonk-pop" aria-hidden="true">BONK!</span>':'')+`</div>`;
  }).join('');
}

// The host bonked someone: tell the player, and shake their row if the results are showing
socket.on('bonked',b=>{
  if(b.id===R.myId){
    const what=b.life?(b.out?'your last life. You’re out':'a life'):`${b.taken} points`;
    const m=$('msg');setMsg(`BONK! The host took ${what} from you.`,'bad');
    m.classList.remove('bonk-msg');void m.offsetWidth;m.classList.add('bonk-msg');
    R.notice=`BONK! The host took ${what} from you.`;R.noticeAt=Date.now();
  }
  // Refresh the results scoreboard if it's open, or about to open after the win animation
  const st=R.state;
  if(st&&(st.phase==='result'||st.phase==='final')&&R.shownResultRound===st.round)renderScoreRows(st,false,b.id,b.taken);
  else if(st&&st.phase==='playing'&&R.liveRound===st.round){R.liveSig=st.players.map(p=>p.id+':'+p.points+':'+p.bonks+':'+p.lives).join();renderScoreRows(st,false,b.id,b.taken)}
  render();
});

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
  wrap.className='cards n'+R.slots.length+(R.state&&R.timedOutRound===R.state.round?' timeout':'');   // 4 or 5 cards
  R.slots.forEach((s,i)=>{
    const slot=document.createElement('div');slot.className='slot';
    if(s){
      const c=document.createElement('div');const label=fmtText(s.v);
      c.className='card'+(s.suit.red?' red':'')+(R.sel===i?' sel':'')+(anim==='deal'?' deal':R.wrongIdx===i?' wrong':(s.fresh?' pop':''));
      if(anim==='deal')c.style.animationDelay=(i*0.09)+'s';
      // Out of time: keep the grey-out going from where it was if the cards are redrawn
      if(R.state&&R.timedOutRound===R.state.round)c.style.animationDelay=(i*0.08-(performance.now()-R.timedOutAt)/1000)+'s';
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
  const s=R.state,me=s&&s.players.find(p=>p.id===R.myId);
  if(R.practice)return !R.locked&&!R.offline&&s&&s.phase==='playing'&&!!me;   // knocked out: just for fun
  const g=me&&me.group!==null?s.groups.find(x=>x.id===me.group):null;
  return !R.locked&&!R.offline&&s&&s.phase==='playing'&&me&&!me.gaveUp&&!me.solved&&!me.beaten&&g;
}
// Elimination: a player who's out keeps getting the same cards as everyone else to practise on
const practising=(s,me)=>!!s&&!!me&&isElim(s)&&me.out&&(s.phase==='countdown'||s.phase==='playing');
function clickCard(i){
  if(!canPlay())return;
  SFX.play('select');
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
    if(v===24&&R.practice){
      R.locked=true;R.sel=null;setMsg(`You made 24: ${R.slots[i].e} = 24. Nice! (Practice, so it doesn’t count.)`,'good');runCascade(null);
    }else if(v===24){
      R.locked=true;R.sel=null;setMsg('Checking…');
      submitMoves(R.moves.map(m=>({...m})));
    }else wrongAnswer(i,v);
  }else setMsg('Keep going…');
  renderCards();
}
// Send an answer. Kept until the server replies, so it can be re-sent if the connection drops.
function submitMoves(moves){
  const round=R.state&&R.state.round;R.pendingSubmit={round,moves};
  // Seconds since my cards appeared, timed on this device, so a slow connection doesn't cost points
  const elapsed=Math.max(0,(performance.now()-(R.deadline-(R.limitMs||30000)))/1000);
  socket.emit('submit',moves,elapsed,res=>{
    if(!R.pendingSubmit||R.pendingSubmit.round!==round)return;
    R.pendingSubmit=null;
    if(!res.ok&&!/already made 24/.test(res.error))setMsg(res.error,'bad');
  });
}
// Down to one card but it isn't 24: the card shakes red and fades, then the cards
// deal back in so the player can try again straight away (no score lost).
const WRONG_MS=900;
function wrongAnswer(i,v){
  const round=R.state&&R.state.round;
  R.locked=true;R.sel=null;R.op=null;R.wrongIdx=i;
  setMsg(`That makes ${fmtText(v)}, not 24. Try again!`,'bad');
  clearTimeout(R.wrongTimer);
  R.wrongTimer=setTimeout(()=>{
    R.wrongIdx=null;
    const s=R.state;
    if(!s||s.round!==round||s.phase!=='playing'||R.timedOutRound===s.round)return;   // round already over
    resetBoard();R.locked=false;sendProgress({kind:'reset'});renderCards('deal');
  },reduceMotion()?400:WRONG_MS);
}
// Elimination: a player who lost their race sees their hearts in the middle of the screen,
// with the life they just lost turning white
const HEART_MS=2200;
function heartLoss(s,me,winner){
  const left=Math.max(0,me.lives-1),max=s.maxLives||3;
  $('hlLeft').innerHTML='<span>❤️</span>'.repeat(left)+
    '<span class="hl-losing"><span class="hl-red">❤️</span><span class="hl-white">🤍</span></span>'+
    '<span>🤍</span>'.repeat(Math.max(0,max-left-1));
  $('hlLeft').setAttribute('aria-label',`${left} ${left===1?'life':'lives'} left`);
  R.heartAt=performance.now();R.heartRound=s.round;
  const el=$('heartLoss');el.hidden=false;el.classList.remove('play');void el.offsetWidth;el.classList.add('play');
  SFX.play('timeUp');
  clearTimeout(R.heartTimer);R.heartTimer=setTimeout(()=>{el.hidden=true;el.classList.remove('play')},reduceMotion()?1500:HEART_MS);
}
function pickOp(op){if(!canPlay())return;if(R.sel===null){setMsg('Pick a card first.','bad');return}R.op=op;renderCards()}
function undo(){if(!canPlay()||!R.history.length)return;R.slots=R.history.pop();R.moves.pop();R.sel=null;R.op=null;sendProgress({kind:'undo'});setMsg('Undone.');renderCards()}
function reset(){if(!canPlay())return;resetBoard();sendProgress({kind:'reset'});setMsg('Cards reset.');renderCards('deal')}
function giveUp(){if(!canPlay())return;R.locked=true;R.sel=null;if(R.practice){setMsg('Practice over for this round. New cards next round.');renderCards();return}sendProgress();socket.emit('giveUp');renderCards()}

/* ---------- Opponents' face-down cards ----------
 * One small panel per opponent (two when you are in a group of three). We only ever
 * learn the shape of their board (which slots hold cards, which is selected, and
 * each move), never the numbers.
 */
function sendProgress(extra){if(R.practice)return;socket.emit('progress',{layout:R.slots.map(Boolean),sel:R.sel,...(extra||{})})}
const OPP=new Map();   // opponent id → { el, seq, layout, animating, pending }
const reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function clearOpps(){OPP.clear();$('oppSide').innerHTML=''}
function makeOppPanel(n){
  const el=document.createElement('div');el.className='opp-side';
  el.innerHTML='<div class="opp-label">You\'re racing</div><div class="opp-name"></div><div class="opp-cards">'+
    '<div class="mini-slot"><div class="mini-card"></div></div>'.repeat(n)+'</div><div class="opp-status"></div>';
  el.querySelector('.opp-cards').classList.add('n'+n);
  return el;
}
const minis=o=>[...o.el.querySelectorAll('.mini-card')];
function buildOpp(o,anim,popAt){
  minis(o).forEach((c,i)=>{
    c.className='mini-card'+(o.layout[i]?'':' gone')+(anim==='deal'&&o.layout[i]?' deal':'')+(popAt===i?' pop':'');
    c.style.transform='';c.style.animationDelay=anim==='deal'?(i*0.07)+'s':'';
  });
}
function renderOpps(opps,s,group){
  const box=$('oppSide');
  for(const [id,o] of OPP)if(!opps.some(p=>p.id===id)){o.el.remove();OPP.delete(id)}
  for(const p of opps){
    let o=OPP.get(p.id);
    const n=(p.layout||[]).length||4;
    if(o&&o.layout.length!==n){o.el.remove();OPP.delete(p.id);o=null}     // card count changed
    if(!o){o={el:makeOppPanel(n),seq:null,layout:new Array(n).fill(true),animating:false,pending:null};OPP.set(p.id,o);box.appendChild(o.el);buildOpp(o,'deal')}
    renderOpp(o,p,s,group);
  }
  box.hidden=!opps.length;
  box.classList.toggle('multi',opps.length>1);   // group of three: two smaller panels
}
function renderOpp(o,opp,s,group){
  if(o.animating){o.pending=[opp,s,group];return}
  o.el.querySelector('.opp-name').innerHTML=emojiTag(s,opp)+esc(opp.name);
  o.el.classList.toggle('gave-up',!!opp.gaveUp);
  const oppWon=!!opp.solved;
  const first=!!group&&group.winnerId===opp.id;
  o.el.querySelector('.opp-status').innerHTML=oppWon?(first?'Made 24 first!':'Made 24!'):opp.gaveUp?'Gave up':
    (s.phase==='playing'?'Thinking<span class="dots"><i>.</i><i>.</i><i>.</i></span>':'');
  const layout=(opp.layout||o.layout).map(Boolean);
  if(o.seq!==opp.moveSeq){
    const prevSeq=o.seq;o.seq=opp.moveSeq;
    const m=opp.lastMove;
    if(prevSeq!==null&&m&&m.kind==='move'&&o.layout[m.a]&&o.layout[m.b]){ // slide card a onto card b
      const cards=minis(o),ca=cards[m.a],cb=cards[m.b];
      const ra=ca.getBoundingClientRect(),rb=cb.getBoundingClientRect();
      ca.classList.remove('sel');cb.classList.remove('sel');ca.classList.add('moving');
      o.animating=true;
      requestAnimationFrame(()=>{ca.style.transform=`translate(${rb.left-ra.left}px,${rb.top-ra.top}px)`});
      setTimeout(()=>{
        o.animating=false;o.layout=layout;buildOpp(o,null,m.b);
        const p=o.pending;o.pending=null;if(p)renderOpp(o,...p);else applySel(o,opp,oppWon,layout);
      },reduceMotion()?0:340);
      return;
    }
    // undo, reset or a fresh round: show the new shape, dealing in any card that came back
    const back=layout.map((v,i)=>v&&!o.layout[i]);
    o.layout=layout;buildOpp(o);
    minis(o).forEach((c,i)=>{if(back[i])c.classList.add('deal')});
  }
  applySel(o,opp,oppWon,layout);
}
function applySel(o,opp,oppWon,layout){
  minis(o).forEach((c,i)=>{
    c.classList.toggle('sel',opp.sel===i&&!opp.gaveUp&&!oppWon);
    c.classList.toggle('win',oppWon&&layout.filter(Boolean).length===1&&!!layout[i]);
  });
}

/* ---------- Timer: counts down the round's time limit ---------- */
function startTimer(){stopTimer();const t=$('timer');
  const f=()=>{
    const left=Math.max(0,Math.ceil((R.deadline-performance.now())/1000));
    t.textContent='Time left: '+left;t.classList.toggle('warn',left<=10);
    if(left===0&&canPlay())outOfTime();      // time's up and I haven't made 24
  };f();R.tick=setInterval(f,250)}

/* ---------- Out of time: grey out the cards and say so ---------- */
const OUT_OF_TIME_MS=1900;   // how long the results wait so the player sees it
function outOfTime(){
  const s=R.state;if(!s||R.timedOutRound===s.round)return;
  R.timedOutRound=s.round;R.timedOutAt=performance.now();
  clearTimeout(R.wrongTimer);R.wrongIdx=null;
  SFX.play('timeUp');
  R.locked=true;R.sel=null;R.op=null;stopTimer();
  renderCards();
  setMsg('Out of time!','timeout');
}
function stopTimer(){clearInterval(R.tick);$('timer').classList.remove('warn')}

/* ---------- Win cascade (same as the projector game) ---------- */
let cascadeRAF=null,cascadeDone=null;
function runCascade(onDone){
  const cv=$('cascade'),felt=$('felt');
  SFX.play('cascade');
  if(reduceMotion()||!document.querySelector('.slot')){if(onDone)onDone();return}
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

/* ---------- Dialogs, menus, buttons, keys ---------- */
function show(id){closeMenus();$(id).classList.add('show')}
function hide(id){$(id).classList.remove('show')}
function closeMenus(){document.querySelectorAll('.menu.open').forEach(m=>m.classList.remove('open'))}
document.querySelectorAll('.menu-title').forEach(t=>{
  t.onclick=e=>{e.stopPropagation();const m=t.parentElement,was=m.classList.contains('open');closeMenus();if(!was)m.classList.add('open')};
  t.onmouseenter=()=>{if(document.querySelector('.menu.open')&&!t.parentElement.classList.contains('open')){closeMenus();t.parentElement.classList.add('open')}};
});
document.addEventListener('click',closeMenus);
document.querySelectorAll('[data-about]').forEach(b=>b.onclick=e=>{e.stopPropagation();closeMenus();show('aboutDlg')});
$('soundLabel').textContent=`Sound: ${SFX.on?'On':'Off'}`;
const ACTIONS={undo,reset,giveUp,howto:()=>show('helpDlg'),
  sound:()=>{SFX.setOn(!SFX.on);$('soundLabel').textContent=`Sound: ${SFX.on?'On':'Off'}`},
  fullscreen:()=>{(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>{})}};
document.querySelectorAll('.menu-list button').forEach(b=>b.onclick=()=>{closeMenus();ACTIONS[b.dataset.act]()});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>hide(b.dataset.close));
document.querySelectorAll('.op').forEach(b=>b.onclick=()=>pickOp(b.dataset.op));
$('undoBtn').onclick=undo;$('resetBtn').onclick=reset;$('giveUpBtn').onclick=giveUp;

document.addEventListener('keydown',e=>{
  const k=e.key;
  if(k==='F1'){e.preventDefault();show('helpDlg');return}
  const open=document.querySelector('.modal.show');
  // Escape closes Help or About, even when they're open on top of the results
  if(open){if(k==='Escape'){const top=['helpDlg','aboutDlg'].find(id=>$(id).classList.contains('show'));if(top)hide(top)}return}
  if(cascadeRAF){finishCascade();return}
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
  if(/^[1-9]$/.test(k)){const i=+k-1;if(R.slots&&R.slots[i])clickCard(i)}
  else if(k==='+')pickOp('+');else if(k==='-')pickOp('−');
  else if(k==='*'||k==='x'||k==='X')pickOp('×');else if(k==='/'){e.preventDefault();pickOp('÷')}
  else if(k==='Backspace'){e.preventDefault();undo()}else if(k==='r'||k==='R')reset();
});

showScreen('joinPanel');
if(R.joined)$('joinMsg').textContent='Rejoining…';else($('codeInput').value?$('nameInput'):$('codeInput')).focus();
