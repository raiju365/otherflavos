import assert from 'node:assert/strict';
import {setMaxListeners} from 'node:events';
import {initProjectGallery} from '../src/project-gallery.js';
import {loopArrival,loopSequence,loopDeparture,loopDepartureDuration,loopPose,reelPose,LOOP_ARRIVAL_MS,LOOP_CARD_TRAVEL,LOOP_ANGULAR_STEP} from '../src/project-loop-model.js';
import {initSectionNavigation} from '../src/section-navigation.js';
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
 const leave=()=>{let task;workspace.setAttribute('aria-busy','true');emit(document,'portfolio:sectionstart',{entering:false,view:'projects',waitUntil:promise=>{task=promise;}});return task||Promise.resolve();};
 return {controller,frames,images,calls,root,panel,workspace,nodes,slots,media,control,step,drain,enter,settled,leave,get resize(){return resize;}};
}
check('one card changes at a time, with a real gap between successive cards',()=>{
 assert.equal(LOOP_ARRIVAL_MS,900);
 for(const count of [1,2,3,4,5])for(let i=0;i<=1000;i++){
  const values=Array.from({length:count},(_,rank)=>loopSequence(i/1000,rank,count));
  assert.ok(values.filter(value=>value>0&&value<1).length<=1);
  assert.ok(values.every((value,rank)=>rank===0||value<=values[rank-1]));
 }
 assert.ok(loopSequence(.15,0,3)>0);assert.equal(loopSequence(.15,1,3),0);
 assert.equal(loopSequence(.5,0,3),1);assert.ok(loopSequence(.5,1,3)>0);assert.equal(loopSequence(.5,2,3),0);
});
check('entry and exit retain exact endpoints and disjoint arcs on the common cylinder',()=>{
 for(const poseFor of [loopPose,reelPose])for(let i=0;i<=100;i++){
  const angles=[];
  for(const relative of [-1,0,1]){
   const arrival=loopArrival(relative,i/100,650),pose=poseFor(relative+arrival.shift,1280,650);
   assert.ok(arrival.shift>=0&&arrival.shift<=LOOP_CARD_TRAVEL);angles.push(pose.angle);
   if(i===0)assert.equal(arrival.opacity,0);
   if(i===100)assert.deepEqual(arrival,{shift:0,rise:0,opacity:1});
   const away=loopDeparture(poseFor(relative,1280,650),i/100,1-relative,3,650);
   assert.ok(away.opacity>=0&&away.opacity<=1);
   if(i===0)assert.deepEqual(away,poseFor(relative,1280,650));
   if(i===100)assert.equal(away.opacity,0);
  }
  assert.ok(angles[1]-angles[0]>.9&&angles[2]-angles[1]>.9);
 }
 assert.ok(LOOP_CARD_TRAVEL*2*LOOP_ANGULAR_STEP<LOOP_ANGULAR_STEP-.9);
});
for(const width of [360,768,1280]){
 const f=fixture({width});
 check(`${width}px gallery is concealed before its actual incoming phase`,()=>{assert.equal(f.frames.size,0);assert.equal(Number(f.slots[0].element.style.opacity),0);});
 f.enter();
 check(`${width}px entrance starts during the section reveal with one pending frame`,()=>{assert.equal(f.frames.size,1);assert.equal(f.root.dataset.sectionEntering,'true');assert.equal(f.workspace.getAttribute('aria-busy'),'true');assert.equal(Number(f.slots[0].element.style.opacity),0);});
 for(let i=0;i<8;i++)f.step();
 check(`${width}px main project appears fully before the neighbouring cards take their turns`,()=>{const alpha=Number(f.slots[0].element.style.opacity);assert.ok(alpha>0&&alpha<1);assert.equal(Number(f.slots[4].element.style.opacity),0);assert.equal(Number(f.slots[1].element.style.opacity),0);});
 const frame=[...f.frames.keys()],pose=f.slots[0].element.style.transform,alpha=f.slots[0].element.style.opacity;f.settled();
 check(`${width}px section completion neither restarts nor snaps the card entrance`,()=>{assert.deepEqual([...f.frames.keys()],frame);assert.equal(f.slots[0].element.style.transform,pose);assert.equal(f.slots[0].element.style.opacity,alpha);assert.equal(f.root.dataset.sectionEntering,undefined);});
 f.drain();check(`${width}px arrival settles to the real card and releases all frames`,()=>assert.equal(Number(f.slots[0].element.style.opacity),1));
 const exit=f.leave();let exited=false;exit.then(()=>{exited=true;});
 check(`${width}px outgoing cards retain their initial pose and one running owner`,()=>{assert.equal(f.frames.size,1);assert.equal(f.root.dataset.sectionExiting,'true');assert.equal(Number(f.slots[0].element.style.opacity),1);});
 for(let i=0;i<8;i++)f.step();await Promise.resolve();
 check(`${width}px exit removes a neighbour first while the main project remains visible`,()=>{const alpha=Number(f.slots[4].element.style.opacity);assert.ok(alpha>0&&alpha<1);assert.equal(Number(f.slots[0].element.style.opacity),1);assert.equal(Number(f.slots[1].element.style.opacity),1);assert.equal(exited,false);});
 f.drain();await exit;
 check(`${width}px handoff resolves only when all cards have left`,()=>{assert.equal(exited,true);assert.equal(f.frames.size,0);assert.ok(f.slots.every(slot=>Number(slot.element.style.opacity)===0));});
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
for(const width of [390,1280]){
 const f=fixture({width});f.enter();f.settled();f.drain();
 const exiting=f.leave();for(let i=0;i<8;i++)f.step();
 const alphas=f.slots.map(slot=>slot.element.style.opacity),poses=f.slots.map(slot=>slot.element.style.transform.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g).map(Number));
 f.settled();await exiting;
 check(`${width}px reversing an exit retains every currently painted card`,()=>{
  assert.deepEqual(f.slots.map(slot=>slot.element.style.opacity),alphas);
  f.slots.forEach((slot,index)=>slot.element.style.transform.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g).map(Number).forEach((value,key)=>assert.ok(Math.abs(value-poses[index][key])<1e-7)));
  assert.equal(f.frames.size,1);
 });
 f.drain();check(`${width}px reverse recovery settles without an obsolete exit or frame`,()=>{assert.equal(f.root.dataset.sectionExiting,undefined);assert.equal(Number(f.slots[0].element.style.opacity),1);});
 f.controller.abort();
}
{
 const f=fixture({gpu:true});f.enter();const pending=f.leave();await pending;
 f.images.forEach(image=>image.load());
 check('leaving before images are ready resolves immediately and cannot wake a stale sequence',()=>{assert.equal(f.frames.size,0);assert.equal(f.root.dataset.sectionExiting,undefined);});
 f.controller.abort();
}
check('replacing an outgoing request cannot accumulate extra travel on its cylinder',()=>{
 let pose=loopPose(1,1280,650);
 for(let i=0;i<20;i++){pose=loopDeparture(pose,.2,0,3,650,LOOP_ANGULAR_STEP);assert.ok(pose.angle>=LOOP_ANGULAR_STEP*(1-LOOP_CARD_TRAVEL)-1e-9);}
});
{
 const f=fixture();f.enter();f.settled();f.drain();const outgoing=f.leave();f.drain();await outgoing;
 f.settled();
 check('returning after the cards finish but before the panel swap restarts a gradual sequence',()=>{assert.equal(f.frames.size,1);assert.ok(f.slots.every(slot=>Number(slot.element.style.opacity)===0));});
 f.drain();f.controller.abort();
}
for(const gate of ['hidden','reduced','forced','abort','blur','pagehide','dialog']){
 const f=fixture();f.enter();f.settled();f.drain();const exiting=f.leave();
 if(gate==='hidden'){document.hidden=true;emit(document,'visibilitychange');}
 else if(gate==='abort')f.controller.abort();
 else if(gate==='blur'||gate==='pagehide')emit(window,gate);
 else if(gate==='dialog')f.control.setDialogOpen(true);
 else {f.media[gate].matches=true;emit(f.media[gate],'change');}
 await exiting;
 check(`${gate} settles a pending exit task and releases its frame`,()=>{assert.equal(f.frames.size,0);assert.equal(f.root.dataset.sectionExiting,undefined);});
 f.controller.abort();
}
{
 const f=fixture();f.enter();f.settled();f.drain();const exiting=f.leave();
 const event=new Event('wheel',{cancelable:true});Object.defineProperty(event,'deltaY',{value:180});f.nodes['.loop-viewport'].dispatchEvent(event);
 check('outgoing cards do not accept a new gallery gesture while navigation awaits them',()=>assert.equal(event.defaultPrevented,false));
 f.drain();await exiting;f.controller.abort();
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
 check('the outgoing gallery also avoids any whole-group opacity fade',()=>assert.equal(motions.length,0));
 reveal.destroy();
}
// Actual navigation + actual gallery: the next panel must wait for the cards.
for(const width of [390,1280]){
 const f=fixture({width}),home=new Element(),more=new Element(),marker=new Element();
 home.id='panel-home';more.id='panel-more';f.panel.id='panel-projects';
 const panels=[home,f.panel,more];panels.forEach(panel=>{panel.hidden=panel!==home;panel.querySelectorAll=()=>[];panel.querySelector=()=>panel===f.panel?f.root:null;panel.animate=()=>({finished:Promise.resolve(),cancel(){}});});
 const make=()=>{const element=new Element();element.children=[];element.replaceChildren=(...children)=>{element.children=children;};element.animate=()=>({finished:Promise.resolve(),cancel(){}});element.getBoundingClientRect=()=>({width:50,height:20,top:0,bottom:20,left:0});return element;};
 const tabs=['home','projects','more'].map((key,index)=>{const tab=make(),label=make();tab.dataset.tab=key;tab.offsetLeft=index*100;tab.offsetWidth=100;label.offsetWidth=50;label.textContent=key;tab.querySelector=()=>label;tab.querySelectorAll=()=>label.children;return tab;});
 marker.offsetWidth=8;marker.getBoundingClientRect=()=>({});
 document.querySelector=s=>({'.workspace':f.workspace,'.tab-art-marker':marker})[s];
 document.querySelectorAll=s=>s==='[data-tab]'?tabs:panels;document.createElement=make;
 f.workspace.scrollTo=()=>{};window.scrollTo=()=>{};window.innerHeight=900;
 globalThis.location={hash:'#projects'};globalThis.history={pushState(_state,_title,hash){location.hash=hash;}};
 globalThis.getComputedStyle=()=>({transform:'none',opacity:'1',clipPath:'none'});
 const oldMedia=globalThis.matchMedia,desktop=new EventTarget();desktop.matches=width>800;
 globalThis.matchMedia=q=>q.includes('min-width')?desktop:oldMedia(q);
 const nav=initSectionNavigation(f.controller.signal);f.drain();
 const change=nav.selectTab('more');await Promise.resolve();
 check(`${width}px navigation keeps Projects present while its cards leave`,()=>{assert.equal(f.panel.hidden,false);assert.equal(more.hidden,true);assert.equal(f.root.dataset.sectionExiting,'true');});
 for(let i=0;i<8;i++)f.step();await Promise.resolve();assert.equal(more.hidden,true);
 f.drain();await change;for(let i=0;i<5;i++)await Promise.resolve();
 check(`${width}px the next section commits only after the last project exits`,()=>{assert.equal(f.panel.hidden,true);assert.equal(more.hidden,false);assert.equal(f.frames.size,0);});
 await nav.selectTab('projects');for(let i=0;i<5;i++)await Promise.resolve();f.drain();
 const obsolete=nav.selectTab('more');for(let i=0;i<8;i++)f.step();
 const alpha=f.slots.map(slot=>slot.element.style.opacity);await nav.selectTab('projects');
 check(`${width}px rapid reverse navigation keeps the current card opacity`,()=>assert.deepEqual(f.slots.map(slot=>slot.element.style.opacity),alpha));
 f.drain();await obsolete;
 check(`${width}px an obsolete exit cannot switch back to the discarded destination`,()=>{assert.equal(f.panel.hidden,false);assert.equal(more.hidden,true);assert.equal(f.frames.size,0);});
 f.controller.abort();
}
console.log(`${passed.length} gallery sequence checks passed`);
