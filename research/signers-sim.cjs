// How many signers can a coin actually gather in a 15-min window? (same player model as odds-v7-sim)
// Run: node research/signers-sim.cjs
let S=1;const rnd=()=>(S=(S*16807)%2147483647)/2147483647;
const logn=(m,s)=>Math.exp(Math.log(m)+s*Math.sqrt(-2*Math.log(rnd()||1e-9))*Math.cos(2*Math.PI*rnd()));
const SIZES={small:{lvl:[6,18,18,30],pop:[15,30,55,80]},normal:{lvl:[6,18,18,30],pop:[15,40,80,120]},big:{lvl:[4,12,16,36],pop:[25,80,160,260]}};
const TH=[3,5,8,10,15,20];
for(const size of Object.keys(SIZES)){const Z=SIZES[size];const acc={};
for(let r=0;r<40;r++){S=900+r;const ends=[];let a=0;for(const d of Z.lvl)ends.push(a+=d);const levelAt=h=>ends.findIndex(e=>h<e)+1||4;const P=[];
for(let h=0;h<ends[3];h++){const L=levelAt(h),pe=L===1?0:ends[L-2],pp=L===1?0:Z.pop[L-2];const want=pp+(Z.pop[L-1]-pp)*(h-pe+1)/(ends[L-1]-pe);
while(P.length<want)P.push({join:h,hold:logn(4,1),active:rnd()<0.5,off:Math.floor(rnd()*24),lastGm:-99});
for(const p of P){const gm=p.active?(h-p.off)%6===0:(h-p.off)%24===0;if(gm)p.lastGm=h;}
// signers who answer within 15 min: active-in-6h qualified wallets, each answers with 35% (a 15-min window is short)
const n=P.filter(p=>p.hold>=2&&h-p.join>=1&&h-p.lastGm<6&&rnd()<0.35).length;
const A=acc[L]=acc[L]||{n:0,h:0,c:TH.map(()=>0)};A.n+=n;A.h++;TH.forEach((t,i)=>{if(n>=t)A.c[i]++;});}}
for(const L of [1,2,3,4]){const A=acc[L];console.log(size.padEnd(7),'L'+L,'avg signers',(A.n/A.h).toFixed(1).padStart(5),' hours with >= '+TH.map((t,i)=>t+':'+(A.c[i]/A.h*100).toFixed(0)+'%').join('  '));}}
