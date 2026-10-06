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
 * Tries every order of the four numbers with every choice of three operations,
 * written in one line with no brackets (e.g. 8 × 3 + 2 − 2) and worked out with
 * the normal order of operations: × and ÷ left to right first, then + and −.
 * A solution only counts if every step gives a whole number, so it can always
 * be played with the cards (no fractional cards).
 */
const OPS=['+','−','×','÷'];
function evalNoBrackets(nums,ops){
  // Pass 1: × and ÷ left to right, building the terms that get added/subtracted
  const terms=[nums[0]],signs=['+'];
  let negSteps=false;
  for(let i=0;i<3;i++){
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
function permutations(a){
  if(a.length<=1)return[a];
  const out=[];
  a.forEach((x,i)=>permutations([...a.slice(0,i),...a.slice(i+1)]).forEach(p=>out.push([x,...p])));
  return out;
}
function solve(nums){
  const sols=new Map();
  for(const p of permutations(nums))
    for(const o1 of OPS)for(const o2 of OPS)for(const o3 of OPS){
      const ops=[o1,o2,o3],r=evalNoBrackets(p,ops);
      if(!r||r.v!==24)continue;
      const e=`${p[0]} ${o1} ${p[1]} ${o2} ${p[2]} ${o3} ${p[3]}`;
      if(!sols.has(e))sols.set(e,{e,neg:r.negSteps,div:ops.includes('÷')});
    }
  // Simplest first: no negative running totals, no division, then fewest + and −
  return[...sols.values()].sort((p,q)=>(p.neg-q.neg)||(p.div-q.div)||p.e.localeCompare(q.e));
}

/* ---------- Puzzle generation: four numbers 1–9, always solvable without brackets ---------- */
const recent=[];
function makePuzzle(){
  for(let t=0;t<20000;t++){
    const nums=Array.from({length:4},()=>1+Math.floor(Math.random()*9));
    const key=[...nums].sort((a,b)=>a-b).join(',');
    if(recent.includes(key))continue;
    const sols=solve(nums); if(!sols.length)continue;
    recent.push(key); if(recent.length>40)recent.shift();
    return{nums,sols};
  }
  return{nums:[3,3,8,8],sols:solve([3,3,8,8])};
}

// Export for Node (server) when available; in the browser these are globals.
if (typeof module !== 'undefined') module.exports = { F, apply, is24, solve, makePuzzle };
