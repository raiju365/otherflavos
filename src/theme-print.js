// Six interleaved print plates: curved cuts, directional lag, quiet ink offsets.
const phases=[0,.16,.34,.54,.74,.9,1];
const delay=[0,.12,.04,.18,.08,.15];
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const number=n=>Number(n.toFixed(2));
export const printPath=points=>{
 const p=points.map(v=>v.map(number).join(' '));
 return `M ${p[0]} L ${p[1]} C ${p[2]} ${p[3]} ${p[4]} L ${p[5]} C ${p[6]} ${p[7]} ${p[8]} Z`;
};
export function themePrintGeometry({width:w,height:h}){
 const margin=24,count=6;
 return phases.map(offset=>({offset,plates:Array.from({length:count},(_,i)=>{
  const q=smooth((offset-delay[i])/(1-delay[i]));
  const top=i===0?-margin:h*i/count-1,bottom=i===count-1?h+margin:h*(i+1)/count+1;
  const bend=Math.sin(Math.PI*q)*Math.min(w*.12,h/count*.85);
  const left=i%2?-margin+(w+margin*2)*q:-margin;
  const right=i%2?w+margin:-margin+(w+margin*2)*(1-q);
  return [[left,top],[right,top],
   [right+(i%2?0:-bend),top+(bottom-top)*.26],
   [right+(i%2?0:bend),top+(bottom-top)*.74],[right,bottom],[left,bottom],
   [left+(i%2?bend:0),top+(bottom-top)*.74],
   [left+(i%2?-bend:0),top+(bottom-top)*.26],[left,top]];
 })}));
}
export function themePrintFrames(settings){
 return themePrintGeometry(settings).map(({offset,plates})=>({
  offset,clipPath:`path("${plates.map(printPath).join(' ')}")`,
  opacity:offset===1?0:1,
 }));
}
export function printInkFrames(geometry,index){
 const direction=index%2?1:-1;
 return geometry.map(({offset,plates})=>({
  offset,d:`path("${printPath(plates[index])}")`,
  opacity:offset===0||offset===1?0:Math.sin(Math.PI*offset)*.13,
  transform:`translateX(${number(direction*Math.sin(Math.PI*offset)*18)}px) skewX(${number(direction*Math.sin(Math.PI*offset)*.45)}deg)`,
 }));
}
export function createThemePrint(settings){
 if(typeof document.createElementNS!=='function')return null;
 const make=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));return n;};
 const svg=make('svg',{class:'theme-print','aria-hidden':'true',focusable:'false'});
 const plates=Array.from({length:6},(_,i)=>make('path',{class:`theme-print-plate theme-print-plate-${i%2}`,fill:i%2?'var(--fg)':'var(--accent)'}));
 plates.forEach(p=>{p.style.opacity='0';svg.append(p);});
 const registration=make('path',{class:'theme-print-register',fill:'none',stroke:'var(--fg)','stroke-width':1});
 registration.setAttribute('d',Array.from({length:5},(_,i)=>{
  const x=settings.width*.5,y=settings.height*(i+1)/6;
  return `M ${x-7} ${y} H ${x+7} M ${x} ${y-7} V ${y+7}`;
 }).join(' '));registration.style.opacity='0';svg.append(registration);
 document.body.append(svg);
 const geometry=themePrintGeometry(settings),animations=[];
 return{
  play(options){
   const jobs=plates.map((p,i)=>[p,printInkFrames(geometry,i)]);
   jobs.push([registration,[{offset:0,opacity:0},{offset:.16,opacity:.36},{offset:.54,opacity:.12},{offset:.82,opacity:0},{offset:1,opacity:0}]]);
   jobs.forEach(([node,frames])=>{if(typeof node.animate!=='function')return;const a=node.animate(frames,options);a.finished.catch(()=>{});animations.push(a);});
  },
  destroy(){animations.forEach(a=>a.cancel());svg.remove();},
 };
}
