/*
 * solver.js — exact fraction arithmetic, 24 solver and puzzle generator.
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

/* ---------- Solver: finds every distinct solution ---------- */
function solve(nums){
  const sols=new Map();
  function rec(items){
    if(items.length===1){
      const it=items[0];
      if(is24(it.v)){const e=it.e.startsWith('(')?it.e.slice(1,-1):it.e;
        if(!sols.has(e))sols.set(e,{div:it.div,frac:it.frac});}
      return;
    }
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const a=items[i],b=items[j],rest=items.filter((_,k)=>k!==i&&k!==j);
      const tries=[[a,'+',b],[a,'−',b],[b,'−',a],[a,'×',b],[a,'÷',b],[b,'÷',a]];
      for(const [x,op,y] of tries){
        const v=apply(op,x.v,y.v); if(!v)continue;
        let l=x.e,r=y.e;
        if((op==='+'||op==='×')&&l>r)[l,r]=[r,l]; // canonical order for commutative ops
        rec([...rest,{v,e:`(${l} ${op} ${r})`,div:x.div||y.div||op==='÷',frac:x.frac||y.frac||v.d!==1}]);
      }
    }
  }
  rec(nums.map(n=>({v:F(n),e:String(n),div:false,frac:false})));
  // Simplest solutions first: no fractions, no division, shortest
  return [...sols.entries()].map(([e,m])=>({e,...m}))
    .sort((p,q)=>(p.frac-q.frac)||(p.div-q.div)||(p.e.length-q.e.length));
}

/* ---------- Puzzle generation: four numbers 1–9, always solvable ---------- */
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
