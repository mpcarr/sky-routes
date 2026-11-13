/* Sky Routes 0.4 — original, resolution-independent Canvas artwork.
   This module draws only. It never changes an aircraft or its flight path. */
window.SkyArt = (() => {
  'use strict';
  const inks=['#ff6475','#ffd166','#65d9ff'];
  let cached=null,key='',water=[],lastClock=0,clock=0;
  const TAU=Math.PI*2;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  function path(g,pts,fill,stroke,width=1){g.beginPath();g.moveTo(...pts[0]);for(let i=1;i<pts.length;i++)g.lineTo(...pts[i]);g.closePath();if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}}
  function round(g,x,y,w,h,r,fill,stroke){r=Math.min(r,w/2,h/2);g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=1;g.stroke();}}
  function ellipse(g,x,y,rx,ry,fill,angle=0){g.beginPath();g.ellipse(x,y,rx,ry,angle,0,TAU);g.fillStyle=fill;g.fill();}
  function stroke(g,pts,color,width=1,dash=[]){g.beginPath();g.moveTo(...pts[0]);for(let i=1;i<pts.length;i++)g.lineTo(...pts[i]);g.strokeStyle=color;g.lineWidth=width;g.setLineDash(dash);g.stroke();g.setLineDash([]);}
  function islandPath(points,w,h){const p=new Path2D(),n=points.length;const at=i=>({x:points[(i+n)%n][0]*w,y:points[(i+n)%n][1]*h});let a=at(n-1),b=at(0);p.moveTo((a.x+b.x)/2,(a.y+b.y)/2);for(let i=0;i<n;i++){a=at(i);b=at(i+1);p.quadraticCurveTo(a.x,a.y,(a.x+b.x)/2,(a.y+b.y)/2);}p.closePath();return p;}
  function tree(g,x,y,s,type){g.save();g.translate(x,y);g.scale(s,s);ellipse(g,4,5,10,6,'#254e3d28',.4);if(type){stroke(g,[[0,4],[2,-1]],'#60714d',2.5);for(let i=0;i<6;i++){g.save();g.rotate(i*TAU/6+.2);path(g,[[0,0],[4,-5],[1,-12],[-2,-5]],i%2?'#408765':'#529873');g.restore();}}else{ellipse(g,0,1,9,8,'#397957');ellipse(g,-3,-3,7,6,'#509466');ellipse(g,2,-5,5,4,'#69a375');}g.restore();}
  function building(g,x,y,w,h){round(g,x+4,y+6,w,h,3,'#264a3d40');round(g,x,y,w,h,3,'#d7e3d3','#617d70');round(g,x+2,y+2,w-4,h-6,2,'#edf0d8');g.fillStyle='#9aafa4';g.fillRect(x+2,y+h-7,w-4,5);for(let i=5;i<w-5;i+=9){g.fillStyle='#567b87';g.fillRect(x+i,y+h-6,5,3);}stroke(g,[[x+4,y+5],[x+w-4,y+5]],'#fff9',1);}
  function boat(g,x,y,s,a){g.save();g.translate(x,y);g.rotate(a);g.scale(s,s);stroke(g,[[-3,16],[-6,25]],'#c8f4ec25',2);stroke(g,[[3,16],[6,25]],'#c8f4ec25',2);path(g,[[0,-13],[5,-3],[4,13],[-4,13],[-5,-3]],'#e6eee4');round(g,-3,-1,6,8,1,'#345e72');path(g,[[0,-10],[0,5],[10,5]],'#f6e5bd');g.restore();}
  function makeMap(w,h,dpr,zones){
    const off=document.createElement('canvas');off.width=Math.ceil(w*dpr);off.height=Math.ceil(h*dpr);const g=off.getContext('2d');g.scale(dpr,dpr);
    let seed=rng(9043),ocean=g.createLinearGradient(0,0,w,h);ocean.addColorStop(0,'#174c68');ocean.addColorStop(.55,'#218b94');ocean.addColorStop(1,'#125773');g.fillStyle=ocean;g.fillRect(0,0,w,h);
    water=[];for(let i=0;i<90;i++){const x=seed()*w,y=seed()*h,len=5+seed()*14;stroke(g,[[x,y],[x+len,y-1]],'#b2e5dc10',1);water.push({x,y,len,phase:seed()*TAU});}
    const main=islandPath([[.09,.47],[.24,.42],[.41,.43],[.52,.39],[.65,.44],[.73,.48],[.89,.48],[.96,.60],[.97,.76],[.92,.88],[.79,.91],[.63,.88],[.51,.92],[.36,.89],[.20,.91],[.06,.86],[.025,.74],[.04,.59]],w,h);
    const north=islandPath([[.59,.20],[.65,.15],[.80,.15],[.92,.20],[.94,.29],[.87,.37],[.70,.37],[.58,.31]],w,h);
    for(const shape of [main,north]){
      g.lineJoin='round';g.strokeStyle='#50b6ad35';g.lineWidth=40;g.stroke(shape);g.strokeStyle='#75c8b799';g.lineWidth=23;g.stroke(shape);
      g.save();g.translate(2,5);g.strokeStyle='#27675c44';g.lineWidth=14;g.stroke(shape);g.restore();
      g.strokeStyle='#f2dfac';g.lineWidth=13;g.stroke(shape);g.fillStyle='#8bae76';g.fill(shape);g.strokeStyle='#eef2cb65';g.lineWidth=1.5;g.stroke(shape);
      g.save();g.clip(shape);
      for(let i=0;i<30;i++){ellipse(g,seed()*w,seed()*h,20+seed()*60,12+seed()*35,i%2?'#6c9a6b19':'#d2d99a16',seed()*3);}
      for(let i=0;i<230;i++){const x=seed()*w,y=seed()*h;stroke(g,[[x,y],[x+2,y-2]],'#416f521a',1);}
      g.restore();
    }
    // Quiet service road, apron and taxiways remain beneath the flight routes.
    const road=[[w*.49,h*.86],[w*.48,h*.65],[w*.58,h*.54],[w*.80,h*.56]];
    stroke(g,road,'#698b70',15);stroke(g,road,'#cad0ad',10);stroke(g,road,'#f2ecd181',1,[3,8]);
    const tx=w*.5,ty=h*.65,aw=clamp(w*.23,72,170),ah=clamp(h*.08,38,65);
    round(g,tx-aw/2,ty-ah/2,aw,ah,8,'#b2bf9e','#849d80');
    for(const z of zones.slice(0,2)){const side={x:z.x+Math.sin(z.a)*21,y:z.y-Math.cos(z.a)*21};stroke(g,[[side.x,side.y],[side.x,ty],[tx,ty]],'#8ca188',12);stroke(g,[[side.x,side.y],[side.x,ty],[tx,ty]],'#e1ce86',1);}
    for(let i=-1;i<=1;i++){const x=tx+i*aw*.23;stroke(g,[[x-7,ty+ah*.28],[x+7,ty+ah*.28],[x+7,ty+3]],'#ecdfad',1);}
    building(g,tx-aw*.40,ty-ah*.5-21,aw*.78,20);
    building(g,tx-aw*.33,ty-ah*.5-30,aw*.36,10);
    // Control tower, with a glass cabin and a small antenna.
    g.save();g.translate(tx+aw*.35,ty-ah*.5-14);round(g,0,0,12,20,2,'#355f4e39');round(g,-4,-5,10,18,2,'#c2d1b9');round(g,-7,-10,16,12,3,'#e9e8cd','#728c7d');round(g,-5,-8,12,7,2,'#427785');stroke(g,[[1,-10],[1,-18]],'#d4e4d8',1.5);ellipse(g,1,-19,2,2,'#eb6d67');g.restore();
    // A short jetty on the helicopter island.
    const px=w*.87,py=h*.34;stroke(g,[[px,py],[px,py+27]],'#294e4544',9);stroke(g,[[px-3,py],[px-3,py+27]],'#bda785',8);for(let i=0;i<27;i+=5)stroke(g,[[px-7,py+i],[px+1,py+i]],'#e4cda480',1);
    for(let i=0;i<250;i++){
      const x=seed()*w,y=seed()*h;
      if(!g.isPointInPath(main,x*dpr,y*dpr)&&!g.isPointInPath(north,x*dpr,y*dpr))continue;
      if(zones.some(z=>Math.hypot(z.x-x,z.y-y)<(z.t===2?50:75)))continue;
      if(Math.abs(x-tx)<aw*.8&&Math.abs(y-ty)<ah+50)continue;
      if(y>h*.58&&y<h*.82)continue;
      tree(g,x,y,.55+seed()*.4,seed()>.48);
    }
    boat(g,w*.19,h*.29,.8,-.5);boat(g,w*.94,h*.40,.6,.5);
    // Windsock and subtle map typography.
    const wx=w*.30,wy=h*.56;stroke(g,[[wx+2,wy+3],[wx+8,wy+8]],'#284d4330',3);stroke(g,[[wx,wy],[wx,wy-17]],'#e9eedc',2);path(g,[[wx,wy-17],[wx+20,wy-13],[wx+17,wy-9],[wx,wy-11]],'#e6ac72');stroke(g,[[wx+7,wy-15],[wx+6,wy-11]],'#fff1c9',3);
    g.font='700 10px system-ui';g.textAlign='center';g.fillStyle='#355e5390';g.fillText('CORAL COVE',tx,h*.86);
    g.save();g.translate(w*.11,h*.19);g.strokeStyle='#d9efe84a';g.lineWidth=1;g.beginPath();g.arc(0,0,16,0,TAU);g.stroke();stroke(g,[[0,-10],[0,10]],'#d9efe872');stroke(g,[[-10,0],[10,0]],'#d9efe872');path(g,[[0,-12],[3,0],[0,-2],[-3,0]],'#e2f2dc9c');g.fillStyle='#e2f2dca0';g.font='600 8px system-ui';g.fillText('N',0,-22);g.restore();
    return off;
  }
  function runway(g,z,ready,hover,selected){
    const ink=inks[z.t];g.save();g.translate(z.x,z.y);g.lineCap='round';
    if(ready||hover||selected){const pulse=.5+.5*Math.sin(clock*3);g.strokeStyle=ink;g.globalAlpha=hover?.75:.15+pulse*.12;g.lineWidth=hover?3:1.5;g.setLineDash(hover?[]:[3,6]);g.beginPath();if(z.t===2)g.arc(0,0,39+pulse*2,0,TAU);else g.ellipse(0,0,60,39,z.a,0,TAU);g.stroke();g.globalAlpha=1;g.setLineDash([]);}
    if(z.t===2){
      ellipse(g,3,4,34,34,'#3c675943');ellipse(g,0,0,34,34,'#c5cfad');ellipse(g,0,0,29,29,'#365b66');g.strokeStyle=ink;g.lineWidth=3;g.beginPath();g.arc(0,0,25,0,TAU);g.stroke();g.strokeStyle='#e7f4e8';g.lineWidth=4;g.beginPath();g.moveTo(-7,-10);g.lineTo(-7,10);g.moveTo(7,-10);g.lineTo(7,10);g.moveTo(-7,0);g.lineTo(7,0);g.stroke();for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;ellipse(g,31*Math.cos(a),31*Math.sin(a),2,2,ready?'#eeffff':'#b1e6db');}
    }else{
      g.rotate(z.a);round(g,-46,-19,92,38,5,'#5d786329');round(g,-44,-18,88,36,4,'#c5c7a3');round(g,-40,-14,80,28,2,'#344951');
      g.fillStyle=ink;g.fillRect(-39,-14,78,3);g.fillRect(-39,11,78,3);
      stroke(g,[[-21,0],[21,0]],'#eff3d9',1.4,[6,5]);
      for(const x of [-34,30])for(let y=-8;y<=8;y+=4){g.fillStyle='#e5ebd6';g.fillRect(x,y,4,2);}
      g.fillStyle='#fff4ce';g.font='700 6px system-ui';g.textAlign='center';g.textBaseline='middle';g.fillText(z.t===0?'09':'18',-24,0);g.fillText(z.t===0?'27':'36',24,0);
      for(const x of [-36,-18,0,18,36]){ellipse(g,x,-17,1.4,1.4,ready?'#fff9cb':'#e0ddbb');ellipse(g,x,17,1.4,1.4,ready?'#fff9cb':'#e0ddbb');}
    }
    g.restore();
    g.save();g.font='800 9px system-ui';g.textAlign='center';g.textBaseline='middle';const label=['JET 09','PROP 18','HELIPAD'][z.t],lw=z.t===2?61:55,ly=z.y+(z.t===2?47:49);round(g,z.x-lw/2,ly-8,lw,16,5,'#163846d9');g.fillStyle=ink;g.fillText(label,z.x,ly);g.restore();
  }
  const jetWing=[[-4,-6],[-20,5],[-21,10],[-5,5],[0,7],[5,5],[21,10],[20,5],[4,-6]];
  const tail=[[-3,12],[-11,18],[-11,21],[0,18],[11,21],[11,18],[3,12]];
  function aircraft(g,p,shadow=false,preview=false){
    const a=p.visualA+Math.PI/2,s=p.landing?Math.max(0,1-p.landing/.45):1;
    g.save();g.translate(p.x+(shadow?5*s:0),p.y+(shadow?8*s:0));g.rotate(a);g.scale(s,s);g.lineJoin='round';g.lineCap='round';if(p.landing)g.globalAlpha=s;
    if(shadow){g.globalAlpha*=.22;const c='#123343';if(p.t===2){ellipse(g,0,0,8,13,c);stroke(g,[[0,7],[0,25]],c,4);stroke(g,[[-20,0],[20,0]],c,3);}else{path(g,p.t===0?jetWing:[[-18,-4],[18,-4],[19,5],[-19,5]],c);path(g,tail,c);ellipse(g,0,0,5,22,c);}g.restore();return;}
    const ink=inks[p.t],edge='#203e50';
    if(p.t===0){
      path(g,tail,ink,edge,1.4);path(g,jetWing,ink,edge,1.4);stroke(g,[[-18,6],[-6,0]],'#ffd5c7',1.5);stroke(g,[[18,6],[6,0]],'#ffd5c7',1.5);
      round(g,-12,0,5,10,2,'#edf4e8',edge);round(g,7,0,5,10,2,'#edf4e8',edge);
      let grad=g.createLinearGradient(-5,0,5,0);grad.addColorStop(0,'#c9405d');grad.addColorStop(.4,'#ffb0a0');grad.addColorStop(1,ink);
      g.beginPath();g.moveTo(0,-24);g.bezierCurveTo(7,-22,6,8,3,20);g.lineTo(-3,20);g.bezierCurveTo(-6,8,-7,-22,0,-24);g.fillStyle=grad;g.fill();g.strokeStyle=edge;g.lineWidth=1.5;g.stroke();
      path(g,[[-3,-14],[0,-17],[3,-14],[3,-10],[-3,-10]],'#1c526d','#b9e8e6',.7);stroke(g,[[0,11],[0,19]],'#fff2d9',2);
      for(let y=-5;y<9;y+=4){g.fillStyle='#652f51';g.fillRect(-4,y,1.5,1.5);g.fillRect(2.5,y,1.5,1.5);}
    }else if(p.t===1){
      path(g,[[-3,11],[-10,15],[-10,18],[10,18],[10,15],[3,11]],'#f5ba4d',edge,1.4);
      path(g,[[-5,-5],[-18,-3],[-19,5],[-5,3],[5,3],[19,5],[18,-3],[5,-5]],'#ffd36f',edge,1.4);stroke(g,[[-16,-1],[-6,-2]],'#fff3be',2);stroke(g,[[16,-1],[6,-2]],'#fff3be',2);
      ellipse(g,0,0,5,18,'#ffd477');g.strokeStyle=edge;g.lineWidth=1.3;g.stroke();round(g,-3,-9,6,8,2,'#2b6172');stroke(g,[[-2,-8],[1,-8]],'#acdfe0',1);stroke(g,[[0,10],[0,17]],'#fff7d3',2);
      g.save();g.translate(0,-19);g.rotate(preview?.3:Math.sin(clock*35)*.28);stroke(g,[[-11,0],[11,0]],'#e9f4edaa',2);ellipse(g,0,0,2,2,'#243e4b');g.restore();
    }else{
      stroke(g,[[-9,-6],[-9,13]],'#193d50',2.2);stroke(g,[[9,-6],[9,13]],'#193d50',2.2);stroke(g,[[-9,5],[9,5]],'#d2e9dc',1.3);
      path(g,[[-3,7],[-2,24],[-7,26],[-7,28],[7,28],[7,26],[2,24],[3,7]],ink,edge,1.4);
      ellipse(g,0,0,8,13,'#68dcf4');g.strokeStyle=edge;g.lineWidth=1.4;g.stroke();path(g,[[-6,-4],[-4,-10],[0,-12],[4,-10],[6,-4]],'#255970','#d1f4f3',.8);stroke(g,[[0,-11],[0,-5]],'#98d9e4',.8);ellipse(g,0,5,3,4,'#35a5c4');
      g.save();g.rotate(preview?.4:clock*22);ellipse(g,0,0,22,22,'#d9f5eb0b');stroke(g,[[-22,0],[22,0]],'#e6fff3a6',2.4);stroke(g,[[0,-20],[0,20]],'#e6fff371',2);ellipse(g,0,0,2.5,2.5,'#244c61');g.restore();
    }
    // Small navigation lights add detail without reducing colour readability.
    if(p.t<2){ellipse(g,-18,5,1.2,1.2,'#ffeedf');ellipse(g,18,5,1.2,1.2,'#b5f9db');}
    g.restore();
  }
  function routes(g,planes,drag,zones,hovered){
    for(const p of planes){
      const r=p.route;if(!r)continue;
      g.save();g.lineCap='round';g.lineJoin='round';g.beginPath();g.moveTo(p.x,p.y);for(let i=r.next;i<r.points.length;i++)g.lineTo(r.points[i].x,r.points[i].y);
      g.strokeStyle='#102d4165';g.lineWidth=5;g.stroke();g.strokeStyle=inks[p.t];g.lineWidth=2.5;g.setLineDash(r.target!==null?[]:[5,5]);g.lineDashOffset=-clock*10;g.stroke();g.setLineDash([]);
      const tip=r.points[r.points.length-1];ellipse(g,tip.x,tip.y,3.5,3.5,inks[p.t]);
      if(drag&&drag.active&&drag.plane===p&&hovered!==null){const z=zones[p.t];stroke(g,[[tip.x,tip.y],[z.x,z.y]],inks[p.t],2,[3,4]);}
      g.restore();
    }
  }
  function render(g,w,h,zones,planes,drag,hovered,state){
    const now=performance.now()/1000;if(state==='play'||state==='menu')clock+=Math.min(.05,Math.max(0,now-lastClock));lastClock=now;
    const dpr=Math.min(devicePixelRatio||1,2),k=[w,h,dpr].join(':');
    if(!cached||k!==key){key=k;cached=makeMap(w,h,dpr,zones);}
    g.save();g.drawImage(cached,0,0,w,h);
    // Water glints only in the open-water approach area.
    for(let i=0;i<water.length;i+=4){const q=water[i];if(q.y>h*.39||q.x>w*.52)continue;g.globalAlpha=.08+.05*Math.sin(clock*1.2+q.phase);stroke(g,[[q.x,q.y],[q.x+q.len,q.y-1]],'#dbfff3',1);}
    g.globalAlpha=1;
    for(const z of zones)runway(g,z,planes.some(p=>p.route&&p.route.target===z.t),hovered===z.t,!!(drag&&drag.plane.t===z.t));
    routes(g,planes,drag,zones,hovered);
    for(const p of planes)aircraft(g,p,true);
    for(const p of planes){
      if(p.warning||(drag&&drag.plane===p)){g.strokeStyle=p.warning?'#ff6b79':'#f1ffe9';g.lineWidth=2;g.setLineDash(p.warning?[3,4]:[]);g.beginPath();g.arc(p.x,p.y,29,0,TAU);g.stroke();g.setLineDash([]);}
      aircraft(g,p);
    }
    g.restore();
  }
  function previews(){for(let t=0;t<3;t++){const c=document.getElementById('preview-'+t);if(!c)continue;const g=c.getContext('2d');g.scale(2,2);aircraft(g,{x:34,y:30,t,visualA:-Math.PI/2,landing:0},true,true);aircraft(g,{x:34,y:30,t,visualA:-Math.PI/2,landing:0},false,true);}}
  return {render,previews};
})();
