// Controller regression for touch's implicit capture and bubbled capture loss.
// This is not a browser or physical-device test.
import assert from 'node:assert/strict';
import {setMaxListeners} from 'node:events';
import {initProjectGallery} from '../src/project-gallery.js';

class Element extends EventTarget {
  dataset={}; style={}; attrs={}; hidden=false; captures=new Set(); textContent='';
  setAttribute(key,value){this.attrs[key]=value;}
  getAttribute(key){return this.attrs[key];}
  getBoundingClientRect(){return {width:390,height:510,left:0,top:0};}
  setPointerCapture(id){this.captures.add(id);}
  hasPointerCapture(id){return this.captures.has(id);}
  releasePointerCapture(id){this.captures.delete(id);}
  focus(){document.activeElement=this;}
}
const emit=(element,type,props={})=>{
  const event=new Event(type,{cancelable:true});
  for(const [key,value] of Object.entries(props))Object.defineProperty(event,key,{value});
  element.dispatchEvent(event);return event;
};
let next=0,time=0;
const frames=new Map();
globalThis.requestAnimationFrame=fn=>{frames.set(++next,fn);return next;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
const settle=()=>{
  for(let i=0;i<400&&frames.size;i++){
    time+=16;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(time));
  }
  assert.equal(frames.size,0,'gallery must return to idle');
};
globalThis.document=new EventTarget();
document.hidden=false;document.documentElement={dataset:{entry:'ready'}};
globalThis.window=new EventTarget();
const reduced=new EventTarget(),forced=new EventTarget(),compact=new EventTarget();
reduced.matches=false;forced.matches=false;compact.matches=true;
globalThis.matchMedia=query=>query.includes('reduced')?reduced:query.includes('forced')?forced:compact;
const root=new Element(),panel=new Element(),workspace=new Element(),track=new Element();
workspace.setAttribute('aria-busy','false');
const nodes=Object.fromEntries(['.loop-viewport','.loop-caption','.loop-controls','.loop-fallback','.loop-open','.loop-kind','.loop-title','.loop-status','.loop-announcement'].map(key=>[key,new Element()]));
const viewport=nodes['.loop-viewport'];
const slots=Array.from({length:5},()=>{
  const element=new Element(),button=new Element(),image=new Element();
  element.querySelector=selector=>selector==='button'?button:image;return element;
});
root.querySelector=selector=>nodes[selector];root.querySelectorAll=()=>slots;
document.querySelector=selector=>({'.loop-gallery':root,'#panel-projects':panel,'.workspace':workspace})[selector];
const controller=new AbortController();setMaxListeners(0,controller.signal);
const opened=[];
initProjectGallery({signal:controller.signal,projects:[0,1,2].map(id=>({name:`Project ${id}`,image:`/project-${id}.svg`,type:'test'})),onOpen:index=>opened.push(index)});
settle();
const point=(id,x,y,t,extra={})=>({pointerId:id,pointerType:'touch',button:0,isPrimary:true,clientX:x,clientY:y,timeStamp:t,...extra});
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};

document.documentElement.dataset.themeControlOpen='true';emit(document,'portfolio:themecontrol');
emit(viewport,'pointerdown',point(30,180,400,0));
const underGlassStart=slots[0].style.transform;
check('projects can be swiped behind the open theme glass',()=>{
  assert.equal(emit(viewport,'pointermove',point(30,180,200,20)).defaultPrevented,true);
  settle();assert.notEqual(slots[0].style.transform,underGlassStart);
});
emit(viewport,'pointerup',point(30,180,200,100));settle();
const underGlassWheelStart=slots[0].style.transform;
check('wheel input works behind the open glass and returns to idle',()=>{
  assert.equal(emit(viewport,'wheel',{deltaY:240,deltaX:0}).defaultPrevented,true);
  settle();assert.notEqual(slots[0].style.transform,underGlassWheelStart);assert.equal(frames.size,0);
});
document.documentElement.dataset.themeControlOpen='false';emit(document,'portfolio:themecontrol');settle();

emit(viewport,'pointerdown',point(7,180,400,0,{target:track}));
emit(viewport,'pointermove',point(7,180,360,20));settle();
const before=slots[0].style.transform;
// Touch originally captures the child implicitly. Transferring capture to
// viewport emits this bubbling event before the next move reaches viewport.
emit(viewport,'lostpointercapture',{pointerId:7,target:track});
const continuing=emit(viewport,'pointermove',point(7,180,220,40));settle();
check('child capture transfer does not cancel a touch swipe',()=>{
  assert.equal(continuing.defaultPrevented,true,'touch must continue after child lostpointercapture');
  assert.notEqual(slots[0].style.transform,before);
  assert.equal(viewport.dataset.dragging,'true');
});
emit(viewport,'lostpointercapture',{pointerId:99,target:viewport});
check('another pointer cannot cancel the active swipe',()=>{
  assert.equal(emit(viewport,'pointermove',point(7,180,190,60)).defaultPrevented,true);settle();
});
// A stale capture event may arrive while the viewport already owns capture.
emit(viewport,'lostpointercapture',{pointerId:7,target:viewport});
check('stale loss does not cancel capture the viewport still owns',()=>{
  assert.equal(emit(viewport,'pointermove',point(7,180,170,80)).defaultPrevented,true);settle();
});
emit(viewport,'pointerup',point(7,180,170,200));settle();
check('release clears capture and blocks the drag-generated click',()=>{
  emit(slots[0].querySelector('button'),'click');
  assert.equal(opened.length,0);assert.equal(viewport.captures.size,0);assert.equal(viewport.dataset.dragging,undefined);
});

emit(viewport,'pointerdown',point(8,180,400,300));
emit(viewport,'pointermove',point(8,180,280,320));settle();
const forward=slots[0].style.transform;
emit(viewport,'lostpointercapture',{pointerId:8,target:track});
emit(viewport,'pointermove',point(8,180,370,360));settle();
check('vertical swipe survives transfer and immediately reverses',()=>assert.notEqual(slots[0].style.transform,forward));
viewport.captures.delete(8);
emit(viewport,'lostpointercapture',{pointerId:8,target:viewport});
check('real loss of the active viewport capture cancels cleanly',()=>{
  assert.equal(viewport.dataset.dragging,undefined);
  assert.equal(emit(viewport,'pointermove',point(8,180,200,400)).defaultPrevented,false);settle();
});

emit(viewport,'pointerdown',point(9,180,280,500));
emit(viewport,'pointerup',point(9,180,280,520));
emit(slots[0].querySelector('button'),'click');
check('an ordinary tap still opens a project',()=>assert.equal(opened.length,1));
const horizontalStart=slots[0].style.transform;
emit(viewport,'pointerdown',point(10,280,280,600));
const sideways=emit(viewport,'pointermove',point(10,80,281,620));
emit(viewport,'pointerup',point(10,80,281,700));settle();
check('mobile sideways swipes do not move the vertical reel',()=>{
  assert.equal(sideways.defaultPrevented,false);assert.equal(slots[0].style.transform,horizontalStart);
});
const horizontalWheel=emit(viewport,'wheel',{deltaX:240,deltaY:0});settle();
check('mobile horizontal wheel input is ignored',()=>{
  assert.equal(horizontalWheel.defaultPrevented,false);assert.equal(slots[0].style.transform,horizontalStart);
});
check('zoom gestures remain available',()=>assert.equal(emit(viewport,'wheel',{ctrlKey:true,deltaY:100}).defaultPrevented,false));
controller.abort();
check('abort releases handlers and pending work',()=>{
  assert.equal(frames.size,0);assert.equal(emit(viewport,'pointermove',point(9,30,280,600)).defaultPrevented,false);
});
console.log(`${checks.length} touch capture regression checks passed`);
