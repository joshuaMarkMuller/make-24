/* host.js — the teacher's host screen (Stage 4). Everyone who makes 24 scores speed points;
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
const standings=s=>[...s.players].sort((a,b)=>b.points-a.points||b.wins-a.wins);
function show(id){$(id).classList.add('show')}
function hide(id){$(id).classList.remove('show')}

/* ---------- Connecting as the host ---------- */
socket.on('connect',()=>{
  socket.emit('host',res=>{
    if(!res.ok){$('hostErrorMsg').textContent=res.error;showView('hostError');$('hStatus').textContent='Not hosting';return}
    $('hStatus').textContent='Hosting';render();
  });
});
socket.on('disconnect',()=>{$('hStatus').textContent='Connection lost. Refresh the page to host again.';clearInterval(H.tick)});
socket.on('notice',t=>{H.notice=t;H.noticeAt=Date.now();render()});
// A player was bonked: play the shake + floating "BONK!" (it survives re-renders, see bonkBits)
const BONK_MS=1400;
H.bonks=new Map();   // player id → {t: time the bonk animation started, taken: points removed}
socket.on('bonked',b=>{
  H.bonks.set(b.id,{t:performance.now(),taken:b.taken});podiumShownFor=0;render();
  setTimeout(()=>{H.bonks.delete(b.id);render()},BONK_MS+50);
});
socket.on('state',s=>{
  H.state=s;
  if(s.timeLeftMs!=null)H.deadline=performance.now()+s.timeLeftMs;
  render();
});
socket.on('round',r=>{H.suits=r.nums.map(()=>SUITS[Math.floor(Math.random()*4)]);H.deadline=performance.now()+r.countdownMs+r.limitMs});

function showView(id){for(const v of ['hostError','hostLobby','hostGame'])$(v).hidden=(v!==id)}

/* ---------- Drawing ---------- */
function render(){
  const s=H.state;if(!s||s.hostId!==socket.id)return;
  $('hPlayersPanel').textContent=`Players: ${s.players.length} of ${s.maxPlayers}`;
  if(s.phase==='lobby'){renderLobby(s);return}
  renderGame(s);
}

function renderLobby(s){
  showView('hostLobby');clearInterval(H.tick);
  $('hStatus').textContent=`Waiting room · ${s.matchRounds}-round match · ${s.cardCount} cards`;
  $('joinUrl').innerHTML=(s.joinUrls.length?s.joinUrls:[location.origin+'/race.html']).map(u=>`<span>${esc(u)}</span>`).join('');
  $('hCount').textContent=s.players.length?`${s.players.length} of ${s.maxPlayers} players have joined`:'No players yet';
  $('hPreview').textContent=describeGroups(s.players.length);
  renderPlayerList(s);
  $('hRounds').value=String(s.matchRounds);
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
  const typed=list.querySelector('form.rename input')?.value;
  list.innerHTML=s.players.map(p=>p.id===H.editing
    ?`<li data-id="${esc(p.id)}" class="editing"><form class="rename"><input type="text" maxlength="16" value="${esc(p.name)}" aria-label="New name for ${esc(p.name)}">`+
      `<button class="xp-btn" type="submit">Save</button><button class="xp-btn" type="button" data-cancel>Cancel</button></form></li>`
    :`<li data-id="${esc(p.id)}"><span class="pname">${esc(p.name)}</span><button class="edit-name" title="Change ${esc(p.name)}'s name" aria-label="Change ${esc(p.name)}'s name">✎</button></li>`
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
  $('hRound').textContent=`Round ${s.matchRound} of ${s.matchRounds}`;
  $('hStatus').textContent=s.phase==='countdown'?'Get ready…':s.phase==='playing'?'Racing':s.phase==='final'?'Match over':'Round over';

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
    const top=rows[0],leaders=rows.filter(p=>p.points===top.points&&p.wins===top.wins).map(p=>p.name);
    const ended=res&&res.endedEarly?` (game ended after round ${s.matchRound} of ${s.matchRounds})`:'';
    $('hBanner').textContent=(top.points===0?'Game over. Nobody scored':leaders.length>1?`It's a tie between ${listNames(leaders)}!`:`🏆 ${top.name} wins the match!`)+ended;
  }else{
    const f=res&&res.fastest,n=res?res.solvedCount:0;
    $('hBanner').textContent=(f?`${n} of ${s.players.length} made 24 · Fastest: ${f.name} in ${f.time.toFixed(1)} s`:'Nobody made 24 this round')+(res&&res.solution?`  ·  One answer: ${res.solution} = 24`:'');
  }

  renderRaces(s,res);
  renderScores(s,rows);
  renderPodium(s,rows);

  // Buttons
  $('hNext').hidden=!(s.phase==='result'||s.phase==='final');
  $('hNext').textContent=s.phase==='final'?'New Match':'Next Round';
  $('hNext').disabled=s.players.length<2;
  $('hLobby').hidden=s.phase!=='final';
  $('hEnd').hidden=s.phase==='final';
  if(s.phase==='final')hide('endDlg');
}

// One card per group. Each player shows ★ if they were first, ✓ and their time and points
// if they made 24, or their cards left while still racing.
function renderRaces(s,res){
  const nameOf=id=>{const p=s.players.find(q=>q.id===id);return p?p.name:'(left)'};
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
      else if(res)detail='—';
      else{const n=p&&p.layout?p.layout.length:s.cardCount,left=p&&p.layout?p.layout.filter(Boolean).length:n;detail=`<span class="pips">${'●'.repeat(left)}${'○'.repeat(n-left)}</span>`}
      return `<div class="racer-row${solved?' solved':''}${p&&p.gaveUp?' out':''}"><span class="racer${first?' won':''}">${first?'★ ':solved?'✓ ':''}${esc(nameOf(id))}</span><span class="racer-detail">${detail}</span></div>`;
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
  return{cls:' bonked',style:` style="${d}"`,pop:`<span class="bonk-pop" style="${d}" aria-hidden="true">BONK!</span>`,
    tag:`<span class="tag minus">−${b.taken}</span>`};
}

function renderScores(s,rows){
  const max=Math.max(0,...rows.map(p=>p.points));
  const pct=v=>max>0?(v/max)*100:0;
  const box=$('hScores');box.classList.toggle('compact',rows.length>(s.phase==='final'?12:10));
  box.innerHTML=rows.map((p,i)=>{
    const same=q=>q&&q.points===p.points&&q.wins===p.wins;
    const rank=rows.findIndex(same)+1,tied=rows.filter(same).length>1;
    const from=H.prevPct.has(p.id)?H.prevPct.get(p.id):pct(p.points);
    const bk=bonkBits(p.id);
    const tag=bk.tag||(p.gained?`<span class="tag ready">+${p.gained}</span>`:'');
    const note=`${p.wins} race${p.wins===1?'':'s'} won`+(p.bonks?` · ${p.bonks} bonk${p.bonks>1?'s':''}`:'');
    return `<div class="sb-row${i===0&&max>0&&!rows.slice(1).some(same)?' lead':''}${bk.cls}" data-id="${esc(p.id)}">`+
      `<span class="sb-rank">${tied?rank+'=':rank}</span>`+
      `<span class="sb-name"${bk.style}><span class="sb-line"><b>${esc(p.name)}</b></span><small>${note}</small></span>`+
      `<span class="sb-track"${bk.style}><span class="sb-fill" data-id="${esc(p.id)}" data-to="${pct(p.points)}" style="width:${from}%"></span></span>`+
      `<span class="sb-pts">${p.points.toLocaleString()}${tag}`+
      `<button class="bonk-btn" data-id="${esc(p.id)}" title="Bonk ${esc(p.name)}: take ${500} points" aria-label="Bonk ${esc(p.name)}">Bonk</button></span>`+
      bk.pop+`</div>`;
  }).join('');
  // Grow (or shrink) the bars that changed
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    box.querySelectorAll('.sb-fill').forEach(f=>{f.style.width=f.dataset.to+'%';H.prevPct.set(f.dataset.id,+f.dataset.to)});
  }));
}
// Bonk buttons: pointerdown (not click) so a redraw between press and release can't swallow it
$('hScores').addEventListener('pointerdown',e=>{
  const b=e.target.closest('.bonk-btn');if(!b)return;
  e.preventDefault();
  socket.emit('bonk',b.dataset.id,res=>{if(res&&!res.ok){H.notice=res.error;H.noticeAt=Date.now()}});
});
$('hScores').addEventListener('keydown',e=>{
  const b=e.target.closest('.bonk-btn');if(b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();socket.emit('bonk',b.dataset.id)}
});

// Final results: a three-step podium (2nd · 1st · 3rd). Tied players share a place.
let podiumShownFor=0;
function renderPodium(s,rows){
  const box=$('hPodium');
  const scorers=rows.filter(p=>p.points>0);
  if(s.phase!=='final'||!scorers.length){box.hidden=true;box.innerHTML='';podiumShownFor=0;return}
  box.hidden=false;
  if(podiumShownFor===s.round)return;            // already built for this match end
  podiumShownFor=s.round;
  const placeOf=p=>rows.findIndex(q=>q.points===p.points&&q.wins===p.wins)+1;
  const top=scorers.slice(0,3);
  const ordinal=n=>({1:'1st',2:'2nd',3:'3rd'})[n]||n+'th';
  const step=(p,slot)=>{
    if(!p)return `<div class="step empty step-${slot}"></div>`;
    const place=placeOf(p);
    return `<div class="step step-${slot} place-${Math.min(place,3)}">`+
      `<div class="step-name">${esc(p.name)}</div><div class="step-score">${p.points.toLocaleString()}</div>`+
      `<div class="step-block"><span class="step-place">${ordinal(place)}</span></div></div>`;
  };
  // Classic order: 2nd on the left, 1st in the middle, 3rd on the right
  box.innerHTML=step(top[1],2)+step(top[0],1)+step(top[2],3);
}

/* ---------- Controls ---------- */
$('hStart').onclick=()=>socket.emit('start');
$('hNext').onclick=()=>{H.prevPct.clear();socket.emit('start')};      // next round, or a new match after the final
$('hLobby').onclick=()=>{H.prevPct.clear();socket.emit('toLobby')};
$('hEnd').onclick=()=>{
  const s=H.state,live=s&&(s.phase==='playing'||s.phase==='countdown');
  $('endMsg').textContent=(live?'Races still going will stop now; points already scored count. ':'')+
    `The scoreboard as it stands after round ${s.matchRound} of ${s.matchRounds} will be the final result.`;
  show('endDlg');$('endYes').focus();
};
$('endYes').onclick=()=>{hide('endDlg');socket.emit('endMatch')};
$('hRounds').onchange=()=>socket.emit('setRounds',+$('hRounds').value);
$('hCardCount').onchange=()=>socket.emit('setCards',+$('hCardCount').value);

/* ---------- Menus, help, keys ---------- */
function closeMenus(){document.querySelectorAll('.menu.open').forEach(m=>m.classList.remove('open'))}
document.querySelectorAll('.menu-title').forEach(t=>{
  t.onclick=e=>{e.stopPropagation();const m=t.parentElement,was=m.classList.contains('open');closeMenus();if(!was)m.classList.add('open')};
});
document.addEventListener('click',closeMenus);
const ACTIONS={howto:()=>show('helpDlg'),
  fullscreen:()=>{(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>{})}};
document.querySelectorAll('.menu-list button').forEach(b=>b.onclick=()=>{closeMenus();ACTIONS[b.dataset.act]()});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>hide(b.dataset.close));
document.addEventListener('keydown',e=>{
  if(e.key==='F1'){e.preventDefault();show('helpDlg')}
  if(e.key==='Escape'){hide('helpDlg');hide('endDlg')}
});
