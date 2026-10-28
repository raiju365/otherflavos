export const wrapProject=(value,count)=>count>0?((value%count)+count)%count:0;
export const LOOP_PERSPECTIVE=1800;
export const LOOP_LENS_MAG=1.18;
export const LOOP_LENS_FOCAL_HEIGHT=.56;
export const LOOP_LENS_FOCAL_WIDTH=.315;
export function loopLens(x,y,width,height) {
  const focal=Math.max(height*LOOP_LENS_FOCAL_HEIGHT,width*LOOP_LENS_FOCAL_WIDTH),r=Math.hypot(x,y)/focal;
  const factor=(r>1e-8?Math.atan(r)/r:1)*LOOP_LENS_MAG;
  return {x:x*factor,y:y*factor};
}
export const LOOP_RIM_FADE=.18;
export const LOOP_ARRIVAL_MS=900;
export const LOOP_GLASS_WIDTH=.07;
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
export const loopRimOpacity=facing=>smooth(facing/LOOP_RIM_FADE);
export function loopEdgeOptics(reveal,distance,drive=0,quiet=false) {
  const p=Math.max(0,Math.min(1,reveal)),signed=Math.max(-1,Math.min(1,drive)),e=Math.abs(signed);
  const strength=quiet?0:(1-smooth((Math.abs(distance)-.012)/(LOOP_GLASS_WIDTH-.012)))*(.6+.4*4*p*(1-p));
  return {strength,scan:strength*e*.065,tear:strength*e*.0025,drag:strength*signed*.022};
}
export function loopPassage(angle,sway=0,quiet=false) {
  // A reversible passage, measured along the common cylinder, not by a timer.
  return {
    reveal:quiet?1:1-smooth((Math.abs(angle)-.28)/1.12),
    edgeSide:angle<0?-1:1,
    edgeEnergy:quiet?0:Math.min(1,Math.abs(sway)),
    edgeDrive:quiet?0:Math.max(-1,Math.min(1,sway)),opticsEnabled:quiet?0:1
  };
}
export function loopArrival(relative,progress,height) {
  const p=Math.max(0,Math.min(1,progress)),remaining=(1-p)**3;
  // One cylinder settles together; only visibility staggers from the lead card.
  const delay=Math.min(2,Math.abs(relative))*.075+(relative<0?.025:0);
  return {shift:.30*remaining,rise:Math.min(height*.055,28)*remaining,opacity:smooth((p-delay)/(.64-delay))};
}
export function loopSlot(slot,position,count,pool=5) {
  const logical=slot+Math.round((position-slot)/pool)*pool;
  return {logical,project:wrapProject(logical,count),relative:logical-position};
}
export const LOOP_ANGULAR_STEP=1.08;
export function loopPose(relative,width,height,sway=0,quiet=false) {
  const compact=width<560;
  const cardWidth=Math.min(width*(compact ? .80 : .70),height*1.6*.76,1040);
  // Every sheet is a disjoint arc of this same cylinder, including during sway.
  const axisRadius=cardWidth/.9,bend=cardWidth/axisRadius;
  const angle=relative*LOOP_ANGULAR_STEP+Math.max(-1.2,Math.min(1.2,sway))*.035;
  // The local mesh uses a centered depth; offset its origin onto the shared axis.
  const center=axisRadius*.5*(1+Math.cos(bend*.5));
  const horizon=Math.acos(axisRadius/(LOOP_PERSPECTIVE+axisRadius));
  return {
    width:cardWidth,height:cardWidth/1.6,step:center*LOOP_ANGULAR_STEP,
    x:center*Math.sin(angle),y:-Math.sin(angle)*Math.min(height*.04,32),
    z:center*Math.cos(angle)-axisRadius,
    turn:angle*180/Math.PI,roll:0,scale:1,
    opacity:Math.abs(angle)-bend*.5<horizon?1:0,
    bend,axisRadius,angle,...loopPassage(angle,sway,quiet)
  };
}
// Mobile reel: the same cylindrical camera, rotating about the horizontal
// axis so the actual cards travel vertically rather than sideways.
export function reelPose(relative,width,height,sway=0,quiet=false) {
  const cardWidth=Math.min(width*.82,height*1.6*.70,680),cardHeight=cardWidth/1.6;
  const axisRadius=cardHeight/.9,bend=.9;
  const angle=relative*LOOP_ANGULAR_STEP+Math.max(-1.2,Math.min(1.2,sway))*.035;
  const center=axisRadius*.5*(1+Math.cos(bend*.5));
  const horizon=Math.acos(axisRadius/(LOOP_PERSPECTIVE+axisRadius));
  return {
    width:cardWidth,height:cardHeight,step:center*LOOP_ANGULAR_STEP,
    x:0,y:center*Math.sin(angle),z:center*Math.cos(angle)-axisRadius,
    turn:angle*180/Math.PI,roll:0,scale:1,vertical:1,
    opacity:Math.abs(angle)-bend*.5<horizon?1:0,
    bend,axisRadius,angle,reveal:1,edgeSide:angle<0?-1:1,
    edgeEnergy:quiet?0:Math.min(1,Math.abs(sway)),edgeDrive:0,opticsEnabled:0
  };
}
// Analytical damped spring: one finite tail, carried through immediate reversals.
export function advanceLoopSway(sway,velocity,speed,seconds) {
  const drive=Math.tanh(speed*.16),omega=16,damping=.62,alpha=omega*damping,frequency=omega*Math.sqrt(1-damping*damping);
  const dt=Math.max(0,Math.min(.04,seconds)),delta=sway-drive,b=(velocity+alpha*delta)/frequency;
  const c=Math.cos(frequency*dt),s=Math.sin(frequency*dt),decay=Math.exp(-alpha*dt);
  return {sway:drive+decay*(delta*c+b*s),velocity:decay*((-alpha*delta+frequency*b)*c+(-alpha*b-frequency*delta)*s)};
}
export function createLoopMesh(segments=64,rows=32) {
  const uv=new Float32Array((segments+1)*(rows+1)*2),indices=new Uint16Array(segments*rows*6);
  for(let row=0;row<=rows;row++)for(let i=0;i<=segments;i++)uv.set([i/segments,row/rows],(row*(segments+1)+i)*2);
  for(let row=0;row<rows;row++)for(let i=0;i<segments;i++){
    const a=row*(segments+1)+i,b=a+segments+1;indices.set([a,b,a+1,a+1,b,b+1],(row*segments+i)*6);
  }
  return {uv,indices};
}
// Same continuous surface and camera as the GPU, for bounds/continuity checks.
export function projectLoopPoint(pose,u,v,viewportWidth,viewportHeight) {
  const vertical=pose.vertical===1,bend=pose.bend,radius=(vertical?pose.height:pose.width)/bend,angle=((vertical?v:u)-.5)*bend;
  let x=vertical?(u-.5)*pose.width:radius*Math.sin(angle),y=vertical?radius*Math.sin(angle):(v-.5)*pose.height,z=radius*(Math.cos(angle)-.5*(1+Math.cos(bend*.5)));
  // One cylindrical arc, extruded vertically: no cloth wave or twisting rows.
  x*=pose.scale;y*=pose.scale;z*=pose.scale;
  const roll=pose.roll*Math.PI/180,turn=pose.turn*Math.PI/180;
  const rx=x*Math.cos(roll)-y*Math.sin(roll);y=x*Math.sin(roll)+y*Math.cos(roll);x=rx;
  if(vertical){const ty=y*Math.cos(turn)+z*Math.sin(turn);z=-y*Math.sin(turn)+z*Math.cos(turn);y=ty;}
  else {const tx=x*Math.cos(turn)+z*Math.sin(turn);z=-x*Math.sin(turn)+z*Math.cos(turn);x=tx;}
  x+=pose.x;y+=pose.y;z+=pose.z;const perspective=LOOP_PERSPECTIVE/(LOOP_PERSPECTIVE-z);
  const normalAngle=angle+turn;
  const frontFacing=(Math.sin(normalAngle)*(-(vertical?y:x))+Math.cos(normalAngle)*(LOOP_PERSPECTIVE-z))/LOOP_PERSPECTIVE;
  const lens=loopLens(x*perspective,y*perspective,viewportWidth,viewportHeight);
  return {x:viewportWidth/2+lens.x,y:viewportHeight/2+lens.y,z,worldX:x,worldY:y,frontFacing};
}
// Inverse of the same lens and a front ray/cylinder intersection; no DOM box guess.
export function hitLoopCard(pose,screenX,screenY,width,height) {
  if(pose.opacity<=.1||pose.reveal<=.03)return false;
  const sx=screenX-width/2,sy=screenY-height/2,r=Math.hypot(sx,sy);
  const focal=Math.max(height*LOOP_LENS_FOCAL_HEIGHT,width*LOOP_LENS_FOCAL_WIDTH),theta=r/(focal*LOOP_LENS_MAG);
  if(theta>=Math.PI/2)return false;
  const factor=r>1e-8?focal*Math.tan(theta)/r:1/LOOP_LENS_MAG;
  const dx=sx*factor/LOOP_PERSPECTIVE,dy=sy*factor/LOOP_PERSPECTIVE;
  const b=LOOP_PERSPECTIVE+pose.axisRadius,c=LOOP_PERSPECTIVE*(LOOP_PERSPECTIVE+2*pose.axisRadius);
  const vertical=pose.vertical===1,axis=vertical?dy:dx;
  const discriminant=b*b-(1+axis*axis)*c;
  if(discriminant<=0)return false;
  const t=c/(b+Math.sqrt(discriminant));
  const angle=Math.atan2(axis*t,b-t);
  const u=vertical?.5+(dx*t-pose.x)/pose.width:.5+(angle-pose.angle)/pose.bend;
  const v=vertical?.5+(angle-pose.angle)/pose.bend:.5+(dy*t-pose.y)/pose.height;
  if(u<0||u>1||v<0||v>1)return false;
  const radius=Math.min(14,Math.min(pose.width,pose.height)*.08);
  const qx=Math.abs((u-.5)*pose.width)-(pose.width*.5-radius),qy=Math.abs((v-.5)*pose.height)-(pose.height*.5-radius);
  if(Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)>radius)return false;
  const envelope=4*pose.reveal*(1-pose.reveal),across=pose.edgeSide>0?u:1-u;
  const frontier=-.07+1.14*pose.reveal-((Math.abs(v*2-1)**2)-.35)*.08*envelope;
  return across<frontier+(.016+.012*pose.edgeEnergy)*.6;
}
export function wheelProjects(event,height=600) {
  const raw=Math.abs(event.deltaX||0)>Math.abs(event.deltaY||0)?event.deltaX:event.deltaY;
  const factor=event.deltaMode===1?16:event.deltaMode===2?height:1;
  return Math.max(-1.5,Math.min(1.5,(raw||0)*factor/460));
}
