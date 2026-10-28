import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import {portraitSource,portraitCrop,portraitTreatment,portraitEdgeAlpha,portraitAsciiGrid,portraitAsciiCells,portraitAsciiTone,portraitAsciiGlyph,portraitAsciiPose,portraitAsciiPulse,portraitAsciiVariants,portraitAsciiTempo} from '../src/portrait-image.js';
import {initFigure} from '../src/figure.js';
const passed=[],check=(name,fn)=>{fn();passed.push(name);};
const NativeAbort=AbortController;
globalThis.AbortController=class extends NativeAbort{constructor(){super();setMaxListeners(0,this.signal);}};
check('the original supplied PNG and proportional face crop remain the source',()=>{
 assert.equal(portraitSource,'/profile/selfphoto.png');const crop=portraitCrop(736,1119);
 assert.equal(crop.width,736*.52);assert.equal(crop.width/crop.height,.8);
 assert.ok(crop.y<335&&crop.y+crop.height>730);assert.ok(crop.x>=0&&crop.x+crop.width<=736);
 assert.ok(readFileSync(new URL('../index.html',import.meta.url),'utf8').includes('href="/profile/selfphoto.png"'));
});
check('the full rectangular source is retained with no side or lower dissolve',()=>{
 for(const x of [0,.05,.5,.95,1])for(const y of [0,.5,.7,.9,1])assert.equal(portraitEdgeAlpha(x,y),1);
 const pixels=new Uint8ClampedArray(2*2*4).fill(255),cells=portraitAsciiCells(pixels,2,2);
 assert.equal(cells.length,4);assert.ok(cells.every(cell=>cell.alpha===1));
});
check('the character-only treatment has no visible photographic core',()=>{
 assert.equal(portraitTreatment.reliefOpacity,undefined);assert.equal(portraitTreatment.asciiOpacity,1);
});
check('mobile grid is readable and bounded while desktop detail is capped',()=>{
 const a=portraitAsciiGrid(72),b=portraitAsciiGrid(112),c=portraitAsciiGrid(200),d=portraitAsciiGrid(1200);
 assert.equal(a.columns,28);assert.ok(b.columns>a.columns);assert.ok(c.columns>b.columns);assert.equal(d.columns,56);
});
check('transparent pixels never produce glyphs; source alpha and luminance survive',()=>{
 const cells=portraitAsciiCells(Uint8ClampedArray.from([255,255,255,0,255,255,255,128,0,0,0,255]),3,1);
 assert.equal(cells.length,2);assert.equal(cells[0].luminance,1);assert.equal(cells[0].alpha,128/255);assert.equal(cells[1].luminance,0);
});
check('light mode reverses ink density and both ramps remain monotonic',()=>{
 assert.equal(portraitAsciiTone(0,false),0);assert.equal(portraitAsciiTone(1,false),31);
 assert.equal(portraitAsciiTone(0,true),31);assert.equal(portraitAsciiTone(1,true),0);
 let prior=0;for(let i=0;i<=100;i++){const tone=portraitAsciiTone(i/100,false);assert.ok(tone>=prior);prior=tone;}
});
check('skin midtones retain separation rather than clipping facial features to white',()=>{
 const tone=portraitAsciiTone(.35,false),glyph=portraitAsciiGlyph(tone);
 assert.ok(tone>=14&&tone<24);assert.ok(glyph.alpha>=.6);assert.ok(['#','%','@'].includes(glyph.mark));
 assert.ok(portraitAsciiTone(.4,false)<portraitAsciiTone(.5,false));
 assert.ok(!Array.from({length:32},(_,i)=>portraitAsciiGlyph(i).mark).some(mark=>mark==='-'||mark==='='));
});
check('all tone families use opaque ink and retain at least 90 percent variant strength',()=>{
 for(let tone=0;tone<32;tone++)for(let variant=0;variant<portraitAsciiVariants;variant++)assert.equal(portraitAsciiGlyph(tone,variant).alpha,1);
 assert.ok(portraitTreatment.coverageFloor>=.9);
});
check('the face grid stays anchored throughout the rhythm instead of moving as a shape',()=>{
 const cell={x:80,y:100,phase:1.25};
 for(let elapsed=0;elapsed<120000;elapsed+=137)assert.deepEqual(portraitAsciiPose(cell,elapsed),{x:80,y:100});
});
check('tempo changes actual character identities inside one tonal family',()=>{
 const cell={x:80,y:100,phase:1.25,luminance:.35},marks=new Set();
 for(let ms=0;ms<8000;ms+=100){const p=portraitAsciiPulse(cell,ms);assert.ok(p.from>=0&&p.from<4&&p.to>=0&&p.to<4);assert.ok(p.mix>=0&&p.mix<=1);marks.add(portraitAsciiGlyph(portraitAsciiTone(cell.luminance,false),p.to).mark);}
 assert.equal(marks.size,4);assert.deepEqual(portraitAsciiPulse(cell,10000,true),{from:0,to:0,mix:0});
});
check('the eight-beat phrase has active gestures, a real rest and local staggering',()=>{
 const beat=60000/portraitAsciiTempo.bpm,a={x:80,y:100,phase:1,rhythmSeed:0},b={...a,rhythmSeed:.9};
 const active=portraitAsciiPulse(a,beat*.4),delayed=portraitAsciiPulse(b,beat*.4),rest=portraitAsciiPulse(a,beat*3.2);
 assert.notEqual(active.from,active.to);assert.ok(Math.abs(active.mix-delayed.mix)>.5);
 assert.equal(rest.from,rest.to);assert.equal(rest.mix,0);
});
check('crossfades and the phrase loop remain continuous through event boundaries',()=>{
 const cell={x:80,y:100,phase:1.25},period=60000/portraitAsciiTempo.bpm*portraitAsciiTempo.beats;
 const weights=ms=>{const p=portraitAsciiPulse(cell,ms),a=[0,0,0,0];a[p.from]+=1-p.mix;a[p.to]+=p.mix;return a;};
 for(let ms=0;ms<=period+10;ms+=5){const a=weights(ms),b=weights(ms+1);assert.ok(a.every((value,i)=>Math.abs(value-b[i])<.01));}
 const a=weights(400),b=weights(period+400);assert.ok(a.every((v,i)=>Math.abs(v-b[i])<1e-10));
});
function setup({loading=false,reduced=false,context=true,gate,badSamples=false,animations=true}={}){
 const abort=new AbortController(),frames=new Map(),surfaces=[],queries=new Map(),observers=[];let id=0;
 globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;document.documentElement={dataset:{entry:loading?'loading':'ready',theme:'dark'}};
 const dialog={open:false};document.querySelector=()=>dialog;globalThis.devicePixelRatio=3;
 globalThis.getComputedStyle=()=>({color:document.documentElement.dataset.theme==='light'?'rgb(0, 0, 0)':'rgb(255, 255, 255)'});
 globalThis.matchMedia=query=>{if(!queries.has(query)){const media=new EventTarget();media.matches=query.includes('reduced-motion')?reduced:false;queries.set(query,media);}return queries.get(query);};
 function surface(){const log={draws:[],samples:0,glyphs:[],alphas:[],masks:[],inks:[],glyphAlphas:[]};const ctx={globalAlpha:1,clearRect(){},setTransform(){},drawImage(...args){log.draws.push(args);log.alphas.push(this.globalAlpha);},fillRect(){log.masks.push(this.globalCompositeOperation);},createLinearGradient(){return {addColorStop(){}};},fillText(...args){log.glyphs.push(args);log.inks.push(this.fillStyle);log.glyphAlphas.push(this.globalAlpha);},getImageData(x,y,w,h){if(badSamples)throw Error('sample');log.samples++;const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4){data[i]=160;data[i+1]=110;data[i+2]=80;data[i+3]=255;}return {data};}};const canvas={width:0,height:0,log,getContext:()=>ctx};surfaces.push(canvas);return canvas;}
 const canvas=surface();canvas.clientWidth=200;canvas.clientHeight=250;if(!context)canvas.getContext=()=>null;
 document.createElement=()=>surface();let images=0;
 globalThis.Image=class{naturalWidth=736;naturalHeight=1119;constructor(){images++;}decode(){return gate||Promise.resolve();}};
 globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=n=>frames.delete(n);
 globalThis.IntersectionObserver=class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
 globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
 globalThis.MutationObserver=class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}};
 const emit=(target,type)=>target.dispatchEvent(new Event(type));
 return{abort,canvas,surfaces,queries,observers,frames,dialog,emit,get images(){return images;},step(now){const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(now));}};
}
{
 const f=setup({loading:true}),destroy=await initFigure(f.canvas,f.abort.signal);
 check('entry gets a real ASCII draw after decode and no running frame',()=>{
  assert.equal(f.images,1);assert.ok(f.surfaces[1].log.samples===1);assert.equal(f.surfaces[2].log.glyphs.length,32*portraitAsciiVariants);
  assert.ok(f.canvas.log.draws.length>0);assert.equal(f.canvas.width,400);assert.equal(f.canvas.height,500);assert.equal(f.frames.size,0);
 });
 document.documentElement.dataset.entry='ready';f.emit(document,'portfolio:entryready');f.step(0);
 const draws=f.canvas.log.draws.length,samples=f.surfaces[1].log.samples,glyphs=f.surfaces[2].log.glyphs.length;
 check('the original photo is sampled offscreen once and never drawn to the visible canvas',()=>{
  assert.equal(f.surfaces.length,3);assert.equal(f.surfaces[1].log.draws.length,1);
  assert.ok(f.canvas.log.draws.every(draw=>draw[0]===f.surfaces[2]));
 });
 check('no mask or tone-wash cache crops the reconstructed character portrait',()=>{
  assert.ok(f.surfaces.every(surface=>surface.log.masks.length===0));
 });
 f.step(16);f.step(32);
 check('desktop skips paints above its 30fps budget with exactly one pending owner',()=>{assert.equal(f.canvas.log.draws.length,draws);assert.equal(f.frames.size,1);});
 f.step(48);
 check('slow motion reuses sampled pixels and the glyph atlas without drawing a photo layer',()=>{assert.ok(f.canvas.log.draws.length>draws);assert.equal(f.surfaces[1].log.samples,samples);assert.equal(f.surfaces[2].log.glyphs.length,glyphs);assert.ok(f.canvas.log.draws.every(draw=>draw[0]===f.surfaces[2]));});
 document.documentElement.dataset.themeControlOpen='true';f.emit(document,'portfolio:themecontrol');
 check('opening the theme menu cancels portrait animation',()=>assert.equal(f.frames.size,0));
 document.documentElement.dataset.theme='light';f.observers[2].callback([{attributeName:'data-theme'}]);
 check('theme updates rebuild only glyph ink while paused',()=>{assert.equal(f.surfaces[2].log.glyphs.length,glyphs+32*portraitAsciiVariants);assert.equal(f.surfaces[1].log.samples,samples);assert.equal(f.frames.size,0);});
 document.documentElement.dataset.themeControlOpen='false';f.emit(document,'portfolio:themecontrol');
 document.documentElement.dataset.galleryMoving='true';f.emit(document,'portfolio:gallerymotion');
 check('gallery input pauses portrait work',()=>assert.equal(f.frames.size,0));
 document.documentElement.dataset.galleryMoving='false';f.emit(document,'portfolio:gallerymotion');
 f.emit(document,'portfolio:sectionstart');
 check('section transitions suspend the same frame owner',()=>assert.equal(f.frames.size,0));
 f.emit(document,'portfolio:sectionsettled');
 check('settled sections resume the requested slow idle movement',()=>assert.equal(f.frames.size,1));
 f.dialog.open=true;f.observers[2].callback([{attributeName:'open'}]);
 check('native project dialogs pause portrait work',()=>assert.equal(f.frames.size,0));
 f.dialog.open=false;f.observers[2].callback([{attributeName:'open'}]);
 f.step(100);const before=f.canvas.log.draws.at(-1).slice(-4);document.hidden=true;f.emit(document,'visibilitychange');
 check('hidden tabs release all frames',()=>assert.equal(f.frames.size,0));
 document.hidden=false;f.emit(document,'visibilitychange');f.step(100000);const after=f.canvas.log.draws.at(-1).slice(-4);
 check('resume preserves the motion phase without hidden-time catchup',()=>assert.deepEqual(after,before));
 f.observers[0].callback([{isIntersecting:false}]);f.emit(window,'pagehide');f.emit(window,'pageshow');
 check('offscreen and cached pages cannot restart an invisible portrait',()=>assert.equal(f.frames.size,0));
 f.observers[0].callback([{isIntersecting:true}]);f.emit(window,'blur');
 check('a visible page continues animating when another window has focus',()=>assert.equal(f.frames.size,1));
 f.emit(window,'focus');assert.equal(f.frames.size,1);
 const reduced=f.queries.get('(prefers-reduced-motion: reduce)');reduced.matches=true;f.emit(reduced,'change');
 check('reduced motion renders the stationary ASCII face with zero frames',()=>{assert.equal(f.frames.size,0);assert.ok(f.canvas.log.draws.length>0);});
 reduced.matches=false;f.emit(reduced,'change');const forced=f.queries.get('(forced-colors: active)');forced.matches=true;f.emit(forced,'change');
 check('forced colors freezes the face and repaints system ink',()=>assert.equal(f.frames.size,0));
 forced.matches=false;f.emit(forced,'change');f.canvas.clientWidth=90;f.canvas.clientHeight=112.5;f.observers[1].callback();
 check('mobile layout changes resample at an appropriate smaller grid',()=>{assert.equal(f.canvas.width,180);assert.equal(f.canvas.height,225);assert.equal(f.surfaces[1].log.samples,samples+1);assert.equal(f.images,1);});
 f.step(100100);const mobile=f.canvas.log.draws.length;f.step(100116);f.step(100132);
 check('mobile skips paints above its 24fps drawing cap',()=>assert.equal(f.canvas.log.draws.length,mobile));
 f.step(100148);assert.ok(f.canvas.log.draws.length>mobile);
 destroy();destroy();f.abort.abort();const total=f.canvas.log.draws.length;f.emit(window,'resize');f.emit(document,'visibilitychange');
 check('cleanup releases frames, all observers, rasters and listeners idempotently',()=>{
  assert.equal(f.frames.size,0);assert.ok(f.observers.every(o=>o.disconnected));assert.equal(f.surfaces[1].width,1);assert.equal(f.surfaces[2].width,1);assert.equal(f.canvas.log.draws.length,total);
 });
}
{
 let release;const gate=new Promise(resolve=>{release=resolve;});const f=setup({gate}),pending=initFigure(f.canvas,f.abort.signal);f.abort.abort();release();await pending;
 check('abort during decode installs no stale listeners or animation',()=>{assert.equal(f.frames.size,0);assert.equal(f.observers.length,0);});
}
{
 const f=setup({context:false});await initFigure(f.canvas,f.abort.signal);
 check('missing canvas context does not delay entry readiness',()=>{assert.equal(f.images,0);assert.equal(f.frames.size,0);});f.abort.abort();
}
{
 const f=setup({badSamples:true,reduced:true});const destroy=await initFigure(f.canvas,f.abort.signal);
 check('unreadable image pixels resolve readiness without exposing a photo or running frames',()=>{assert.equal(f.canvas.log.draws.length,0);assert.equal(f.frames.size,0);});destroy();f.abort.abort();
}
{
 const f=setup(),destroy=await initFigure(f.canvas,f.abort.signal);
 const frame=now=>{const start=f.canvas.log.draws.length;f.step(now);return f.canvas.log.draws.slice(start).filter(draw=>draw[0]===f.surfaces[2]);};
 const first=frame(0);let later=[];for(let now=100;now<=500;now+=100)later=frame(now);
 check('the renderer changes character slots while every destination cell stays fixed',()=>{
  const anchors=draws=>[...new Set(draws.map(draw=>`${draw[5]},${draw[6]}`))].sort();
  assert.deepEqual(anchors(later),anchors(first));
  assert.notDeepEqual(later.map(draw=>draw[1]),first.map(draw=>draw[1]));
 });destroy();f.abort.abort();
}
{
 const f=setup(),destroy=await initFigure(f.canvas,f.abort.signal),samples=f.surfaces[1].log.samples;
 check('all four theme changes rebuild high-contrast ink without resampling or fading the source',()=>{
  for(const theme of ['dark','light','unexpected','amethyst']){
   document.documentElement.dataset.theme=theme;f.observers[2].callback([{attributeName:'data-theme'}]);
   assert.equal(f.surfaces[2].log.inks.at(-1),theme==='light'?'rgb(0, 0, 0)':'rgb(255, 255, 255)');
   assert.equal(f.surfaces[1].log.samples,samples);assert.ok(f.surfaces[2].log.glyphAlphas.every(alpha=>alpha===1));
  }
 });destroy();f.abort.abort();
}
mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});
writeFileSync(new URL('../artifacts/portrait-ascii-results.json',import.meta.url),JSON.stringify({checks:passed.length,passed,limits:'Model and Canvas/event/clock fixtures plus offline glyph study; no browser or physical-device rendering/FPS claim.'},null,2));
console.log(`${passed.length} portrait ASCII checks passed`);
