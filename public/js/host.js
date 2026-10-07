/* host.js — the teacher's host screen (Stage 5: each host screen opens its own lobby with a join code). Everyone who makes 24 scores speed points;
 * the first in each group gets a bonus. The host doesn't play: they choose
 * the match length, start each round and show the live races and scoreboard. */

const $=id=>document.getElementById(id);
const socket=io();
const SUITS=[{s:'♠',red:false},{s:'♥',red:true},{s:'♣',red:false},{s:'♦',red:true}];
const H={state:null,deadline:0,tick:null,dealt:0,suits:null,prevPct:new Map(),notice:'',noticeAt:0,editing:null};

const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const listNames=a=>a.length<2?(a[0]||''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];
function describeGroups(n){
  if(n<2)return'At least 2 players need to join.';
  const trio=n%2===1?1:0,pairs=(n-3*trio)/2,parts=[];
  if(pairs)parts.push(`${pairs} pair${pairs>1?'s':''}`);
  if(trio)parts.push('1 group of three');
  return `Each round: ${parts.join(' and ')}.`;
}
const standings=s=>rankPlayers(s);
function show(id){$(id).classList.add('show')}
function hide(id){$(id).classList.remove('show')}

/* ---------- Connecting as the host ---------- */
// Each host screen runs its own lobby. The code and a secret key are kept for this tab,
// so refreshing the page (or a dropped connection) takes back the same lobby.
const LOBBY_KEY='make24-lobby';
function savedLobby(){try{return JSON.parse(sessionStorage.getItem(LOBBY_KEY)||'null')}catch{return null}}
function saveLobby(l){try{sessionStorage.setItem(LOBBY_KEY,JSON.stringify(l))}catch{}}
function hosting(res){
  if(!res.ok){$('hostErrorMsg').textContent=res.error;showView('hostError');$('hStatus').textContent='Not hosting';return}
  H.code=res.code;saveLobby({code:res.code,key:res.key});
  document.title=`Make 24 Host · ${res.code}`;
  $('hStatus').textContent='Hosting';render();
}
function createLobby(){socket.emit('createLobby',hosting)}
socket.on('connect',()=>{
  const l=savedLobby();
  if(l&&l.code&&l.key)socket.emit('reclaimHost',l,res=>res.ok?hosting(res):createLobby());
  else createLobby();
});
socket.on('disconnect',()=>{$('hStatus').textContent='Connection lost. Reconnecting…';clearInterval(H.tick)});
socket.on('notice',t=>{H.notice=t;H.noticeAt=Date.now();render()});
// A player was bonked: play the shake + floating "BONK!" (it survives re-renders, see bonkBits)
const BONK_MS=1400;
H.bonks=new Map();   // player id → {t: time the bonk animation started, taken: points removed}
socket.on('bonked',b=>{
  H.bonks.set(b.id,{t:performance.now(),taken:b.taken,life:b.life});podiumShownFor=0;render();
  setTimeout(()=>{H.bonks.delete(b.id);render()},BONK_MS+50);
});
// A steal: the victim's row shakes with "STOLEN!", and the projector banner says who stole from whom
socket.on('stolen',d=>{
  H.bonks.set(d.from,{t:performance.now(),taken:d.amount,life:d.life,label:'STOLEN!'});H.lastSteal={text:d.text,round:H.state&&H.state.round};
  podiumShownFor=0;render();
  setTimeout(()=>{H.bonks.delete(d.from);render()},BONK_MS+50);
});
socket.on('state',s=>{
  H.state=s;
  if(s.timeLeftMs!=null)H.deadline=performance.now()+s.timeLeftMs;
  H.nextAt=s.nextInMs!=null?performance.now()+s.nextInMs:0;
  H.stealAt=s.stealMsLeft!=null?performance.now()+s.stealMsLeft:0;
  render();
});
// One player's board changed (a small update, not the whole game): only the races panel needs redrawing
socket.on('progress',d=>{
  const s=H.state,p=s&&s.players.find(q=>q.id===d.id);if(!p||s.phase!=='playing')return;
  Object.assign(p,{layout:d.layout,sel:d.sel,lastMove:d.lastMove,moveSeq:d.moveSeq});
  renderRaces(s,null);
});
socket.on('round',r=>{H.suits=r.nums.map(()=>SUITS[Math.floor(Math.random()*4)]);H.deadline=performance.now()+r.countdownMs+r.limitMs});

// Seconds left on the between-rounds countdown (never shows more than 3)
const nextCount=at=>Math.max(1,Math.min(3,Math.ceil((at-performance.now())/1000)));

function showView(id){for(const v of ['hostError','hostLobby','hostGame'])$(v).hidden=(v!==id)}

/* ---------- Drawing ---------- */
function render(){
  const s=H.state;if(!s||s.hostId!==socket.id)return;
  $('hPlayersPanel').textContent=`Lobby ${s.code}${s.lobbyOpen?'':' (closed)'} · Players: ${s.players.length} of ${s.maxPlayers}`;
  if(s.phase==='lobby'){renderLobby(s);return}
  renderGame(s);
}

// Where players should go. Online, that's this site's address; when the server runs on this
// computer (localhost), it's the computer's Wi-Fi address(es) instead.
function joinAddresses(s){
  const local=/^(localhost|127\.|\[::1\])/.test(location.hostname);
  const list=local&&s.joinUrls.length?s.joinUrls:[location.origin+'/'];
  return list.map(u=>u.replace(/^https?:\/\//,'').replace(/\/$/,''));
}

function renderLobby(s){
  showView('hostLobby');clearInterval(H.tick);
  $('hStatus').textContent=`Waiting room · ${isElim(s)?`Elimination, ${s.maxLives} lives`:`${s.matchRounds}-round match`} · ${s.cardCount} cards`;
  $('lobbyCode').textContent=s.code;
  $('joinUrl').innerHTML=joinAddresses(s).map(u=>`<span>${esc(u)}</span>`).join('');
  $('hCount').textContent=s.players.length?`${s.players.length} of ${s.maxPlayers} players have joined`:'No players yet';
  $('hPreview').textContent=describeGroups(s.players.length);
  renderPlayerList(s);
  $('hRounds').value=String(s.matchRounds);
  $('hMode').value=s.mode;$('hRoundsRow').hidden=isElim(s);$('hLivesRow').hidden=!isElim(s);$('hLives').value=String(s.maxLives);
  $('hModeNote').textContent=isElim(s)
    ?`Everyone starts with ${s.maxLives} lives.`+' Lose your race (or nobody in your group makes 24) and you lose a life. Last player standing wins.'
    :'Every card must be used to make 24.';
  $('hCardCount').value=String(s.cardCount);
  $('hStart').disabled=s.players.length<2;
  const recent=H.notice&&Date.now()-H.noticeAt<6000?H.notice:'';
  $('hLobbyMsg').textContent=recent||(s.players.length<2?'Waiting for players to join…':'Press Start Match when everyone has joined.');
}

// Waiting-room list. Each name has a ✎ button; while the host is typing a new name we
// leave that row alone so incoming updates don't wipe what they've typed.
function renderPlayerList(s){
  const list=$('hPlayers');
  if(H.editing&&!s.players.some(p=>p.id===H.editing))H.editing=null;   // that player left
  if(H.editing&&list.querySelector('form.rename')){
    // Already editing: update everyone except the row being typed in
    const ids=s.players.map(p=>p.id),rows=[...list.children].map(li=>li.dataset.id);
    if(ids.join()===rows.join()){
      s.players.forEach(p=>{if(p.id!==H.editing){const li=list.querySelector(`li[data-id="${CSS.escape(p.id)}"] .pname`);if(li)li.textContent=p.name}});
      return;
    }
  }
  // Redraw only when someone joins, leaves, is renamed or changes emoji
  const sig=(H.editing||'')+'|'+s.players.map(p=>p.id+p.name+p.emoji).join('|');
  if(!H.editing&&list.dataset.sig===sig)return;
  list.dataset.sig=sig;
  const typed=list.querySelector('form.rename input')?.value;
  list.innerHTML=s.players.map(p=>p.id===H.editing
    ?`<li data-id="${esc(p.id)}" class="editing"><form class="rename"><input type="text" maxlength="16" value="${esc(p.name)}" aria-label="New name for ${esc(p.name)}">`+
      `<button class="xp-btn" type="submit">Save</button><button class="xp-btn" type="button" data-cancel>Cancel</button></form></li>`
    :`<li data-id="${esc(p.id)}"><span class="pname">${emojiTag(s,p)}${esc(p.name)}</span><button class="edit-name" title="Change ${esc(p.name)}'s name" aria-label="Change ${esc(p.name)}'s name">✎</button></li>`
  ).join('')||'<li class="empty">Players will appear here as they join.</li>';
  const form=list.querySelector('form.rename');
  if(form){
    const input=form.querySelector('input');
    if(typed!=null){input.value=typed;input.focus()}else{input.focus();input.select()}
    form.onsubmit=e=>{e.preventDefault();
      socket.emit('rename',{id:H.editing,name:input.value},res=>{
        if(!res.ok){H.notice=res.error;H.noticeAt=Date.now()}else{H.notice=`Name changed to ${res.name}.`;H.noticeAt=Date.now()}
        H.editing=null;render();
      });
    };
    form.querySelector('[data-cancel]').onclick=()=>{H.editing=null;render()};
    input.onkeydown=e=>{if(e.key==='Escape'){H.editing=null;render()}};
  }
  list.querySelectorAll('.edit-name').forEach(b=>b.onclick=()=>{H.editing=b.parentElement.dataset.id;render()});
}

function renderGame(s){
  showView('hostGame');
  $('hostGame').classList.toggle('final',s.phase==='final');   // final results layout: big scoreboard + podium
  const res=s.phase==='result'||s.phase==='final'?s.result:null;
  $('hRound').textContent=isElim(s)?`Round ${s.matchRound} · ${s.players.filter(p=>!p.out).length} left`:`Round ${s.matchRound} of ${s.matchRounds}`;
  $('hStatus').textContent=(s.phase==='countdown'?'Get ready…':s.phase==='playing'?'Racing':s.phase==='final'?'Match over':'Round over')+
    (s.hold&&s.phase!=='final'?(s.phase==='result'?' · Paused':' · Pausing after this round'):'');

  // The four cards everyone is racing (dealt in once per round)
  if(s.nums&&H.dealt!==s.round){
    H.dealt=s.round;if(!H.suits)H.suits=s.nums.map(()=>SUITS[Math.floor(Math.random()*4)]);
    $('hCards').style.gridTemplateColumns=`repeat(${s.nums.length},clamp(56px,${s.nums.length>4?6.5:8}vw,120px))`;
    $('hCards').innerHTML=s.nums.map((n,i)=>{const su=H.suits[i];return `<div class="slot"><div class="card deal${su.red?' red':''}" style="animation-delay:${i*0.09}s">`+
      `<span class="corner tl">${n}<span class="s">${su.s}</span></span><div class="val">${n}</div><div class="suit-big">${su.s}</div>`+
      `<span class="corner br">${n}<span class="s">${su.s}</span></span></div></div>`}).join('');
  }

  // Clock
  clearInterval(H.tick);
  if(s.phase==='countdown'||s.phase==='playing'){
    const f=()=>{const left=Math.max(0,Math.ceil((H.deadline-performance.now())/1000));
      const c=$('hClock');c.textContent=s.phase==='countdown'?'…':left;c.classList.toggle('warn',s.phase==='playing'&&left<=10)};
    f();H.tick=setInterval(f,250);
  }else{$('hClock').textContent='0';$('hClock').classList.remove('warn')}

  // Banner
  const rows=standings(s);
  if(s.phase==='countdown')$('hBanner').textContent='Get ready…';
  else if(s.phase==='playing'){
    const solved=s.players.filter(p=>p.solved).length,racing=s.players.filter(p=>p.group!==null&&!p.solved&&!p.gaveUp).length;
    $('hBanner').textContent=`${solved} made 24 · ${racing} still racing`;
  }else if(s.phase==='final'){
    const top=rows[0],leaders=rows.filter(p=>samePlace(s,p,top)).map(p=>p.name);
    const ended=res&&res.endedEarly?(isElim(s)?` (game ended in round ${s.matchRound})`:` (game ended after round ${s.matchRound} of ${s.matchRounds})`):'';
    $('hBanner').textContent=(!isElim(s)&&top.points===0?'Game over. Nobody scored':leaders.length>1?`It's a tie between ${listNames(leaders)}!`:isElim(s)?`🏆 ${top.name} is the last one standing!`:`🏆 ${top.name} wins the match!`)+ended;
  }else{
    const f=res&&res.fastest,n=res?res.solvedCount:0;
    const out=isElim(s)&&res&&res.knockedOut&&res.knockedOut.length?`  ·  Out: ${listNames(res.knockedOut)}`:'';
    const stealers=s.players.filter(p=>p.canSteal).map(p=>p.name);
    const steal=stealers.length?`  ·  🔥 ${listNames(stealers)} ${stealers.length>1?'are':'is'} choosing who to steal from`:H.lastSteal&&H.lastSteal.round===s.round?`  ·  ${H.lastSteal.text}`:'';
    $('hBanner').textContent=(f?`${n} of ${s.players.length} made 24 · Fastest: ${f.name} in ${f.time.toFixed(1)} s`:'Nobody made 24 this round')+out+(res&&res.solution?`  ·  One answer: ${res.solution} = 24`:'')+steal+(s.hold?'  ·  Paused':'');
  }

  renderRaces(s,res);
  renderTerm($('hTermBody'),s,4);
  renderScores(s,rows);
  renderPodium(s,rows);

  // Buttons
  // Between rounds the next round starts by itself after a 3-second countdown (shown on the button)
  $('hNext').hidden=!(s.phase==='result'||s.phase==='final');
  clearInterval(H.nextTick);
  if(s.phase==='result'&&s.hold){
    $('hNext').textContent='Start Next Round';$('hNext').disabled=s.players.length<2;
  }else if(s.phase==='result'&&H.nextAt){
    $('hNext').disabled=true;
    const f=()=>{const st=H.state,stealing=st&&st.players.some(p=>p.canSteal)&&H.stealAt;
      $('hNext').textContent=stealing?`Waiting for a steal… ${Math.max(0,Math.ceil((H.stealAt-performance.now())/1000))}`:`Next round in ${nextCount(H.nextAt)}…`};
    f();H.nextTick=setInterval(f,200);
  }else{
    $('hNext').textContent=s.phase==='final'?'New Match':'Next Round';
    $('hNext').disabled=s.players.length<2;
  }
  // Final results: the buttons sit in a row at the bottom of the scoreboard, so they never cover it
  const acts=$('hActions'),slot=$('hFinalSlot');
  if(s.phase==='final'){if(acts.parentElement!==slot)slot.appendChild(acts)}
  else if(acts.parentElement===slot)$('hPodium').after(acts);
  $('hLobby').hidden=s.phase!=='final';
  $('hEnd').hidden=s.phase==='final';
  // Pause: during a round it takes effect once the round ends; on the results it stops the countdown
  $('hPause').hidden=s.phase==='final';
  $('hPause').textContent=s.hold?'Resume':s.phase==='result'?'Pause':'Pause After This Round';
  $('hPause').classList.toggle('on',!!s.hold);
  $('hPause').setAttribute('aria-pressed',!!s.hold);
  if(s.phase==='final')hide('endDlg');
}

// One card per group. Each player shows ★ if they were first, ✓ and their time and points
// if they made 24, or their cards left while still racing.
function renderRaces(s,res){
  const nameOf=id=>{const p=s.players.find(q=>q.id===id);return p?p.name:'(left)'};
  // Redraw only when something shown here has changed
  const sig=s.phase+'|'+(res?'r':'')+'|'+JSON.stringify(res?res.groups.map(g=>[g.members,g.winnerId,g.solvers.map(x=>x.id+x.points)]):s.groups.map(g=>[g.members,g.winnerId,g.done]))+'|'+
    s.players.map(p=>[p.id,p.name,p.emoji,emojiMood(s,p.id),p.solved,p.gained,p.gaveUp,p.beaten,p.out,p.lostLife,(p.layout||[]).map(Number).join('')].join(',')).join(';');
  if($('hRaces').dataset.sig===sig)return;
  $('hRaces').dataset.sig=sig;
  const groups=res?res.groups.map(g=>({members:g.members,winnerId:g.winnerId,solvers:g.solvers,done:true}))
                  :s.groups.map(g=>({...g,solvers:null}));
  $('hRaces').innerHTML=groups.map(g=>{
    const rows=g.members.map(id=>{
      const p=s.players.find(q=>q.id===id);
      const first=g.winnerId===id;
      const sv=g.solvers&&g.solvers.find(x=>x.id===id);
      const solved=sv||(p&&p.solved);
      let detail;
      if(sv)detail=`${sv.time.toFixed(1)} s · +${sv.points}`;
      else if(p&&p.solved)detail=`+${p.gained}`;
      else if(p&&p.gaveUp)detail='gave up';
      else if(p&&p.beaten&&!res)detail='beaten';
      else if(res)detail='—';
      else{const n=p&&p.layout?p.layout.length:s.cardCount,left=p&&p.layout?p.layout.filter(Boolean).length:n;detail=`<span class="pips">${'●'.repeat(left)}${'○'.repeat(n-left)}</span>`}
      if(isElim(s)&&res&&p){if(p.out&&p.outRound===s.matchRound)detail+=' · <b class="knocked">OUT</b>';else if(p.lostLife)detail+=' · −❤️'}
      return `<div class="racer-row${solved?' solved':''}${p&&p.gaveUp?' out':''}"><span class="racer${first?' won':''}">${first?'★ ':solved?'✓ ':''}${emojiTag(s,p)}${esc(nameOf(id))}</span><span class="racer-detail">${detail}</span></div>`;
    }).join('');
    const anySolved=g.solvers?g.solvers.length>0:g.members.some(id=>{const p=s.players.find(q=>q.id===id);return p&&p.solved});
    const status=res||g.done?'':'<div class="race-status">Racing<span class="dots"><i>.</i><i>.</i><i>.</i></span></div>';
    return `<div class="race${anySolved?' done':(g.done||res)?' none':''}">${rows}${status}</div>`;
  }).join('');
}

// Bonk animation pieces for a row. If the scoreboard redraws mid-animation, a negative
// animation-delay picks the animation up where it was instead of restarting it.
function bonkBits(id){
  const b=H.bonks.get(id);if(!b)return{cls:'',style:'',pop:''};
  const ago=performance.now()-b.t;if(ago>BONK_MS)return{cls:'',style:'',pop:''};
  const d=`animation-delay:-${Math.round(ago)}ms`;
  return{cls:' bonked',style:` style="${d}"`,pop:`<span class="bonk-pop" style="${d}" aria-hidden="true">${b.label||'BONK!'}</span>`,
    tag:`<span class="tag minus">${b.life?'−❤️':'−'+b.taken}</span>`};
}

function renderScores(s,rows){
  const elim=isElim(s);
  // Points: bars scaled to the top score. Elimination: bars show lives left out of 3.
  const max=elim?(s.maxLives||3):Math.max(0,...rows.map(p=>p.points));
  const val=p=>elim?p.lives:p.points;
  const pct=v=>max>0?(v/max)*100:0;
  const box=$('hScores');
  // Redraw only when something shown on the scoreboard has changed
  const sig=s.phase+'|'+(H.armed?H.armed.id:'')+'|'+[...H.bonks.keys()].join()+'|'+rows.map(p=>[p.id,p.name,p.emoji,emojiMood(s,p.id),p.points,p.lives,p.out,p.outRound,p.gained,p.lostLife,p.bonks,p.wins,p.streak,p.canSteal].join(',')).join(';');
  if(box.dataset.sig===sig)return;
  box.dataset.sig=sig;
  box.classList.toggle('compact',rows.length>(s.phase==='final'?12:10));
  const level=allTied(s);   // everyone level: no ranks (they'd all say "1=")
  box.innerHTML=rows.map((p,i)=>{
    const same=q=>samePlace(s,q,p);
    const rank=rows.findIndex(same)+1,tied=rows.filter(same).length>1;
    const from=H.prevPct.has(p.id)?H.prevPct.get(p.id):pct(val(p));
    const bk=bonkBits(p.id);
    const tag=bk.tag||(elim?(p.lostLife&&(s.phase==='result'||s.phase==='final')?'<span class="tag minus">−❤️</span>':''):(p.gained?`<span class="tag ready">+${p.gained}</span>`:''));
    const note=(elim&&p.out?`Out in round ${p.outRound} · `:'')+`${p.wins} race${p.wins===1?'':'s'} won`+(p.streak>=2?` · 🔥 ${p.streak} in a row`:'')+(p.bonks?` · ${p.bonks} bonk${p.bonks>1?'s':''}`:'');
    return `<div class="sb-row${i===0&&max>0&&!rows.slice(1).some(same)&&!(elim&&p.out)?' lead':''}${elim&&p.out?' out':''}${bk.cls}" data-id="${esc(p.id)}">`+
      `<span class="sb-rank">${level?'':tied?rank+'=':rank}</span>`+
      `<span class="sb-name"${bk.style}><span class="sb-line">${emojiTag(s,p)}<b>${esc(p.name)}</b></span><small>${note}</small></span>`+
      (elim?`<span class="sb-hearts"${bk.style} aria-label="${p.lives} lives">${hearts(s,p)}</span>`
        :`<span class="sb-track"${bk.style}><span class="sb-fill" data-id="${esc(p.id)}" data-to="${pct(val(p))}" style="width:${from}%"></span></span>`)+
      `<span class="sb-pts">${elim?'':p.points.toLocaleString()}${tag}`+
      (H.armed&&H.armed.id===p.id
        ?`<button class="bonk-btn armed" data-id="${esc(p.id)}" title="Press again to take ${elim?'a life':'500 points'} from ${esc(p.name)}" aria-label="Confirm: bonk ${esc(p.name)}">Sure?</button></span>`
        :`<button class="bonk-btn" data-id="${esc(p.id)}" title="Bonk ${esc(p.name)}: take ${elim?'a life':'500 points'}" aria-label="Bonk ${esc(p.name)}"${elim&&p.out?' disabled':''}>Bonk</button></span>`)+
      bk.pop+`</div>`;
  }).join('');
  // Grow (or shrink) the bars that changed
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    box.querySelectorAll('.sb-fill').forEach(f=>{f.style.width=f.dataset.to+'%';H.prevPct.set(f.dataset.id,+f.dataset.to)});
  }));
}
// Bonk takes two presses so a slip of the mouse can't penalise anyone: the first turns the
// button into "Sure?" for 3 seconds, the second does the bonk.
// pointerdown (not click) so a redraw between press and release can't swallow it.
const ARM_MS=3000;
H.armed=null;   // {id} of the player whose Bonk button is waiting for the second press
function disarm(){clearTimeout(H.armTimer);if(H.armed){H.armed=null;render()}}
function pressBonk(id){
  if(H.armed&&H.armed.id===id){
    clearTimeout(H.armTimer);H.armed=null;
    socket.emit('bonk',id,res=>{if(res&&!res.ok){H.notice=res.error;H.noticeAt=Date.now()}render()});
  }else{
    clearTimeout(H.armTimer);H.armed={id};
    H.armTimer=setTimeout(disarm,ARM_MS);
  }
  render();
  const again=$('hScores').querySelector(`.bonk-btn[data-id="${CSS.escape(id)}"]`);if(again)again.focus({preventScroll:true});
}
$('hScores').addEventListener('pointerdown',e=>{
  const b=e.target.closest('.bonk-btn');if(!b||b.disabled)return;
  e.preventDefault();pressBonk(b.dataset.id);
});
$('hScores').addEventListener('keydown',e=>{
  const b=e.target.closest('.bonk-btn');
  if(b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();pressBonk(b.dataset.id)}
  else if(e.key==='Escape')disarm();
});
// Pressing anywhere else cancels a waiting "Sure?"
document.addEventListener('pointerdown',e=>{if(H.armed&&!e.target.closest('.bonk-btn'))disarm()});

// Final results: a three-step podium (2nd · 1st · 3rd). Tied players share a place.
let podiumShownFor=0;
function renderPodium(s,rows){
  const box=$('hPodium');
  const scorers=isElim(s)?rows:rows.filter(p=>p.points>0);
  if(s.phase!=='final'||!scorers.length){box.hidden=true;box.innerHTML='';podiumShownFor=0;return}
  box.hidden=false;
  if(podiumShownFor===s.round)return;            // already built for this match end
  podiumShownFor=s.round;
  const placeOf=p=>rows.findIndex(q=>samePlace(s,q,p))+1;
  const top=scorers.slice(0,3);
  const ordinal=n=>({1:'1st',2:'2nd',3:'3rd'})[n]||n+'th';
  const step=(p,slot)=>{
    if(!p)return `<div class="step empty step-${slot}"></div>`;
    const place=placeOf(p);
    return `<div class="step step-${slot} place-${Math.min(place,3)}">`+
      `<div class="step-emo">${emojiTag(s,place===1?p:{...p,id:'podium-'+p.id})}</div><div class="step-name">${esc(p.name)}</div><div class="step-score">${isElim(s)?(p.out?`Out in round ${p.outRound}`:hearts(s,p)):p.points.toLocaleString()}</div>`+
      `<div class="step-block"><span class="step-place">${ordinal(place)}</span></div></div>`;
  };
  // Classic order: 2nd on the left, 1st in the middle, 3rd on the right
  box.innerHTML=step(top[1],2)+step(top[0],1)+step(top[2],3);
}

$('hTermSlot').innerHTML=termHTML('hTermBody','C:\\MAKE24\\RACES.EXE');

/* ---------- Controls ---------- */
$('hStart').onclick=()=>socket.emit('start');
$('hNext').onclick=()=>{H.prevPct.clear();socket.emit('start')};      // next round, or a new match after the final
$('hPause').onclick=()=>socket.emit('hold',!(H.state&&H.state.hold));
$('hLobby').onclick=()=>{H.prevPct.clear();socket.emit('toLobby')};
$('hEnd').onclick=()=>{
  const s=H.state,live=s&&(s.phase==='playing'||s.phase==='countdown');
  $('endMsg').textContent=isElim(s)
    ?(live?'Races still going will stop now and nobody loses a life this round. ':'')+'The player with the most lives left wins (ties share first place).'
    :(live?'Races still going will stop now; points already scored count. ':'')+
    `The scoreboard as it stands after round ${s.matchRound} of ${s.matchRounds} will be the final result.`;
  show('endDlg');$('endYes').focus();
};
$('endYes').onclick=()=>{hide('endDlg');socket.emit('endMatch')};
$('hRounds').onchange=()=>socket.emit('setRounds',+$('hRounds').value);
$('hMode').onchange=()=>socket.emit('setMode',$('hMode').value);
$('hLives').onchange=()=>socket.emit('setLives',+$('hLives').value);
$('hCardCount').onchange=()=>socket.emit('setCards',+$('hCardCount').value);

/* ---------- Menus, help, keys ---------- */
function closeMenus(){document.querySelectorAll('.menu.open').forEach(m=>m.classList.remove('open'))}
document.querySelectorAll('.menu-title').forEach(t=>{
  t.onclick=e=>{e.stopPropagation();const m=t.parentElement,was=m.classList.contains('open');closeMenus();if(!was)m.classList.add('open')};
});
document.addEventListener('click',closeMenus);
document.querySelectorAll('[data-about]').forEach(b=>b.onclick=e=>{e.stopPropagation();closeMenus();show('aboutDlg')});
const ACTIONS={howto:()=>show('helpDlg'),
  fullscreen:()=>{(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>{})}};
document.querySelectorAll('.menu-list button').forEach(b=>b.onclick=()=>{closeMenus();ACTIONS[b.dataset.act]()});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>hide(b.dataset.close));
document.addEventListener('keydown',e=>{
  if(e.key==='F1'){e.preventDefault();show('helpDlg')}
  if(e.key==='Escape'){hide('helpDlg');hide('endDlg');hide('aboutDlg')}
});
