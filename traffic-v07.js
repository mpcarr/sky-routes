/* Sky Routes v0.7 — higher traffic pressure without changing drawn-route physics.
   Pure tuning / entry functions are shared by the game and regression tests. */
(function(root){
'use strict';
const C=root.SkyCore;
if(!C)throw new Error('Load core-v06.js before traffic-v07.js');
const stages=[
  ['BUSY SKIES',        3.20,1.02, 8,0],
  ['CROSS TRAFFIC',     2.65,1.08,10,.22],
  ['RUSH HOUR',         2.15,1.14,12,.30],
  ['HEAVY TRAFFIC',     1.75,1.20,14,.35],
  ['PEAK TRAFFIC',      1.45,1.26,16,.40],
  ['PRESSURE ZONE',     1.20,1.32,18,.45],
  ['EXPERT SKIES',      1.02,1.38,20,.48],
  ['EXTREME TRAFFIC',    .88,1.44,22,.50],
  ['AIRSPACE OVERLOAD',  .78,1.50,24,.52],
  ['TOWER CHALLENGE',    .70,1.56,26,.55]
];
const MAX_AIRBORNE=28,MAX_PENDING=4,MAX_SAVED=40,ENTRY_WARNING=1.8;
function difficulty(score,seconds){
  const s=Number.isFinite(score)?Math.max(0,score):0;
  const t=Number.isFinite(seconds)?Math.max(0,seconds):0;
  // Landings AND active play time contribute. Pausing advances neither.
  const progress=s/12+Math.max(0,t-5)/32;
  const level=Math.floor(progress)+1,f=progress-Math.floor(progress);
  const i=Math.min(stages.length-1,Math.floor(progress)),a=stages[i],next=stages[Math.min(i+1,stages.length-1)];
  const overtime=Math.max(0,progress-(stages.length-1));
  return {
    level,name:overtime>=1?'OVERTIME '+(level-10):a[0],fill:f,
    interval:Math.max(.65,a[1]+(next[1]-a[1])*f-overtime*.015),
    speed:Math.min(1.65,a[2]+(next[2]-a[2])*f+overtime*.018),
    limit:Math.min(MAX_AIRBORNE,a[3]+Math.floor(overtime)),
    jumbo:level<2?0:a[4]+(next[4]-a[4])*f,
    pending:MAX_PENDING
  };
}
function paired(d,announced){return d.level>=3&&announced>0&&announced%6===0;}
function plan(w,h,b,d,announced,edge=null,random=Math.random){
  const kind=announced<3?[1,2,0][announced]:d.level>=2&&random()<d.jumbo?3:Math.floor(random()*3);
  const t=kind===3?0:kind;
  edge=Number.isInteger(edge)&&edge>=0&&edge<4?edge:Math.floor(random()*4);
  let x,y;
  if(edge<2){
    x=edge===0?b.l:b.r;
    y=b.t+38+random()*Math.max(1,b.b-b.t-76);
  }else if(edge===2){
    // Keep the top arrival clear of the level panel, including narrow phones.
    const left=Math.max(b.l+25,Math.min(250,w*.64)),right=b.r-25;
    x=left+random()*Math.max(1,right-left);y=b.t;
  }else{
    // Bottom-centre is occupied by the fast-forward / sound controls.
    const offset=8+random()*20;
    x=random()<.5?b.l+offset:b.r-offset;y=b.b;
  }
  const start=C.bounded({x,y},b);
  // Small variations in inbound heading create crossing streams, rather than
  // arranging every un-routed aircraft into exactly the same central meeting.
  const aim={x:w*(.42+random()*.16),y:b.t+(b.b-b.t)*(.4+random()*.2)};
  return {...start,a:Math.atan2(aim.y-start.y,aim.x-start.x),t,jumbo:kind===3,
    speed:(kind===3?102:[76,60,47][t])*d.speed,edge,eta:ENTRY_WARNING,retry:0};
}
function safeEntry(a,planes,b){
  const candidate={...a,id:-1,visualA:a.a,route:null,landing:null};
  const air=planes.filter(p=>!p.landing);
  // Protect actual entry, not the entire future journey: route conflicts after
  // this short buffer belong to the controller. The 1.8s notice is unchanged.
  if(air.some(p=>C.dist(p,candidate)<C.radius(p)+C.radius(candidate)+20))return false;
  const future=C.trace(candidate,b,.8,.1);
  for(const p of air){
    const other=C.trace(p,b,.8,.1),clearance=C.radius(p)+C.radius(candidate)+8;
    for(let i=1;i<future.length;i++){
      if(!other[i].air)break;
      if(C.closest(future[i-1],other[i-1],future[i],other[i]).distance<clearance)return false;
    }
  }
  return true;
}
C.difficulty=difficulty;
root.SkyTraffic={difficulty,paired,plan,safeEntry,MAX_AIRBORNE,MAX_PENDING,MAX_SAVED,ENTRY_WARNING};
if(typeof module!=='undefined')module.exports=root.SkyTraffic;
})(typeof window==='undefined'?globalThis:window);
