/* Sky Routes 0.6 — deterministic navigation, approaches, holding and prediction.
   Rendering and input are separate. The same integrator drives predictions. */
(function(root){
'use strict';
const TAU=Math.PI*2, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const point=p=>({x:p.x,y:p.y}),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function bounds(w,h){return {l:30,r:w-30,t:Math.min(90,h*.17),b:h-30};}
function inside(p,b,pad=0){return p.x>=b.l+pad&&p.x<=b.r-pad&&p.y>=b.t+pad&&p.y<=b.b-pad;}
function bounded(p,b){return {x:clamp(p.x,b.l,b.r),y:clamp(p.y,b.t,b.b)};}
function zones(w,h){return [{x:w*.2,y:h*.75,t:0,a:-.55},{x:w*.77,y:h*.77,t:1,a:.55},{x:w*.77,y:h*.26,t:2,a:0}];}
class Route {
  constructor(start){this.points=[point(start)];this.next=1;this.raw=point(start);this.drawing=true;this.target=null;this.auto=false;this.rollout=null;this.heading=0;}
  push(p){if(dist(this.points[this.points.length-1],p)>1e-6)this.points.push(point(p));}
  append(p){
    if(!this.drawing||!finite(p.x)||!finite(p.y))return;
    const from=point(this.raw),count=Math.ceil(dist(from,p)/6);
    for(let i=1;i<=count;i++){
      const q={x:from.x+(p.x-from.x)*i/count,y:from.y+(p.y-from.y)*i/count},a=this.points[this.points.length-1],b=this.raw;
      const end={x:(b.x+q.x)/2,y:(b.y+q.y)/2},steps=Math.max(1,Math.ceil((dist(a,b)+dist(b,end))/2));
      for(let j=1;j<=steps;j++){const t=j/steps,u=1-t;this.push({x:u*u*a.x+2*u*t*b.x+t*t*end.x,y:u*u*a.y+2*u*t*b.y+t*t*end.y});}
      this.raw=q;
    }
  }
  finish(){if(this.drawing)this.push(this.raw);this.drawing=false;}
  advance(p,budget){
    let left=Math.max(0,budget);
    while(this.next<this.points.length){
      const q=this.points[this.next],d=dist(p,q);
      if(d<1e-6){p.x=q.x;p.y=q.y;this.next++;continue;}
      if(left<=0)break;
      p.a=angle(p,q);const move=Math.min(d,left);p.x+=(q.x-p.x)*move/d;p.y+=(q.y-p.y)*move/d;left=Math.max(0,left-move);
      if(move>=d){p.x=q.x;p.y=q.y;this.next++;}
    }
    return {done:this.next>=this.points.length,left};
  }
}
function cubic(r,a,b,c,d){
  const n=Math.max(4,Math.ceil((dist(a,b)+dist(b,c)+dist(c,d))/3));
  for(let i=1;i<=n;i++){const t=i/n,u=1-t;r.push({x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y});}
}
function zoneHit(p,z){
  if(z.t===2)return dist(p,z)<=44;
  const dx=p.x-z.x,dy=p.y-z.y,cs=Math.cos(z.a),sn=Math.sin(z.a);
  return Math.hypot(Math.max(0,Math.abs(dx*cs+dy*sn)-39),-dx*sn+dy*cs)<=30;
}
function approach(p,r,z,b){
  r.finish();r.auto=false;r.target=z.t;
  if(z.t===2){r.push(z);r.rollout=point(z);return r;}
  // Replace only the UNFLOWN tail near the runway. Never rewind progress.
  let cut=r.points.length-1;
  while(cut>=r.next&&dist(r.points[cut],z)<84)cut--;
  let anchor,tangent;
  if(cut<r.next){r.points=[point(p)];r.next=1;anchor=point(p);tangent=p.a;}
  else{r.points.length=cut+1;anchor=r.points[cut];tangent=cut>0?angle(r.points[cut-1],anchor):p.a;}
  let plan=null;
  for(const sign of [-1,1]){
    const a=z.a+(sign===-1?Math.PI:0),v={x:Math.cos(a),y:Math.sin(a)};
    let gate={x:z.x-v.x*70,y:z.y-v.y*70};
    if(!inside(gate,b))gate={x:z.x-v.x*48,y:z.y-v.y*48};
    if(!inside(gate,b))continue;
    const cost=dist(anchor,gate)+Math.abs(Math.atan2(Math.sin(a-tangent),Math.cos(a-tangent)))*6;
    if(!plan||cost<plan.cost)plan={a,v,gate,cost};
  }
  if(!plan){ // Very small viewports: still show the entire correction.
    const a=z.a,v={x:Math.cos(a),y:Math.sin(a)};plan={a,v,gate:bounded({x:z.x-v.x*48,y:z.y-v.y*48},b)};
  }
  const {a,v,gate}=plan,len=dist(anchor,gate),handle=Math.min(32,len*.38);
  const c1=bounded({x:anchor.x+Math.cos(tangent)*handle,y:anchor.y+Math.sin(tangent)*handle},b);
  const c2=bounded({x:gate.x-v.x*handle,y:gate.y-v.y*handle},b);
  cubic(r,anchor,c1,c2,gate);
  r.push({x:z.x-v.x*23,y:z.y-v.y*23});
  r.heading=a;r.rollout={x:z.x+v.x*25,y:z.y+v.y*25};return r;
}
function holding(p,b){
  // Tangent circles are preferred. Near an edge, use an in-bounds connector
  // into the circle. Every part of that connector is drawn and flown.
  const rad=Math.max(16,Math.min(p.jumbo?43:34,(b.r-b.l)/5,(b.b-b.t)/5));
  let best=null;
  for(const sign of [-1,1]){
    const raw={x:p.x-Math.sin(p.a)*rad*sign,y:p.y+Math.cos(p.a)*rad*sign};
    const centre={x:clamp(raw.x,b.l+rad+2,b.r-rad-2),y:clamp(raw.y,b.t+rad+2,b.b-rad-2)};
    const cost=dist(raw,centre)*10+dist(centre,{x:(b.l+b.r)/2,y:(b.t+b.b)/2});
    if(!best||cost<best.cost)best={centre,sign,cost};
  }
  const {centre,sign}=best,start=angle(centre,p),entry={x:centre.x+Math.cos(start)*rad,y:centre.y+Math.sin(start)*rad};
  const tangent=start+sign*Math.PI/2,r=new Route(p),len=dist(p,entry),handle=Math.min(24,len*.5);
  if(len>1e-5)cubic(r,p,bounded({x:p.x+Math.cos(p.a)*handle,y:p.y+Math.sin(p.a)*handle},b),bounded({x:entry.x-Math.cos(tangent)*handle,y:entry.y-Math.sin(tangent)*handle},b),entry);
  for(let i=1;i<=80;i++){const a=start+sign*TAU*i/80;r.push({x:centre.x+Math.cos(a)*rad,y:centre.y+Math.sin(a)*rad});}
  r.drawing=false;r.auto=true;r.raw=point(r.points[r.points.length-1]);return r;
}
function radius(p){return p.jumbo?16:12;}
function move(p,dt,b){
  if(p.landing){
    const l=p.landing;l.time+=dt;const f=clamp(l.time/l.duration,0,1);
    p.x=l.from.x+(l.to.x-l.from.x)*f;p.y=l.from.y+(l.to.y-l.from.y)*f;
    if(l.type==='runway')p.a=l.heading;
    if(f>=1)p.remove=true;
    return;
  }
  if(!p.route){
    const future={x:p.x+Math.cos(p.a)*52,y:p.y+Math.sin(p.a)*52};
    if(!inside(future,b))p.route=holding(p,b);
  }
  if(p.route){
    const r=p.route,out=r.advance(p,p.speed*dt);
    if(out.done){
      if(r.target!==null){
        p.landing={type:p.t===2?'vertical':'runway',time:0,duration:p.t===2?1.1:1.25,from:point(p),to:point(r.rollout||p),heading:r.heading};
        p.route=null;
      }else{
        // Catching a live stroke never parks the aircraft in mid-air.
        p.route=holding(p,b);if(out.left>0)p.route.advance(p,out.left);
      }
    }
  }else{p.x+=Math.cos(p.a)*p.speed*dt;p.y+=Math.sin(p.a)*p.speed*dt;}
  const d=Math.atan2(Math.sin(p.a-p.visualA),Math.cos(p.a-p.visualA));p.visualA+=d*(1-Math.exp(-16*dt));
}
function clonePlane(p){
  const q={...p};if(p.route)q.route=Object.assign(Object.create(Route.prototype),p.route);
  if(p.landing)q.landing={...p.landing};return q;
}
function trace(p,b,horizon=3,step=.15){
  const q=clonePlane(p),out=[{x:q.x,y:q.y,air:!q.landing}];
  for(let time=step;time<=horizon+1e-6;time+=step){
    // Match gameplay integration, including autonomous turns and touchdown.
    for(let d=0;d<step-1e-8;d+=1/60)move(q,Math.min(1/60,step-d),b);
    out.push({x:q.x,y:q.y,air:!q.landing&&!q.remove});
  }
  return out;
}
function closest(a,b,c,d){
  const x=a.x-b.x,y=a.y-b.y,dx=(c.x-a.x)-(d.x-b.x),dy=(c.y-a.y)-(d.y-b.y),den=dx*dx+dy*dy;
  const t=den?clamp(-(x*dx+y*dy)/den,0,1):0;
  return {distance:Math.hypot(x+dx*t,y+dy*t),t,x:(a.x+b.x+(c.x-a.x+d.x-b.x)*t)/2,y:(a.y+b.y+(c.y-a.y+d.y-b.y)*t)/2};
}
function conflicts(planes,b){
  const flights=planes.filter(p=>!p.landing),paths=flights.map(p=>trace(p,b)),out=[];
  for(let i=0;i<flights.length;i++)for(let j=i+1;j<flights.length;j++){
    const a=paths[i],d=paths[j],limit=radius(flights[i])+radius(flights[j])+5;
    for(let k=1;k<a.length;k++){
      if(!a[k].air||!d[k].air)break;
      const hit=closest(a[k-1],d[k-1],a[k],d[k]);
      const separating=k===1&&hit.t===0&&dist(a[k],d[k])>=dist(a[0],d[0]);
      if(hit.distance<limit&&!separating){out.push({a:flights[i].id,b:flights[j].id,x:hit.x,y:hit.y,time:(k-1+hit.t)*.15});break;}
    }
  }
  return out;
}
const stages=[['LIGHT TRAFFIC',5.6,.88,4],['GETTING BUSY',4.7,.96,5],['BUSY SKIES',3.8,1.04,7],['RUSH HOUR',3,1.12,9],['HEAVY TRAFFIC',2.2,1.20,11],['PEAK TRAFFIC',1.6,1.28,13]];
function difficulty(score,seconds){
  const progress=clamp(Math.max(score/10,(seconds-20)/45),0,5),i=Math.floor(progress),f=progress-i,a=stages[i],b=stages[Math.min(5,i+1)];
  return {level:i+1,name:a[0],fill:i===5?1:f,interval:a[1]+(b[1]-a[1])*f,speed:a[2]+(b[2]-a[2])*f,limit:a[3]};
}
function serializePlane(p){
  const q={id:p.id,x:p.x,y:p.y,t:p.t,jumbo:!!p.jumbo,a:p.a,visualA:p.visualA,speed:p.speed,landing:p.landing||null,route:null};
  if(p.route){const r=p.route;q.route={points:[point(p),...r.points.slice(r.next)],target:r.target,auto:r.auto,heading:r.heading,rollout:r.rollout};}
  return q;
}
function restorePlane(q){
  if(!q||![q.x,q.y,q.a,q.visualA,q.speed].every(finite)||q.speed<20||q.speed>200||![0,1,2].includes(q.t)||!Number.isSafeInteger(q.id))throw Error('Invalid aircraft');
  const p={...q,warning:false,remove:false};
  if(q.route){
    const data=q.route;
    if(!Array.isArray(data.points)||data.points.length<1||data.points.length>30000||!data.points.every(v=>v&&finite(v.x)&&finite(v.y))||![null,0,1,2].includes(data.target))throw Error('Invalid route');
    if(data.target!==null&&(data.target!==p.t||!data.rollout||!finite(data.rollout.x)||!finite(data.rollout.y)||!finite(data.heading)))throw Error('Invalid approach');
    p.route=new Route(p);p.route.points=data.points.map(point);p.route.drawing=false;p.route.raw=point(p.route.points[p.route.points.length-1]);p.route.target=data.target;p.route.auto=!!data.auto;p.route.rollout=data.rollout;p.route.heading=data.heading||0;
  }
  if(q.landing){const l=q.landing;if(!['runway','vertical'].includes(l.type)||![l.time,l.duration,l.heading,l.from?.x,l.from?.y,l.to?.x,l.to?.y].every(finite)||l.time<0||l.duration<=0||l.time>l.duration)throw Error('Invalid landing');p.landing={...l,from:point(l.from),to:point(l.to)};}
  return p;
}
function resizePlanes(planes,sx,sy){
  for(const p of planes){
    p.x*=sx;p.y*=sy;
    if(p.route){const r=p.route;for(const v of r.points){v.x*=sx;v.y*=sy;}r.raw.x*=sx;r.raw.y*=sy;if(r.rollout){r.rollout.x*=sx;r.rollout.y*=sy;}}
    if(p.landing)for(const v of [p.landing.from,p.landing.to]){v.x*=sx;v.y*=sy;}
  }
}
root.SkyCore={Route,dist,point,clamp,bounds,inside,bounded,zones,zoneHit,approach,holding,radius,move,trace,conflicts,closest,difficulty,serializePlane,restorePlane,resizePlanes};
if(typeof module!=='undefined')module.exports=root.SkyCore;
})(typeof window==='undefined'?globalThis:window);
