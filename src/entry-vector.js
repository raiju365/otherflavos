import { sculptureSpine, sculpturePoint } from './entry-motion.js';

const project = p => {
  const scale=400*.235*4.6/(4.6-p[2]);
  return [200+p[0]*scale,200+p[1]*scale];
};
function edge(q,side,state) {
  const center=project(sculptureSpine(q,state)),epsilon=.0001;
  const before=project(sculptureSpine(q-epsilon,state)),after=project(sculptureSpine(q+epsilon,state));
  const direction=[before[1]-after[1],after[0]-before[0]];
  const a=project(sculpturePoint(q*Math.PI*2,0,0,state)),b=project(sculpturePoint(q*Math.PI*2,Math.PI/2,0,state));
  const dot=p=>(p[0]-center[0])*direction[0]+(p[1]-center[1])*direction[1];
  const angle=Math.atan2(dot(b),dot(a))+(side<0?Math.PI:0);
  return project(sculpturePoint(q*Math.PI*2,angle,0,state));
}
export function entryVectorPath(state) {
  // A filled outline retains the broad folded faces, rather than reducing
  // the fallback to a thin wire. Its closed boundary surrounds an open spine.
  const count=32,points=[];
  for(let i=0;i<=count;i++)points.push(edge(.5-.5*Math.cos(Math.PI*i/count),1,state));
  for(let i=count-1;i>0;i--)points.push(edge(.5-.5*Math.cos(Math.PI*i/count),-1,state));
  const number=n=>n.toFixed(3), pair=p=>p.map(number).join(' ');
  const at=i=>points[(i+points.length)%points.length];
  let path=`M${pair(points[0])}`;
  for(let i=0;i<points.length;i++){
    const a=at(i),b=at(i+1),before=at(i-1),after=at(i+2);
    const c1=a.map((n,j)=>n+(b[j]-before[j])/6),c2=b.map((n,j)=>n-(after[j]-a[j])/6);
    path+=`C${pair(c1)} ${pair(c2)} ${pair(b)}`;
  }
  return `${path}Z`;
}
export function createEntryVector(scene,{size=400}={}) {
  const path=scene.querySelector?.('.entry-vector-shape'),gradient=scene.querySelector?.('.entry-vector-gradient');
  const highlight=scene.querySelector?.('.entry-vector-shine'),sweep=scene.querySelector?.('.entry-vector-sweep');
  const motion=scene.querySelector?.('.entry-vector-motion'),still=scene.querySelector?.('.entry-vector-still');
  const blur=scene.querySelector?.('.entry-vector-blur'),fade=scene.querySelector?.('.entry-vector-fade');
  const stops=[...scene.querySelectorAll?.('.entry-vector-fade-stop')||[]];
  if(!path) return null;
  let dead=false;
  return {
    draw(state){
      if(dead) return;
      const outline=entryVectorPath(state);
      path.setAttribute('d',outline);
      gradient?.setAttribute('gradientTransform',`rotate(${state.light*180/Math.PI} .5 .5)`);
      highlight?.setAttribute('d',outline);
      highlight?.setAttribute('opacity',String(state.glare));
      sweep?.setAttribute('gradientTransform',`translate(${40+320*state.sweep} 200) rotate(-22)`);
      const length=Math.hypot(state.motionX||0,state.motionY||0),angle=length>.01?Math.atan2(state.motionY,state.motionX)*180/Math.PI:0;
      motion?.setAttribute('transform',`rotate(${angle} 200 200)`);
      still?.setAttribute('transform',`rotate(${-angle} 200 200)`);
      blur?.setAttribute('stdDeviation',`${length*.22*400/size} ${length>.01?.45:0}`);
      const a=project(sculptureSpine(0,state)),b=project(sculptureSpine(1,state));
      for(const [name,value] of [['x1',a[0]],['y1',a[1]],['x2',b[0]],['y2',b[1]]])fade?.setAttribute(name,String(value));
      const factors=state.travelSide>0?[0,0,.35,1]:[1,.35,0,0];
      stops.forEach((stop,i)=>stop.setAttribute('stop-opacity',String(1-(state.travelFade||0)*factors[i])));
    },
    destroy(){dead=true;},
  };
}
