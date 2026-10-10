/*
 * solver.js — card arithmetic, 24 solver and puzzle generator.
 * No browser code here, so the multiplayer server (Stage 2+) can reuse it in Node.
 */
/* ---------- Exact fraction arithmetic ---------- */
function gcd(a,b){a=Math.abs(a);b=Math.abs(b);while(b){[a,b]=[b,a%b]}return a||1}
function F(n,d=1){if(d<0){n=-n;d=-d}const g=gcd(n,d);return{n:n/g,d:d/g}}
function apply(op,a,b){
  switch(op){
    case '+':return F(a.n*b.d+b.n*a.d,a.d*b.d);
    case '−':return F(a.n*b.d-b.n*a.d,a.d*b.d);
    case '×':return F(a.n*b.n,a.d*b.d);
    case '÷':return b.n===0?null:F(a.n*b.d,a.d*b.n);
  }
}
const is24=v=>v.n===24&&v.d===1;

/* ---------- Solver: whole-number solutions, brackets allowed ----------
 * Plays the game the way a student does: pick two cards, combine them with an
 * operation, and keep going until one card is left. Combining in a different order
 * is the same as using brackets, e.g. 8 − 2 first, then × 4, is (8 − 2) × 4.
 * A solution only counts if every step gives a whole number (no fractional cards),
 * the same rule the game uses. Expressions are written with only the brackets the
 * normal order of operations needs.
 */
const OPS=['+','−','×','÷'];
const PRECEDENCE={'+':1,'−':1,'×':2,'÷':2};
function combine(op,x,y){
  // x and y are {v, e, prec, neg}; returns the new card, or null if it isn't a whole number
  let v;
  if(op==='+')v=x.v+y.v;else if(op==='−')v=x.v-y.v;else if(op==='×')v=x.v*y.v;
  else{if(y.v===0||x.v%y.v!==0)return null;v=x.v/y.v}
  const p=PRECEDENCE[op];
  const L=x.prec<p?`(${x.e})`:x.e;
  const R=(y.prec<p||(y.prec===p&&(op==='−'||op==='÷')))?`(${y.e})`:y.e;
  return{v,e:`${L} ${op} ${R}`,prec:p,neg:x.neg||y.neg||v<0,div:x.div||y.div||op==='÷'};
}
// limit: stop after this many different solutions (keeps 5-card puzzles quick)
function solve(nums,limit=Infinity){
  const sols=new Map();
  // Sets of card values already known not to make 24, however they're combined
  // (makes impossible puzzles quick to rule out)
  const dead=new Set();
  const start=nums.map(n=>({v:n,e:String(n),prec:3,neg:false,div:false}));
  // Returns true if these cards can make 24 (whether or not the answer was new)
  (function rec(cards){
    if(cards.length===1){
      const c=cards[0];
      if(c.v!==24)return false;
      if(!sols.has(c.e))sols.set(c.e,{e:c.e,neg:c.neg,div:c.div,br:c.e.includes('(')});
      return true;
    }
    const key=cards.map(c=>c.v).sort((a,b)=>a-b).join();
    if(dead.has(key))return false;
    let can=false;
    for(let i=0;i<cards.length;i++)for(let j=0;j<cards.length;j++){
      if(i===j)continue;
      const rest=cards.filter((_,k)=>k!==i&&k!==j);
      for(const op of OPS){
        if((op==='+'||op==='×')&&j<i)continue;   // a + b and b + a are the same move
        const c=combine(op,cards[i],cards[j]);
        if(c&&rec([...rest,c]))can=true;
        if(sols.size>=limit)return true;
      }
    }
    if(!can)dead.add(key);
    return can;
  })(start);
  // Simplest first: no brackets, no negative running totals, no division
  return[...sols.values()].sort((p,q)=>(p.br-q.br)||(p.neg-q.neg)||(p.div-q.div)||p.e.length-q.e.length||p.e.localeCompare(q.e));
}

/* ---------- Puzzle generation: 4 or 5 numbers from 1–9, always solvable (brackets allowed) ---------- */
const recent=[];
function makePuzzle(count=4){
  for(let t=0;t<20000;t++){
    const nums=Array.from({length:count},()=>1+Math.floor(Math.random()*9));
    const key=[...nums].sort((a,b)=>a-b).join(',');
    if(recent.includes(key))continue;
    const sols=solve(nums,count>4?200:Infinity); if(!sols.length)continue;
    recent.push(key); if(recent.length>40)recent.shift();
    return{nums,sols};
  }
  const fallback={4:[3,8,2,2],5:[3,8,2,2,1]}[count]||[3,8,2,2];
  return{nums:fallback,sols:solve(fallback,200)};
}

// Export for Node (server) when available; in the browser these are globals.
if (typeof module !== 'undefined') module.exports = { F, apply, is24, solve, makePuzzle };
