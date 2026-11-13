/* Sky Routes v0.5: progressive traffic and a collision camera.
   v0.3 ordered-route traversal and v0.4 artwork are preserved. */
'use strict';
const Navigation = (() => {
  const copy = p => ({x:p.x,y:p.y});
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  class Route {
    constructor(start) {
      this.points=[copy(start)]; this.next=1; this.raw=copy(start);
      this.drawing=true; this.target=null; this.travelled=0; this.length=0;
    }
    push(p) {
      const d=distance(this.points[this.points.length-1],p);
      if(d>0.000001){this.points.push(copy(p));this.length+=d;}
    }
    append(p) {
      if(!this.drawing || !Number.isFinite(p.x) || !Number.isFinite(p.y))return;
      const from=copy(this.raw), count=Math.ceil(distance(from,p)/6);
      for(let i=1;i<=count;i++) {
        const q={x:from.x+(p.x-from.x)*i/count,y:from.y+(p.y-from.y)*i/count};
        const a=this.points[this.points.length-1], b=this.raw;
        const end={x:(b.x+q.x)/2,y:(b.y+q.y)/2};
        const steps=Math.max(1,Math.ceil((distance(a,b)+distance(b,end))/2));
        for(let j=1;j<=steps;j++) {
          const t=j/steps,u=1-t;
          this.push({x:u*u*a.x+2*u*t*b.x+t*t*end.x,y:u*u*a.y+2*u*t*b.y+t*t*end.y});
        }
        this.raw=q;
      }
    }
    finish(zone=null) {
      if(!this.drawing)return;
      if(zone){this.append(zone);this.target=zone.t;}
      this.push(this.raw); this.drawing=false;
    }
    advance(plane,budget) {
      let left=Math.max(0,budget);
      while(this.next<this.points.length) {
        const q=this.points[this.next], d=distance(plane,q);
        if(d<0.000001){plane.x=q.x;plane.y=q.y;this.next++;continue;}
        if(left<=0)break;
        plane.a=Math.atan2(q.y-plane.y,q.x-plane.x);
        const move=Math.min(d,left);
        plane.x+=(q.x-plane.x)*move/d;plane.y+=(q.y-plane.y)*move/d;
        this.travelled+=move;left=Math.max(0,left-move);
        if(move>=d){plane.x=q.x;plane.y=q.y;this.next++;}
      }
      return {done:!this.drawing && this.next>=this.points.length,left};
    }
    scale(sx,sy,plane) {
      for(const p of this.points){p.x*=sx;p.y*=sy;}
      this.raw.x*=sx;this.raw.y*=sy;
      this.length=0;this.travelled=0;
      for(let i=1;i<this.points.length;i++) {
        const d=distance(this.points[i-1],this.points[i]);this.length+=d;
        if(i<this.next)this.travelled+=d;
      }
      if(this.next<this.points.length)this.travelled+=distance(this.points[this.next-1],plane);
    }
  }
  function zoneHit(p,z) {
    if(z.t===2)return distance(p,z)<=44;
    const dx=p.x-z.x,dy=p.y-z.y,cs=Math.cos(z.a),sn=Math.sin(z.a);
    const along=dx*cs+dy*sn,cross=-dx*sn+dy*cs;
    return Math.hypot(Math.max(0,Math.abs(along)-39),cross)<=30;
  }
  return {Route,distance,zoneHit};
})();

// Time and successful landings both advance the ramp; use the greater, not
// their sum. Limits prevent runaway speeds, spawn bursts and overcrowding.
const FlightDifficulty = (() => {
  const stages = [
    {name:'LIGHT TRAFFIC',interval:5.6,speed:.88,limit:4},
    {name:'GETTING BUSY', interval:4.7,speed:.96,limit:5},
    {name:'BUSY SKIES',   interval:3.8,speed:1.04,limit:7},
    {name:'RUSH HOUR',    interval:3.0,speed:1.12,limit:9},
    {name:'HEAVY TRAFFIC',interval:2.2,speed:1.20,limit:11},
    {name:'PEAK TRAFFIC', interval:1.6,speed:1.28,limit:13}
  ];
  function at(score,seconds) {
    const progress=Math.min(5,Math.max(0,score/10,(seconds-20)/45));
    const index=Math.floor(progress),fraction=progress-index;
    const a=stages[index],b=stages[Math.min(5,index+1)];
    return {level:index+1,name:a.name,progress,fill:index===5?1:fraction,
      interval:a.interval+(b.interval-a.interval)*fraction,
      speed:a.speed+(b.speed-a.speed)*fraction,limit:a.limit};
  }
  return {at};
})();

const IncidentView = (() => {
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  // Kept pure so edge/corner collisions and rotation can be regression-tested.
  function camera(incident,w,h) {
    const t=clamp(incident.time/2.6,0,1),ease=t*t*(3-2*t);
    const zoom=incident.reduced?1:1+1.6*ease;
    const pan=incident.reduced?0:ease;
    const x=clamp(w/2+(incident.x*w-w/2)*pan,w/(2*zoom),w-w/(2*zoom));
    const y=clamp(h/2+(incident.y*h-h/2)*pan,h/(2*zoom),h-h/(2*zoom));
    return {zoom,x,y,ease};
  }
  function draw(g,incident,w,h) {
    const view=camera(incident,w,h),{zoom,x,y}=view;
    g.save();g.translate(w/2,h/2);g.scale(zoom,zoom);g.translate(-x,-y);
    // A single frozen frame keeps the impact visible, with no further spawns,
    // scoring, aircraft motion or render-clock changes during the camera move.
    g.drawImage(incident.image,0,0,w,h);
    const alpha=Math.min(1,incident.time/.25);
    g.globalAlpha=alpha;g.lineWidth=2/zoom;g.strokeStyle='#fff2d3';
    for(const p of incident.pair){
      g.beginPath();g.arc(p.x*w,p.y*h,25,0,Math.PI*2);g.stroke();
    }
    g.globalAlpha=alpha*.85;g.strokeStyle='#ff827b';g.lineWidth=2.5/zoom;
    g.beginPath();g.arc(incident.x*w,incident.y*h,39,0,Math.PI*2);g.stroke();g.restore();
    const fx=w/2+(incident.x*w-x)*zoom,fy=h/2+(incident.y*h-y)*zoom;
    const vignette=g.createRadialGradient(fx,fy,Math.min(w,h)*.15,fx,fy,Math.max(w,h)*.8);
    vignette.addColorStop(0,'#102e4500');vignette.addColorStop(1,'#102e4577');
    g.save();g.globalAlpha=incident.reduced?.65:view.ease;g.fillStyle=vignette;g.fillRect(0,0,w,h);g.restore();
  }
  return {camera,draw};
})();

(()=>{
'use strict';
const c=document.getElementById('c'),g=c.getContext('2d');
const menu=document.getElementById('menu'),panel=document.getElementById('panel'),heading=document.getElementById('heading'),info=document.getElementById('info');
const scoreEl=document.getElementById('score'),bestEl=document.getElementById('best'),start=document.getElementById('start'),pauseButton=document.getElementById('pause'),hint=document.getElementById('hint');
const levelEl=document.getElementById('level'),trafficEl=document.getElementById('traffic'),meter=document.getElementById('level-fill'),notice=document.getElementById('notice');
const dist=Navigation.distance,baseSpeeds=[76,60,47];
let w=0,h=0,z=[],planes=[],drag=null,score=0,best=0,state='menu',last=0,elapsed=0;
let difficulty=FlightDifficulty.at(0,0),arrival=5.6,spawned=0,incident=null,noticeUntil=0,shownFill=-1;
try{best=Number(localStorage.getItem('sky-routes-best'))||0;}catch(e){}
bestEl.textContent=best;
function resize(){
  const oldW=w,oldH=h;w=innerWidth;h=innerHeight;
  const dpr=Math.min(devicePixelRatio||1,2);c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);
  g.setTransform(dpr,0,0,dpr,0,0);
  z=[{x:w*.2,y:h*.75,t:0,a:-.55},{x:w*.77,y:h*.77,t:1,a:.55},{x:w*.77,y:h*.26,t:2,a:0}];
  if(oldW&&oldH){
    const sx=w/oldW,sy=h/oldH;
    for(const p of planes){p.x*=sx;p.y*=sy;if(p.route)p.route.scale(sx,sy,p);}
    if(drag){drag.down.x*=sx;drag.down.y*=sy;}
  }
}
addEventListener('resize',resize);resize();
function refreshDifficulty(announce=true){
  const previous=difficulty.level;difficulty=FlightDifficulty.at(score,elapsed);
  if(previous!==difficulty.level&&announce){
    notice.textContent='LEVEL '+difficulty.level+' · '+difficulty.name;
    noticeUntil=elapsed+2.7;
  }
}
function difficultyHud(){
  const label='LEVEL '+difficulty.level;
  if(levelEl.textContent!==label){levelEl.textContent=label;trafficEl.textContent=difficulty.name;}
  const fill=Math.round(difficulty.fill*100);
  if(fill!==shownFill){shownFill=fill;meter.style.width=fill+'%';}
  notice.classList.toggle('visible',state==='play'&&elapsed<noticeUntil);
}
function spawn(){
  if(planes.filter(p=>!p.landing).length>=difficulty.limit)return false;
  // Introduce the three aircraft types gently, then mix all three.
  const t=spawned<3?[1,2,0][spawned]:Math.floor(Math.random()*3);
  const speed=baseSpeeds[t]*difficulty.speed;
  for(let attempt=0;attempt<16;attempt++){
    const e=Math.floor(Math.random()*4);
    const x=e===0?-25:e===1?w+25:25+Math.random()*Math.max(1,w-50);
    const y=e===2?-25:e===3?h+25:65+Math.random()*Math.max(1,h-100);
    const a=Math.atan2(h/2-y,w/2-x);
    const future={x:x+Math.cos(a)*speed*1.2,y:y+Math.sin(a)*speed*1.2};
    if(planes.some(p=>!p.landing&&(dist(p,{x,y})<96||dist(future,{x:p.x+Math.cos(p.a)*p.speed*1.2,y:p.y+Math.sin(p.a)*p.speed*1.2})<72)))continue;
    // Speed is fixed at entry. Levelling up never unexpectedly accelerates an
    // aircraft already on a carefully planned route.
    planes.push({x,y,t,a,visualA:a,speed,route:null,landing:0,warning:false});spawned++;return true;
  }
  return false;
}
function begin(){
  finishDrag(null,true);planes=[];score=0;elapsed=0;spawned=0;incident=null;noticeUntil=0;scoreEl.textContent=0;
  refreshDifficulty(false);arrival=difficulty.interval;
  state='play';menu.style.display='none';pauseButton.disabled=false;pauseButton.textContent='Pause';panel.classList.remove('summary');
  spawn();difficultyHud();last=performance.now();
}
function togglePause(){
  if(state==='play'){
    finishDrag(null,true);state='paused';heading.textContent='Paused';info.textContent='Your routes are saved. Ready to continue?';start.textContent='RESUME';panel.classList.add('summary');menu.style.display='grid';pauseButton.textContent='Resume';
  }else if(state==='paused'){state='play';menu.style.display='none';pauseButton.textContent='Pause';last=performance.now();}
}
function collision(a,b){
  if(state!=='play')return;
  finishDrag(null,true);state='crash';pauseButton.disabled=true;notice.classList.remove('visible');
  const image=document.createElement('canvas');image.width=c.width;image.height=c.height;
  const ctx=image.getContext('2d');ctx.setTransform(c.width/w,0,0,c.height/h,0,0);
  SkyArt.render(ctx,w,h,z,planes,null,null,'crash');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  incident={image,x:(a.x+b.x)/(2*w),y:(a.y+b.y)/(2*h),pair:[{x:a.x/w,y:a.y/h},{x:b.x/w,y:b.y/h}],time:0,reduced,duration:reduced?.9:3.2};
  hint.textContent='COLLISION · INCIDENT REVIEW';
}
function showResult(){
  state='over';heading.textContent='Collision!';
  info.textContent='You landed '+score+' aircraft and reached level '+difficulty.level+'. Best: '+best+'.';
  start.textContent='PLAY AGAIN';panel.classList.add('summary');menu.style.display='grid';hint.textContent='';
}
start.onclick=()=>{if(state==='paused')togglePause();else if(state!=='crash')begin();};pauseButton.onclick=togglePause;
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&state==='play')togglePause();
  last=performance.now();
});
function point(e){const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*w/r.width,y:(e.clientY-r.top)*h/r.height};}
function moveDrag(e){
  if(!drag||e.pointerId!==drag.id||state!=='play')return;
  const q=point(e);
  if(!drag.active){
    if(dist(q,drag.down)<6)return;
    drag.active=true;drag.plane.route=new Navigation.Route(drag.plane);
  }
  drag.plane.route.append(q);
}
c.addEventListener('pointerdown',e=>{
  if(state!=='play'||drag||e.isPrimary===false||e.button!==0)return;
  const q=point(e);let selected=null,d=44;
  for(const p of planes){if(p.landing)continue;const v=dist(q,p);if(v<d){selected=p;d=v;}}
  if(!selected)return;
  e.preventDefault();drag={plane:selected,id:e.pointerId,down:q,active:false};
  try{c.setPointerCapture(e.pointerId);}catch(err){}
});
c.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;e.preventDefault();
  const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];
  if(events.length){for(const q of events)moveDrag(q);}else moveDrag(e);
});
function finishDrag(e,cancelled=false){
  if(!drag||(e&&e.pointerId!==drag.id))return;
  if(e&&!cancelled)moveDrag(e);
  const d=drag;drag=null;
  if(d.active&&d.plane.route){
    const route=d.plane.route,zone=z[d.plane.t];
    route.finish(!cancelled&&Navigation.zoneHit(route.raw,zone)?zone:null);
  }
  try{if(c.hasPointerCapture(d.id))c.releasePointerCapture(d.id);}catch(err){}
}
c.addEventListener('pointerup',e=>finishDrag(e));
c.addEventListener('pointercancel',e=>finishDrag(e,true));
c.addEventListener('lostpointercapture',e=>finishDrag(e,true));
function addScore(){
  scoreEl.textContent=++score;
  if(score>best){bestEl.textContent=best=score;try{localStorage.setItem('sky-routes-best',best);}catch(e){}}
}
function separation(a,b){
  const x=a.oldX-b.oldX,y=a.oldY-b.oldY,dx=(a.x-a.oldX)-(b.x-b.oldX),dy=(a.y-a.oldY)-(b.y-b.oldY);
  const den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,-(x*dx+y*dy)/den)):0;
  return Math.hypot(x+dx*t,y+dy*t);
}
function update(dt){
  elapsed+=dt;refreshDifficulty();arrival-=dt;
  if(arrival<=0){
    // A blocked arrival is retried without building up a queue of spawns.
    arrival=spawn()?difficulty.interval*(.94+Math.random()*.12):.5;
  }
  const airborne=[];
  for(const p of planes){
    p.warning=false;
    if(p.landing){p.landing+=dt;if(p.landing>=.45){p.remove=true;addScore();}continue;}
    p.oldX=p.x;p.oldY=p.y;airborne.push(p);
    if(p.route){
      const route=p.route,result=route.advance(p,p.speed*dt);
      if(result.done){
        p.route=null;
        if(route.target!==null)p.readyToLand=true;
        else{p.x+=Math.cos(p.a)*result.left;p.y+=Math.sin(p.a)*result.left;}
      }
    }else{p.x+=Math.cos(p.a)*p.speed*dt;p.y+=Math.sin(p.a)*p.speed*dt;}
    const diff=Math.atan2(Math.sin(p.a-p.visualA),Math.cos(p.a-p.visualA));p.visualA+=diff*(1-Math.exp(-16*dt));
    if(p.x< -100||p.x>w+100||p.y< -100||p.y>h+100)p.remove=true;
  }
  for(let i=0;i<airborne.length;i++)for(let j=i+1;j<airborne.length;j++){
    const a=airborne[i],b=airborne[j],d=separation(a,b);
    if(d<24){collision(a,b);return;}
    if(d<75)a.warning=b.warning=true;
  }
  for(const p of airborne)if(p.readyToLand){p.readyToLand=false;p.landing=.0001;}
  planes=planes.filter(p=>!p.remove);
  if(drag&&!planes.includes(drag.plane))finishDrag(null,true);
}
function draw(){
  difficultyHud();
  if(incident&&(state==='crash'||state==='over')){
    IncidentView.draw(g,incident,w,h);return;
  }
  const active=drag&&drag.active?drag.plane:null;
  const hovered=active&&Navigation.zoneHit(active.route.raw,z[active.t])?active.t:null;
  SkyArt.render(g,w,h,z,planes,drag,hovered,state);
  hint.textContent=state==='play'?(hovered!==null?'RELEASE TO CONFIRM LANDING':elapsed<9?'Drag from an aircraft. Match its colour. Avoid collisions.':''):'';
}
function frame(t){
  const realDt=Math.max(0,Math.min((t-last)/1000,.1));last=t;
  if(!document.hidden){
    if(state==='crash'){
      incident.time=Math.min(incident.duration,incident.time+realDt);
      if(incident.time>=incident.duration)showResult();
    }else{
      let dt=Math.min(realDt,.05);
      while(state==='play'&&dt>0){const step=Math.min(dt,1/120);update(step);dt-=step;}
    }
  }
  draw();requestAnimationFrame(frame);
}
/* TEST_HOOK: local browser tests inject here; no test API is shipped. */
SkyArt.previews();difficultyHud();
requestAnimationFrame(frame);
})();
