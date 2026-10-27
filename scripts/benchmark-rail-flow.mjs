// CPU raster benchmark only: these numbers are not browser/phone frame rates.
import {paintRailFlow,railFlowPreset} from '../src/rail-flow.js';
const reports=[];
for(const [width,height] of [[240,160],[144,96]]) {
  const data=new Uint8ClampedArray(width*height*4),samples=[];
  for(let index=0;index<30;index++) {
    const start=performance.now();
    paintRailFlow(data,width,height,railFlowPreset.startT+index*.01);
    if(index>=5)samples.push(performance.now()-start);
  }
  samples.sort((a,b)=>a-b);
  reports.push({width,height,medianMs:samples[Math.floor(samples.length/2)],p95Ms:samples[Math.floor(samples.length*.95)]});
}
console.log(JSON.stringify({runtime:process.version,mode:'Node CPU raster only; no device/browser FPS',reports},null,2));
