/*
 * solver.js — card arithmetic, bracket-free 24 solver and puzzle generator.
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

/* ---------- Solver: bracket-free, whole-number solutions only ----------
 * Tries every order of the numbers (4 or 5 of them) with every choice of
 * operations between them, written in one line with no brackets (e.g. 8 × 3 + 2 − 2)
 * and worked out with the normal order of operations: × and ÷ left to right
 * first, then + and −. A solution only counts if every step gives a whole number,
 * so it can always be played with the cards (no fractional cards).
 */
const OPS=['+','−','×','÷'];
function evalNoBrackets(nums,ops){
  // Pass 1: × and ÷ left to right, building the terms that get added/subtracted
  const terms=[nums[0]],signs=['+'];
  let negSteps=false;
  for(let i=0;i<ops.length;i++){
    const op=ops[i],n=nums[i+1];
    if(op==='×')terms[terms.length-1]*=n;
    else if(op==='÷'){
      const t=terms[terms.length-1];
      if(n===0||t%n!==0)return null; // would make a fraction
      terms[terms.length-1]=t/n;
    }else{terms.push(n);signs.push(op)}
  }
  // Pass 2: + and − left to right
  let v=terms[0];
  for(let i=1;i<terms.length;i++){v=signs[i]==='+'?v+terms[i]:v-terms[i];if(v<0)negSteps=true}
  return{v,negSteps};
}
// Every distinct order of the numbers (repeated numbers aren't swapped with each other)
function permutations(a){
  const sorted=[...a].sort((x,y)=>x-y),used=new Array(a.length).fill(false),cur=[],out=[];
  (function rec(){
    if(cur.length===sorted.length){out.push([...cur]);return}
    for(let i=0;i<sorted.length;i++){
      if(used[i]||(i>0&&sorted[i]===sorted[i-1]&&!used[i-1]))continue;
      used[i]=true;cur.push(sorted[i]);rec();cur.pop();used[i]=false;
    }
  })();
  return out;
}
// limit: stop after this many different solutions (keeps 5- and 6-card puzzles quick)
function solve(nums,limit=Infinity){
  const sols=new Map(),gaps=nums.length-1,combos=4**gaps,ops=new Array(gaps);
  outer:for(const p of permutations(nums))
    for(let k=0;k<combos;k++){
      for(let i=0,x=k;i<gaps;i++,x>>=2)ops[i]=OPS[x&3];
      const r=evalNoBrackets(p,ops);
      if(!r||r.v!==24)continue;
      let e=String(p[0]);for(let i=0;i<gaps;i++)e+=` ${ops[i]} ${p[i+1]}`;
      if(!sols.has(e)){sols.set(e,{e,neg:r.negSteps,div:ops.includes('÷')});if(sols.size>=limit)break outer}
    }
  // Simplest first: no negative running totals, no division
  return[...sols.values()].sort((p,q)=>(p.neg-q.neg)||(p.div-q.div)||p.e.localeCompare(q.e));
}

/* ---------- Puzzle generation: 4 or 5 numbers from 1–9, always solvable without brackets ---------- */
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
if (typeof module !== 'undefined') module.exports = { F, apply, is24, solve, makePuzzle, evalNoBrackets };
