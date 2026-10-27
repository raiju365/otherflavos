import { foldedSpine } from './entry-form.js';

const TAU = Math.PI*2;
export const clamp = value => Math.max(0, Math.min(1, value));
export const ENTRY_TIMING = {
  desktop: { arrive: 620, form: 1600, shine: 4000, confirmation: 160, straighten: 1100, release: 440 },
  compact: { arrive: 520, form: 1350, shine: 3350, confirmation: 120, straighten: 900, release: 380 },
};
const flightControls={arrive:[.18,.82,.28,1],release:[.58,0,.86,.4]};
export const ENTRY_FLIGHT_EASE=Object.fromEntries(Object.entries(flightControls)
  .map(([phase,controls])=>[phase,`cubic-bezier(${controls.join(',')})`]));
// Arrival brakes into the center; departure accelerates beyond the frame.
// The shutter samples those same CSS curves, keeping blur tied to real speed.
export function entryFlightSample(progress,phase='arrive') {
  const [x1,y1,x2,y2]=flightControls[phase]||flightControls.arrive;
  const p=clamp(progress);let s=p;
  for(let i=0;i<6;i++){
    const r=1-s,x=3*x1*r*r*s+3*x2*r*s*s+s*s*s;
    const dx=3*x1*r*r+6*(x2-x1)*r*s+3*(1-x2)*s*s;
    s=clamp(s-(x-p)/dx);
  }
  const r=1-s,dx=3*x1*r*r+6*(x2-x1)*r*s+3*(1-x2)*s*s;
  const dy=3*y1*r*r+6*(y2-y1)*r*s+3*(1-y2)*s*s;
  return {position:3*y1*r*r*s+3*y2*r*s*s+s*s*s,velocity:dy/dx};
}
export function entryTravelState(phase,progress,vector,duration,compact=false) {
  const empty={motionX:0,motionY:0,travelFade:0,travelSide:0};
  if(!vector||(phase!=='arrive'&&phase!=='release')||progress<=0||progress>=1)return empty;
  const distance=Math.hypot(vector.x,vector.y);if(!distance)return empty;
  const speed=distance*entryFlightSample(progress,phase).velocity/(Math.max(1,duration)/1000);
  const limit=compact?42:64,length=Math.min(limit,speed*.014),t=clamp((length/limit-.04)/.56);
  return {motionX:vector.x/distance*length,motionY:vector.y/distance*length,
    travelFade:t*t*(3-2*t),travelSide:phase==='arrive'?1:-1};
}
export function entryFlightOffsets(width, height, size, centerY = height*.47) {
  const edge = size/2 + 32;
  return { incoming: { x: width/2 + edge, y: height - centerY + edge },
    outgoing: { x: -width/2 - edge, y: -centerY - edge } };
}
function tempo(p, breath) {
  // Integral of (1-cos(2PI p))*(1-breath*cos(4PI p)): positive,
  // smoothly breathing velocity, with no stop/start at interior score knots.
  return clamp(p + (breath*.5 - 1)*Math.sin(TAU*p)/TAU
    - breath*Math.sin(2*TAU*p)/(2*TAU)
    + breath*.5*Math.sin(3*TAU*p)/(3*TAU));
}
function pose(phase, progress) {
  const p = clamp(progress), idle = phase === 'idle', release = phase === 'release';
  // Different phrases, rather than restarting the same ease on every phase:
  // form opens early and settles; uncurl holds briefly, then gathers speed.
  // Both polynomial curves have zero first/second derivatives at handoffs.
  const t=idle?1:phase==='arrive'||release?entryFlightSample(p,phase).position
    :phase==='form'?p**3*(20+p*(-45+p*(36-10*p)))
    :phase==='straighten'?p**4*(15+p*(-24+10*p))
    :tempo(p,.72);
  const state={t,formation:1,flatten:0,reveal:1,pitch:.16,yaw:-.22,roll:-.13,light:.72,sweep:1,glare:0,
    motionX:0,motionY:0,travelFade:0,travelSide:0};
  // Travel never owns the morph: an incoming/outgoing object stays completely
  // unbent even while its position crosses a viewport edge.
  if(phase==='arrive')return {...state,formation:0,pitch:.1+.06*t,yaw:-.3+.08*t,roll:-.19+.06*t,light:-.56+.12*t,sweep:0};
  if(phase==='form')return {...state,formation:t,light:-.44,sweep:0};
  if(phase==='straighten')return {...state,formation:1-t};
  if(release)return {...state,formation:0,pitch:.16-.05*t,yaw:-.22+.1*t,roll:-.13-.04*t,light:.72+.12*t};
  if(idle)return state;
  // At full curvature the whole form makes one slow, visible three-dimensional
  // rocking gesture under the moving studio light; its intrinsic shape holds.
  // The camera glare has a smooth attack/release and is zero at both handoffs.
  const breath=p===0||p===1?0:Math.sin(Math.PI*t)**2;
  const sway=Math.sin(TAU*t)*breath;
  return {...state,pitch:.16+.11*breath+.06*sway,yaw:-.22+.34*breath+.09*sway,roll:-.13+.1*sway,
    light:-.44+1.16*t,sweep:t,glare:breath*breath};
}
export function sculptureState(phase, progress, duration = ENTRY_TIMING.desktop[phase] || ENTRY_TIMING.desktop.shine) {
  const p = clamp(progress), state = pose(phase, p);
  if (phase === 'idle' || p === 0 || p === 1) return { ...state, phase, progress: p, wind: 0, windAngle: 0 };
  const a = pose(phase, p - .002), b = pose(phase, p + .002);
  const seconds = Math.max(1,duration)/1000;
  const yawSpeed = (b.yaw - a.yaw)/(.004*seconds), pitchSpeed = (b.pitch - a.pitch)/(.004*seconds);
  const travelling=phase==='arrive'||phase==='release',travelSpeed=travelling?Math.max(0,(b.t-a.t)/(.004*seconds)):0;
  return { ...state, phase, progress: p, wind:travelling?clamp(Math.hypot(yawSpeed,pitchSpeed)*.2+travelSpeed*.55):0, windAngle:-Math.PI*.75 };
}
export function createSculptureMesh(compact = false) {
  const longitudinal = compact ? 160 : 240, radial = compact ? 24 : 32, strands = 1;
  const parameters = [], indices = [];
  for (let strand = 0; strand < strands; strand++) {
    const offset = parameters.length/3;
    for (let u = 0; u <= longitudinal; u++) for (let v = 0; v <= radial; v++) {
      const q=.5-.5*Math.cos(Math.PI*u/longitudinal);
      parameters.push(q*TAU, v/radial*TAU, strand);
    }
    for (let u = 0; u < longitudinal; u++) for (let v = 0; v < radial; v++) {
      const a = offset + u*(radial + 1) + v, b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { parameters: new Float32Array(parameters), indices: new Uint16Array(indices), longitudinal, radial, strands };
}
const normalize = a => { const length = Math.hypot(...a) || 1; return a.map(n => n/length); };
const dot = (a,b) => a.reduce((sum,n,i)=>sum+n*b[i],0);
const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
function centerline(q,formation) {
  const curve=foldedSpine(q),line=[(q-.5)*2.7,(q-.5)*1.8,0],straight=[2.7,1.8,0];
  const center=curve.center.map((n,i)=>line[i]+(n-line[i])*formation);
  const derivative=curve.derivative.map((n,i)=>straight[i]+(n-straight[i])*formation);
  const acceleration=curve.acceleration.map(n=>n*formation),tangent=normalize(derivative);
  const along=dot(acceleration,tangent),speedSquared=dot(derivative,derivative);
  return {center,tangent,curvature:acceleration.map((n,i)=>(n-tangent[i]*along)/speedSquared)};
}
function rotate(p, s) {
  const py = p[1]*Math.cos(s.pitch) - p[2]*Math.sin(s.pitch), pz = p[1]*Math.sin(s.pitch) + p[2]*Math.cos(s.pitch);
  const px = p[0]*Math.cos(s.yaw) + pz*Math.sin(s.yaw), rz = -p[0]*Math.sin(s.yaw) + pz*Math.cos(s.yaw);
  return [px*Math.cos(s.roll) - py*Math.sin(s.roll), px*Math.sin(s.roll) + py*Math.cos(s.roll), rz];
}
export function sculptureSpine(q, state) { return rotate(centerline(q,state.formation).center, state); }

// CPU counterpart used for geometry and curve-continuity checks.
export function sculpturePoint(u, v, _strand, s) {
  const q=u/TAU, { center, tangent, curvature }=centerline(q,s.formation);
  const normal=normalize([-tangent[1],tangent[0],0]);
  const binormal=cross(tangent,normal),twist=s.formation*(.24+1.22*Math.sin(TAU*q-.22));
  const cap=clamp(Math.min(q,1-q)/.025), taper=Math.sqrt(Math.max(0,1-(1-cap)**2));
  const width=.075+s.formation*(.135+.115*Math.sin(Math.PI*q)+.045*Math.sin(TAU*q));
  const thickness=.055-.021*s.formation,wide=normal.map((n,i)=>n*Math.cos(twist)+binormal[i]*Math.sin(twist));
  const thin=normal.map((n,i)=>-n*Math.sin(twist)+binormal[i]*Math.cos(twist));
  // Smoothly narrow tight bends before an offset face can invert. This keeps
  // broad faces between folds and a rounded, continuous neck through the turn.
  const reach=Math.hypot(dot(curvature,wide)*width,dot(curvature,thin)*thickness)*taper;
  const profile=1/Math.sqrt(1+(reach/.65)**2);
  const across=Math.cos(v)*width*taper*profile,depth=Math.sin(v)*thickness*taper*profile;
  const p=center.map((n,i)=>n+wide[i]*across+thin[i]*depth);
  return rotate(p,s);
}
