/* Sky Routes v0.7 — busier traffic, opposing arrival waves and extended progression. */
'use strict';
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
const C=SkyCore,T=SkyTraffic,$=id=>document.getElementById(id),canvas=$('c'),g=canvas.getContext('2d');
const menu=$('menu'),panel=$('panel'),heading=$('heading'),info=$('info'),start=$('start'),pause=$('pause'),fresh=$('new-game'),boostButton=$('boost'),soundButton=$('sound'),skip=$('skip');
const SAVE='sky-routes-session-v06',BEST='sky-routes-best',SOUND='sky-routes-sound';
let storageOK=true;
function get(key){try{return localStorage.getItem(key);}catch(e){storageOK=false;return null;}}
function put(key,value){try{localStorage.setItem(key,value);return true;}catch(e){storageOK=false;return false;}}
function removeSave(){try{localStorage.removeItem(SAVE);}catch(e){storageOK=false;}}
let w=0,h=0,b,z,planes=[],pending=[],predictions=[],pops=[],drag=null,state='menu';
const savedBest=Number(get(BEST));
let score=0,best=Number.isFinite(savedBest)?Math.max(0,Math.floor(savedBest)):0,elapsed=0,arrival=3.2,spawned=0,seq=0;
let difficulty=C.difficulty(0,0),incident=null,last=performance.now(),boost=false,boostId=null;
let warningClock=0,saveClock=0,noticeUntil=0,recordCelebrated=false,runRecord=false,stored=null;
let lastWarning=-100,previousWarnings='';
$('best').textContent=best;
const audio=(()=>{
  let enabled=get(SOUND)!=='off',ctx=null,master=null;
  function label(){soundButton.textContent=enabled?'SOUND ON':'SOUND OFF';soundButton.setAttribute('aria-pressed',String(enabled));}
  function unlock(){
    if(!enabled)return;
    try{if(!ctx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;ctx=new Audio();master=ctx.createGain();master.gain.value=.055;master.connect(ctx.destination);}if(ctx.state==='suspended')ctx.resume().catch(()=>{});}catch(e){}
  }
  function play(notes,duration=.12){
    if(!enabled||!ctx||ctx.state!=='running'||document.hidden)return;
    try{notes.forEach((frequency,i)=>{const when=ctx.currentTime+i*.085,o=ctx.createOscillator(),v=ctx.createGain();o.type='sine';o.frequency.value=frequency;v.gain.setValueAtTime(.0001,when);v.gain.exponentialRampToValueAtTime(.6,when+.012);v.gain.exponentialRampToValueAtTime(.0001,when+duration);o.connect(v);v.connect(master);o.start(when);o.stop(when+duration+.01);o.onended=()=>{o.disconnect();v.disconnect();};});}catch(e){}
  }
  function quiet(quiet=true){if(master&&ctx)try{master.gain.setTargetAtTime(quiet?0:.055,ctx.currentTime,.015);}catch(e){}}
  soundButton.onclick=()=>{enabled=!enabled;put(SOUND,enabled?'on':'off');label();if(enabled){unlock();quiet(false);play([660]);}else quiet();};label();
  return {unlock,play,quiet};
})();
function announce(message){$('notice').textContent=message;noticeUntil=elapsed+2.6;}
function controlState(){
  document.body.dataset.state=state;pause.disabled=!['play','paused'].includes(state);
  boostButton.disabled=state!=='play';boostButton.classList.toggle('active',boost);boostButton.setAttribute('aria-pressed',String(boost));
  boostButton.textContent=boost?'2× SPEED':'HOLD 2×';skip.hidden=state!=='crash';
}
function stopBoost(){boost=false;boostId=null;controlState();}
boostButton.addEventListener('pointerdown',e=>{
  if(state!=='play'||(e.pointerType==='mouse'&&e.button!==0))return;
  e.preventDefault();boost=true;boostId=e.pointerId;try{boostButton.setPointerCapture(e.pointerId);}catch(err){}controlState();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])boostButton.addEventListener(name,e=>{if(e.pointerId===boostId)stopBoost();});
window.addEventListener('pointerup',e=>{if(e.pointerId===boostId)stopBoost();});
window.addEventListener('keydown',e=>{if(e.code==='Space'&&state==='play'&&!e.repeat&&e.target!==soundButton&&e.target!==pause){e.preventDefault();boost=true;controlState();}});
window.addEventListener('keyup',e=>{if(e.code==='Space')stopBoost();});
function hud(){
  $('score').textContent=score;$('best').textContent=best;$('level').textContent='LEVEL '+difficulty.level;$('traffic').textContent=difficulty.name;
  $('level-fill').style.width=Math.round(difficulty.fill*100)+'%';
  $('notice').classList.toggle('visible',state==='play'&&elapsed<noticeUntil);
  $('save-status').textContent=storageOK?'Your flight saves on this device.':'Browser storage is unavailable. This flight cannot be saved.';
}
function adjustLandings(){
  for(const p of planes){
    if(p.route?.target!==null&&p.route?.target!==undefined)C.approach(p,p.route,z[p.t],b);
    if(p.landing){
      const l=p.landing,zone=z[p.t];
      if(p.t===2){l.from=C.point(zone);l.to=C.point(zone);}
      else{const a=zone.a+(Math.cos(l.heading-zone.a)<0?Math.PI:0);l.heading=a;l.from={x:zone.x-Math.cos(a)*23,y:zone.y-Math.sin(a)*23};l.to={x:zone.x+Math.cos(a)*25,y:zone.y+Math.sin(a)*25};}
      const f=C.clamp(l.time/l.duration,0,1);p.x=l.from.x+(l.to.x-l.from.x)*f;p.y=l.from.y+(l.to.y-l.from.y)*f;
    }
  }
}
function resize(){
  const ow=w,oh=h;w=innerWidth;h=innerHeight;b=C.bounds(w,h);z=C.zones(w,h);
  const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);g.setTransform(dpr,0,0,dpr,0,0);
  if(ow&&oh&&(ow!==w||oh!==h)){
    finishDrag(null,true);C.resizePlanes(planes,w/ow,h/oh);
    for(const a of pending){a.x*=w/ow;a.y*=h/oh;Object.assign(a,C.bounded(a,b));a.a=Math.atan2(h/2-a.y,w/2-a.x);}
    for(const p of planes){if(!C.inside(p,b)&&!p.landing){Object.assign(p,C.bounded(p,b));p.route=C.holding(p,b);}}
    adjustLandings();predictions=[];warningClock=0;
    if(state==='play')togglePause();
  }
}
window.addEventListener('resize',resize);resize();
function save(){
  if(!['play','paused'].includes(state))return;
  const data={version:6,tuning:7,w,h,score,elapsed,arrival,spawned,seq,recordCelebrated,runRecord,planes:planes.map(C.serializePlane),pending:pending.map(a=>({...a}))};
  put(SAVE,JSON.stringify(data));
}
function readSaved(){
  const raw=get(SAVE);if(!raw)return null;
  try{
    if(raw.length>2500000)throw Error('Save too large');
    const s=JSON.parse(raw),valid=n=>typeof n==='number'&&Number.isFinite(n);
    if(s.version!==6||!valid(s.w)||s.w<200||!valid(s.h)||s.h<200||!Number.isSafeInteger(s.score)||s.score<0||s.score>1000000||!valid(s.elapsed)||s.elapsed<0||!valid(s.arrival)||s.arrival<0||!Number.isSafeInteger(s.seq)||s.seq<0||!Number.isSafeInteger(s.spawned)||s.spawned<0)throw Error('Invalid save');
    if(!Array.isArray(s.planes)||s.planes.length>T.MAX_SAVED||!Array.isArray(s.pending)||s.pending.length>T.MAX_PENDING)throw Error('Invalid traffic');
    s.planes=s.planes.map(C.restorePlane);
    if(new Set(s.planes.map(p=>p.id)).size!==s.planes.length||s.planes.some(p=>p.id>s.seq||p.x<0||p.x>s.w||p.y<0||p.y>s.h))throw Error('Invalid positions');
    for(const a of s.pending){if(![a.x,a.y,a.a,a.speed,a.eta].every(valid)||![0,1,2,3].includes(a.edge)||![0,1,2].includes(a.t)||a.speed<20||a.speed>200||a.eta<0||a.eta>2||a.x<0||a.x>s.w||a.y<0||a.y>s.h)throw Error('Invalid arrival');}
    return s;
  }catch(e){removeSave();return null;}
}
function restore(s){
  planes=s.planes;pending=s.pending;score=s.score;elapsed=s.elapsed;arrival=s.arrival;spawned=s.spawned;seq=s.seq;recordCelebrated=!!s.recordCelebrated;runRecord=!!s.runRecord;
  C.resizePlanes(planes,w/s.w,h/s.h);for(const a of pending){a.x*=w/s.w;a.y*=h/s.h;Object.assign(a,C.bounded(a,b));a.a=Math.atan2(h/2-a.y,w/2-a.x);}
  if(s.w!==w||s.h!==h)adjustLandings();difficulty=C.difficulty(score,elapsed);arrival=Math.min(arrival,difficulty.interval);best=Math.max(best,score);put(BEST,String(best));
}
function chooseArrival(edge=null){
  if(pending.length>=T.MAX_PENDING||planes.filter(p=>!p.landing).length+pending.length>=difficulty.limit)return false;
  const candidate=T.plan(w,h,b,difficulty,spawned+pending.length,edge);
  if(pending.some(p=>C.dist(p,candidate)<80))return false;
  pending.push(candidate);audio.play([520],.07);return true;
}
function safeEntry(a){return T.safeEntry(a,planes,b);}
function arrivals(simDt,realDt){
  arrival-=simDt;
  if(arrival<=0){
    const pair=T.paired(difficulty,spawned+pending.length);
    if(chooseArrival()){
      // From level 3, every sixth announced flight can bring an opposing
      // companion. Both receive full warnings and independent entry checks.
      if(pair)chooseArrival(pending[pending.length-1].edge^1);
      arrival=difficulty.interval*(.92+Math.random()*.16);
    }else arrival=.3; // Never accumulate a backlog that releases all at once.
  }
  for(const a of pending){
    a.eta=Math.max(0,a.eta-realDt);a.retry=Math.max(0,(a.retry||0)-realDt);
    if(a.eta===0&&a.retry===0){
      if(planes.filter(p=>!p.landing).length<difficulty.limit&&safeEntry(a)){
        planes.push({id:++seq,x:a.x,y:a.y,t:a.t,jumbo:a.jumbo,a:a.a,visualA:a.a,speed:a.speed,route:null,landing:null,warning:false});a.done=true;spawned++;
      }else a.retry=.25;
    }
  }
  pending=pending.filter(a=>!a.done);
}
function begin(){
  finishDrag(null,true);removeSave();stored=null;planes=[];pending=[];pops=[];predictions=[];score=0;elapsed=0;spawned=0;seq=0;incident=null;noticeUntil=0;warningClock=0;saveClock=0;recordCelebrated=false;runRecord=false;
  difficulty=C.difficulty(0,0);arrival=difficulty.interval;state='play';boost=false;boostId=null;chooseArrival();menu.style.display='none';panel.classList.remove('summary');fresh.hidden=true;pause.textContent='Pause';audio.unlock();audio.quiet(false);controlState();hud();save();last=performance.now();
}
function resume(){
  if(stored){restore(stored);stored=null;}state='play';menu.style.display='none';pause.textContent='Pause';boost=false;boostId=null;audio.unlock();audio.quiet(false);controlState();hud();last=performance.now();
}
function togglePause(){
  if(state==='play'){
    finishDrag(null,true);state='paused';stopBoost();save();audio.quiet();heading.textContent='Paused';info.textContent='Your flight is saved. '+score+' aircraft landed · Level '+difficulty.level+'.';start.textContent='RESUME FLIGHT';fresh.hidden=false;panel.classList.add('summary');menu.style.display='grid';pause.textContent='Resume';
  }else if(state==='paused')resume();
  controlState();
}
start.onclick=()=>{if(stored||state==='paused')resume();else if(state!=='crash')begin();};
fresh.onclick=()=>{if(window.confirm('Start a new flight and replace this saved flight?'))begin();};pause.onclick=togglePause;
function point(e){const r=canvas.getBoundingClientRect();return C.bounded({x:(e.clientX-r.left)*w/r.width,y:(e.clientY-r.top)*h/r.height},b);}
function moveDrag(e){
  if(!drag||drag.id!==e.pointerId||state!=='play')return;
  const q=point(e),p=drag.plane;
  if(p.landing){finishDrag(null,true);return;}
  if(!drag.active){if(C.dist(q,drag.down)<6)return;drag.active=true;p.route=new C.Route(p);}
  if(!p.route||p.route.auto||!p.route.drawing)p.route=new C.Route(p);
  p.route.append(q);drag.last=q;warningClock=0;
}
canvas.addEventListener('pointerdown',e=>{
  if(state==='crash'){if(incident.time>=.55){e.preventDefault();showResult();}return;}
  if(state!=='play'||drag||(e.pointerType==='mouse'&&e.button!==0))return;
  const q=point(e);let target=null,nearest=44;
  for(const p of planes){if(p.landing)continue;const d=C.dist(p,q);if(d<nearest){nearest=d;target=p;}}
  if(!target)return;e.preventDefault();drag={id:e.pointerId,plane:target,down:q,last:q,active:false};try{canvas.setPointerCapture(e.pointerId);}catch(err){}
});
canvas.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;e.preventDefault();const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];
  if(events.length)for(const event of events)moveDrag(event);else moveDrag(e);
});
function finishDrag(e,cancelled=false){
  if(!drag||(e&&drag.id!==e.pointerId))return;
  if(e&&!cancelled)moveDrag(e);if(!drag)return;
  const d=drag;drag=null;const p=d.plane;
  if(d.active&&p.route&&!p.route.auto){
    if(!cancelled&&C.zoneHit(d.last,z[p.t])){C.approach(p,p.route,z[p.t],b);audio.play([740],.07);}
    else p.route.finish();
  }
  try{if(canvas.hasPointerCapture(d.id))canvas.releasePointerCapture(d.id);}catch(err){}warningClock=0;save();
}
canvas.addEventListener('pointerup',e=>finishDrag(e));canvas.addEventListener('pointercancel',e=>finishDrag(e,true));canvas.addEventListener('lostpointercapture',e=>finishDrag(e,true));
function landed(p){
  score++;pops.push({x:p.x,y:p.y,time:0});audio.play([660,880],.13);
  if(score>best){best=score;put(BEST,String(best));runRecord=true;if(!recordCelebrated){recordCelebrated=true;announce('NEW PERSONAL BEST · '+score+' LANDED');audio.play([660,880,1100],.18);}}
  if([10,25,50,75,100].includes(score))announce(score+' LANDED · '+(score<50?'NICE CONTROLLING!':'EXCELLENT WORK!'));
}
function collision(a,d){
  if(state!=='play')return;
  finishDrag(null,true);state='crash';boost=false;boostId=null;removeSave();stored=null;$('notice').classList.remove('visible');
  const image=document.createElement('canvas');image.width=canvas.width;image.height=canvas.height;const ctx=image.getContext('2d');ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);SkyArt.render(ctx,w,h,z,planes,null,null,'crash',{pending,conflicts:[],pops:[]});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;incident={image,x:(a.x+d.x)/(2*w),y:(a.y+d.y)/(2*h),pair:[{x:a.x/w,y:a.y/h},{x:d.x/w,y:d.y/h}],time:0,reduced,duration:reduced?.9:3.2};
  audio.play([260,180],.24);controlState();skip.disabled=true;$('hint').textContent='COLLISION · INCIDENT REVIEW';
}
function showResult(){
  if(state!=='crash')return;state='over';heading.textContent=runRecord?'New record!':'Collision!';info.textContent=score+' aircraft landed · Level '+difficulty.level+' · Best '+best+'.';start.textContent='PLAY AGAIN';fresh.hidden=true;panel.classList.add('summary');menu.style.display='grid';$('hint').textContent='';controlState();
}
skip.onclick=()=>{if(state==='crash'&&incident.time>=.55)showResult();};
function warnings(){
  predictions=C.conflicts(planes,b);const ids=new Set(predictions.flatMap(p=>[p.a,p.b]));for(const p of planes)p.warning=ids.has(p.id);
  const signature=predictions.map(p=>p.a+':'+p.b).sort().join(','),now=performance.now()/1000;
  if(signature&&signature!==previousWarnings&&now-lastWarning>2){lastWarning=now;audio.play([440,520],.085);}previousWarnings=signature;
}
function update(dt,realDt=dt){
  elapsed+=dt;const old=difficulty.level;difficulty=C.difficulty(score,elapsed);if(old!==difficulty.level)announce('LEVEL '+difficulty.level+' · '+difficulty.name);
  arrivals(dt,realDt);const air=[];
  for(const p of planes){const wasAir=!p.landing;p.oldX=p.x;p.oldY=p.y;C.move(p,dt,b);if(wasAir)air.push(p);}
  for(let i=0;i<air.length;i++)for(let j=i+1;j<air.length;j++){
    const a=air[i],d=air[j],hit=C.closest({x:a.oldX,y:a.oldY},{x:d.oldX,y:d.oldY},a,d);
    if(hit.distance<C.radius(a)+C.radius(d)){collision(a,d);return;}
  }
  for(const p of planes)if(p.remove)landed(p);planes=planes.filter(p=>!p.remove);
  if(drag&&(!planes.includes(drag.plane)||drag.plane.landing))finishDrag(null,true);
  for(const p of pops)p.time+=realDt;pops=pops.filter(p=>p.time<1.3);
  warningClock-=dt;if(warningClock<=0){warnings();warningClock=.2;}
}
function draw(){
  hud();if(incident&&['crash','over'].includes(state)){IncidentView.draw(g,incident,w,h);return;}
  const p=drag?.active?drag.plane:null,hovered=p&&C.zoneHit(drag.last,z[p.t])?p.t:null;
  SkyArt.render(g,w,h,z,planes,drag,hovered,state,{pending,conflicts:predictions,pops});
  $('hint').textContent=state==='play'?(hovered!==null?'RELEASE TO CONFIRM THE APPROACH':elapsed<12?'Colour = needs a route · Pale = cleared to land':boost?'2× SPEED · RELEASE TO SLOW DOWN':''):'';
}
function frame(t){
  const real=Math.max(0,Math.min(.1,(t-last)/1000));last=t;
  if(!document.hidden){
    if(state==='crash'){incident.time=Math.min(incident.duration,incident.time+real);skip.disabled=incident.time<.55;if(incident.time>=incident.duration)showResult();}
    else if(state==='play'){
      const rate=boost?2:1;let budget=Math.min(real,.05)*rate;
      while(budget>1e-8&&state==='play'){const dt=Math.min(budget,1/120);update(dt,dt/rate);budget-=dt;}
      saveClock+=real;if(saveClock>=2){saveClock=0;save();}
    }
  }
  draw();requestAnimationFrame(frame);
}
function interrupted(){if(state==='play')togglePause();else if(state==='paused')save();stopBoost();audio.quiet();last=performance.now();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)interrupted();else last=performance.now();});
window.addEventListener('pagehide',interrupted);window.addEventListener('blur',()=>{if(state==='play')interrupted();});
stored=readSaved();
if(stored){heading.textContent='Welcome back';info.textContent='Your flight is saved: '+stored.score+' landed · Level '+C.difficulty(stored.score,stored.elapsed).level+'. Resume when you are ready.';start.textContent='RESUME FLIGHT';fresh.hidden=false;panel.classList.add('summary');}
SkyArt.previews();controlState();hud();
/* TEST_HOOK */
requestAnimationFrame(frame);
})();