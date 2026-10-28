import assert from 'node:assert/strict';
import {setMaxListeners} from 'node:events';
import {initProjectGallery} from '../src/project-gallery.js';
import {loopArrival,LOOP_ARRIVAL_MS} from '../src/project-loop-model.js';
import {createSectionReveal} from '../src/section-reveal.js';
const passed=[],check=(name,fn)=>{fn();passed.push(name);};
const emit=(target,type,detail)=>target.dispatchEvent(detail===undefined?new Event(type):new CustomEvent(type,{detail}));
class Element extends EventTarget {
 dataset={};style={};attrs=new Map();hidden=false;complete=true;
 setAttribute(k,v){this.attrs.set(k,v);}getAttribute(k){return this.attrs.get(k);}
 focus(){}hasPointerCapture(){return false;}
}
function fixture({width=390,gpu=false,loading=false,reduced=false,forced=false,count=3}={}){
 const controller=new AbortController();setMaxListeners(0,controller.signal);
 const frames=new Map(),images=[],calls=[];let id=0,time=0,resize;
 globalThis.document=new EventTarget();document.hidden=false;document.documentElement={dataset:{entry:'ready'}};
 globalThis.window=new EventTarget();window.devicePixelRatio=2;
 const media={reduced:new EventTarget(),forced:new EventTarget(),compact:new EventTarget()};
 media.reduced.matches=reduced;media.forced.matches=forced;media.compact.matches=width<=800;
 globalThis.matchMedia=q=>q.includes('reduced')?media.reduced:q.includes('forced')?media.forced:media.compact;
 globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.IntersectionObserver=undefined;
 globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;resize=this;}observe(){}disconnect(){this.disconnected=true;}};
 globalThis.Image=class {naturalWidth=1440;naturalHeight=900;constructor(){images.push(this);}load(){this.onload?.();}fail(){this.onerror?.();}};
 const gl=new Proxy({}, {get:(_,key)=>{
  if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
  if(key==='getUniformLocation')return (_p,name)=>name;
  if(key==='getAttribLocation')return ()=>0;
  if(key==='getExtension')return ()=>({loseContext(){}});
  if(key==='isContextLost')return ()=>false;
  if(String(key).startsWith('create'))return ()=>({});
  if(/^[A-Z_0-9]+$/.test(key))return 1;
  return (...args)=>calls.push([key,...args]);
 }});
 const root=new Element(),panel=new Element(),workspace=new Element();workspace.dataset.view='projects';workspace.setAttribute('aria-busy','true');
 const nodes=Object.fromEntries(['.loop-canvas','.loop-viewport','.loop-caption','.loop-controls','.loop-fallback','.loop-open','.loop-kind','.loop-title','.loop-status','.loop-announcement'].map(key=>[key,new Element()]));
 nodes['.loop-canvas'].getContext=()=>gpu?gl:null;
 nodes['.loop-viewport'].getBoundingClientRect=()=>({width,height:width<=800?510:650,left:0,top:0});
 const slots=Array.from({length:5},()=>{const element=new Element(),button=new Element(),image=new Element();image.complete=!loading;element.querySelector=s=>s==='button'?button:image;return {element,button,image};});
 root.querySelector=s=>nodes[s];root.querySelectorAll=()=>slots.map(s=>s.element);
 document.querySelector=s=>({'.loop-gallery':root,'#panel-projects':panel,'.workspace':workspace})[s];
 const control=initProjectGallery({signal:controller.signal,projects:Array.from({length:count},(_,id)=>({name:`Project ${id}`,image:`/project-${id}.webp`,type:'test'})),onOpen(){}});
 const step=(delta=16)=>{time+=delta;const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(time));assert.ok(frames.size<=1);};
 const drain=()=>{for(let i=0;i<400&&frames.size;i++)step();assert.equal(frames.size,0);};
 const enter=()=>{panel.hidden=false;workspace.dataset.view='projects';workspace.setAttribute('aria-busy','true');emit(document,'portfolio:sectionstart',{entering:true,view:'projects'});};
 const settled=()=>{workspace.setAttribute('aria-busy','false');emit(document,'portfolio:sectionsettled');};
 return {controller,frames,images,calls,root,panel,workspace,nodes,slots,media,control,step,drain,enter,settled,get resize(){return resize;}};
}
check('arrival has a smooth tail, a leading card and exact shared-cylinder settlement',()=>{
 assert.equal(LOOP_ARRIVAL_MS,900);
 for(const relative of [-2,-1,0,1,2]){
  assert.equal(loopArrival(relative,0,700).opacity,0);
  assert.deepEqual(loopArrival(relative,1,700),{shift:0,rise:0,opacity:1});
  let last=0;
  for(let i=0;i<=100;i++){const pose=loopArrival(relative,i/100,700),lead=loopArrival(0,i/100,700);assert.equal(pose.shift,lead.shift);assert.equal(pose.rise,lead.rise);assert.ok(pose.opacity>=last);last=pose.opacity;}
 }
 assert.ok(loopArrival(0,.2,700).opacity>loopArrival(1,.2,700).opacity);
 assert.ok(loopArrival(0,.2,700).opacity>loopArrival(-1,.2,700).opacity);
 assert.ok(loopArrival(0,.999,700).shift<1e-8);
});
for(const width of [360,768,1280]){
 const f=fixture({width});
 check(`${width}px gallery is concealed before its actual incoming phase`,()=>{assert.equal(f.frames.size,0);assert.equal(Number(f.slots[0].element.style.opacity),0);});
 f.enter();
 check(`${width}px entrance starts during the section reveal with one pending frame`,()=>{assert.equal(f.frames.size,1);assert.equal(f.root.dataset.sectionEntering,'true');assert.equal(f.workspace.getAttribute('aria-busy'),'true');assert.equal(Number(f.slots[0].element.style.opacity),0);});
 for(let i=0;i<8;i++)f.step();
 check(`${width}px lead card fades and moves progressively before the tab settles`,()=>{const alpha=Number(f.slots[0].element.style.opacity);assert.ok(alpha>0&&alpha<1);assert.ok(alpha>Number(f.slots[1].element.style.opacity));});
 const frame=[...f.frames.keys()],pose=f.slots[0].element.style.transform,alpha=f.slots[0].element.style.opacity;f.settled();
 check(`${width}px section completion neither restarts nor snaps the card entrance`,()=>{assert.deepEqual([...f.frames.keys()],frame);assert.equal(f.slots[0].element.style.transform,pose);assert.equal(f.slots[0].element.style.opacity,alpha);assert.equal(f.root.dataset.sectionEntering,undefined);});
 f.drain();check(`${width}px arrival settles to the real card and releases all frames`,()=>assert.equal(Number(f.slots[0].element.style.opacity),1));
 f.controller.abort();
}
{
 const f=fixture({gpu:true});f.enter();
 check('pending GPU textures do not consume the entrance or start an idle polling loop',()=>{assert.equal(f.images.length,3);assert.equal(f.frames.size,0);assert.equal(Number(f.slots[0].element.style.opacity),0);});
 f.images[0].load();assert.equal(f.frames.size,0);f.images.slice(1).forEach(image=>image.load());
 check('real texture readiness starts exactly one entrance from zero',()=>{assert.equal(f.frames.size,1);assert.equal(Number(f.slots[0].element.style.opacity),0);});
 f.step();check('GPU cards receive partial opacity instead of appearing fully formed',()=>assert.ok(f.calls.some(call=>call[0]==='uniform1f'&&call[1]==='uOpacity'&&call[2]>0&&call[2]<1)));
 const pending=[...f.frames.keys()],calls=f.calls.length;f.resize.callback();
 check('header resizing batches its redraw into the existing gallery frame',()=>{assert.deepEqual([...f.frames.keys()],pending);assert.equal(f.calls.length,calls);});
 f.settled();f.drain();f.controller.abort();f.images.forEach(image=>image.load());
 check('abort releases texture callbacks and cannot wake a stale entrance',()=>assert.equal(f.frames.size,0));
}
{
 const f=fixture({gpu:true,count:5});f.enter();
 for(const index of [0,1,4])f.images[index].load();
 check('unseen rear textures cannot delay the visible project entrance',()=>assert.equal(f.frames.size,1));
 const pending=[...f.frames.keys()];f.images[2].load();f.images[3].load();
 check('late rear texture loads preserve the already pending entrance frame',()=>assert.deepEqual([...f.frames.keys()],pending));
 f.settled();f.drain();f.controller.abort();
}
{
 const f=fixture({loading:true});f.enter();
 check('the DOM image fallback also waits without a frame loop',()=>assert.equal(f.frames.size,0));
 f.slots.slice(0,-1).forEach(({image})=>{image.complete=true;emit(image,'load');});assert.equal(f.frames.size,0);
 f.slots.at(-1).image.complete=true;emit(f.slots.at(-1).image,'load');
 check('the final fallback image load releases the same gradual entrance',()=>assert.equal(f.frames.size,1));
 f.settled();f.drain();f.controller.abort();
}
{
 const f=fixture({gpu:true});f.enter();f.images[0].fail();f.images.slice(1).forEach(image=>image.load());
 check('a failed GPU image can animate its usable DOM fallback without deadlocking',()=>{assert.equal(f.frames.size,1);f.step();assert.equal(f.slots[0].element.dataset.gpu,'false');});
 f.settled();f.drain();f.controller.abort();
}
{
 const f=fixture();f.enter();for(let i=0;i<10;i++)f.step();
 const pose=f.slots[0].element.style.transform,alpha=f.slots[0].element.style.opacity;
 document.hidden=true;emit(document,'visibilitychange');f.step(100000);
 check('hidden pages stop the entrance without spending hidden time',()=>assert.equal(f.frames.size,0));
 document.hidden=false;emit(document,'visibilitychange');
 check('visibility restoration resumes the presented card phase without snapping',()=>{assert.equal(f.slots[0].element.style.transform,pose);assert.equal(f.slots[0].element.style.opacity,alpha);assert.equal(f.frames.size,1);});
 f.control.setDialogOpen(true);assert.equal(f.frames.size,0);f.control.setDialogOpen(false);
 check('closing a project dialog resumes the same arrival instead of replaying it',()=>assert.equal(f.slots[0].element.style.transform,pose));
 emit(document,'portfolio:sectionstart');f.panel.hidden=true;f.settled();f.enter();f.enter();
 check('rapid navigation clears obsolete arrivals and retains only the latest owner',()=>{assert.equal(f.frames.size,1);assert.equal(Number(f.slots[0].element.style.opacity),0);});
 f.settled();f.drain();f.controller.abort();
}
for(const preference of ['reduced','forced']){
 const f=fixture({[preference]:true});f.enter();
 check(`${preference} mode shows the settled card immediately with no entrance frames`,()=>{assert.equal(f.frames.size,0);assert.equal(Number(f.slots[0].element.style.opacity),1);});
 f.settled();f.controller.abort();
}
{
 const f=fixture();f.enter();for(let i=0;i<8;i++)f.step();f.settled();
 const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:'ArrowDown'});f.nodes['.loop-viewport'].dispatchEvent(event);f.drain();
 check('keyboard input can interrupt arrival and still settle on the requested project',()=>assert.equal(f.nodes['.loop-title'].textContent,'Project 1'));
 f.controller.abort();
}
{
 const motions=[],gallery=new Element();
 const panel={querySelectorAll:()=>[],querySelector:()=>gallery};
 globalThis.getComputedStyle=()=>({transform:'none',opacity:'.63',clipPath:'none'});
 const reveal=createSectionReveal({desktop:{matches:true},animateElement:(element,frames,options)=>{motions.push({element,frames,options});return {finished:Promise.resolve()};}});
 await reveal.play(panel,true,null);
 check('the incoming enhanced gallery never receives a duplicate whole-panel fade',()=>assert.equal(motions.length,0));
 reveal.freeze(panel);await reveal.play(panel,false,null);
 check('outgoing gallery fades from its sampled opacity through the navigation owner',()=>{assert.equal(motions.length,1);assert.equal(motions[0].element,gallery);assert.equal(motions[0].frames[0].opacity,'.63');assert.equal(motions[0].frames[1].opacity,0);assert.equal(motions[0].options.duration,220);});
 reveal.destroy();
}
console.log(`${passed.length} gallery entrance checks passed`);
