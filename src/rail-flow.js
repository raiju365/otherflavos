// Flow-only adaptation of the engine supplied by the user, without React/UI.
// Retains its sRGB field/mesh; the user's later correction adds broad S bends.
import preset from './rail-flow-preset.json' with { type: 'json' };
export { preset as railFlowPreset };
const origin = 20.75;
const fract = x => x - Math.floor(x);
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x*x*(3-2*x); };
function orbit(index, time) {
  const phase=index*.37, a=.6+fract(index/3)*.9, b=.8+fract((index+1)/4);
  return [.5+.5*Math.sin(time*a+phase), .5+.5*Math.cos(time*b+phase*1.5)];
}
export function flowCenters(time) {
  const scale=.4+preset.params.scale/100*1.2;
  return preset.mesh.map((point,index)=>{
    const now=orbit(index,time), initial=orbit(index,origin);
    return [(point[0]/100-.5)/scale+.5+.2*(now[0]-initial[0])/scale,
      (point[1]/100-.5)/scale+.5+.2*(now[1]-initial[1])/scale];
  });
}
const colors=preset.stops.map(hex=>[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)));
const edges=[0,...preset.divs,1];
const weights=colors.map((_,i)=>(edges[i+1]-edges[i])*colors.length);
export function bendFlowCoordinates(x,y,time) {
  const bend=preset.params.bend/100,phase=(time-preset.startT)*.34;
  const across=(y-.5)*Math.PI*2,along=(x-.5)*Math.PI*2;
  // Two continuous harmonics bend the color boundaries, not the canvas box.
  return [x+bend*(Math.sin(across+phase)+.24*Math.sin(across*2-phase*.65)),
    y+bend*.34*Math.sin(along-phase*.55)];
}
export function paintRailFlow(data,width,height,time,{curved=true}={}) {
  const centers=flowCenters(time),scale=.4+preset.params.scale/100*1.2;
  const distortion=preset.params.distortion/100,swirl=preset.params.swirl/100;
  // Domain bending is separable: compute its sine terms per row/column,
  // not per pixel. This also removes tens of thousands of tiny arrays.
  const rowBend=new Float64Array(height),columnBend=new Float64Array(width);
  if(curved){
    for(let y=0;y<height;y++)rowBend[y]=bendFlowCoordinates(0,(y+.5)/height,time)[0];
    for(let x=0;x<width;x++)columnBend[x]=bendFlowCoordinates((x+.5)/width,0,time)[1];
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=(x+.5)/width,v=(y+.5)/height;
    let px=(u+rowBend[y]-.5)/scale+.5, py=(v+columnBend[x]-.5)/scale+.5;
    const radius=smooth(Math.hypot(px-.5,py-.5)),falloff=1-radius;
    for(let octave=1;octave<=2;octave++){
      px+=distortion*falloff/octave*Math.sin(time+octave*.4*smooth(py))*Math.cos(.2*time+octave*2.4*smooth(py));
      py+=distortion*falloff/octave*Math.cos(time+octave*2*smooth(px));
    }
    const angle=-3*swirl*radius,cos=Math.cos(angle),sin=Math.sin(angle),dx=px-.5,dy=py-.5;
    px=cos*dx-sin*dy+.5;py=sin*dx+cos*dy+.5;
    let red=0,green=0,blue=0,total=0;
    for(let index=0;index<colors.length;index++){
      const cx=px-centers[index][0],cy=py-centers[index][1],distance=cx*cx+cy*cy;
      const weight=weights[index]/(distance*distance+.0001);
      red+=colors[index][0]*weight;green+=colors[index][1]*weight;blue+=colors[index][2]*weight;total+=weight;
    }
    const offset=(y*width+x)*4;
    data[offset]=red/total;data[offset+1]=green/total;data[offset+2]=blue/total;data[offset+3]=255;
  }
}
export function createRailFlow(canvas) {
  let context;
  try { context=canvas.getContext?.('2d',{alpha:false}); } catch { return null; }
  if(!context)return null;
  // Supplied renderer also animates a small raster beneath a softened CSS layer.
  const width=144,height=96;
  canvas.width=width;canvas.height=height;
  const image=context.createImageData(width,height);
  let time=preset.startT,frame=0,previous=null,lastPaint=null,running=false,destroyed=false;
  function draw(){paintRailFlow(image.data,width,height,time);context.putImageData(image,0,0);}
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;previous=null;lastPaint=null;}
  function tick(now){
    frame=0;if(!running||destroyed)return;
    if(previous!==null)time+=preset.speed/100*1.2*Math.min(.05,(now-previous)/1000);
    previous=now;
    if(lastPaint===null||now-lastPaint>=1000/24){draw();lastPaint=now;}
    frame=requestAnimationFrame(tick);
  }
  try {draw();} catch {return null;}
  return {
    setRunning(value){
      if(destroyed)return;running=Boolean(value)&&typeof requestAnimationFrame==='function';
      if(!running)stop();else if(!frame)frame=requestAnimationFrame(tick);
    },
    destroy(){destroyed=true;running=false;stop();canvas.width=canvas.height=1;},
  };
}
