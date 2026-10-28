// Event/frame fixture: tracking convergence, batching and lifecycle only.
// Rendered contrast and perceived motion require the live browser review.
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { initPointerGuides } from '../src/pointer-guides.js';
class Element extends EventTarget {
  children=[]; dataset={}; attributes=new Map(); hidden=false;
  style={setProperty(key,value){this[key]=value;}};
  setAttribute(key,value){this.attributes.set(key,value);}
  append(...children){children.forEach(child=>{child.parent=this;this.children.push(child);});}
  remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
}
const fine=new EventTarget(), reduced=new EventTarget(), forced=new EventTarget();
fine.matches=true;reduced.matches=false;forced.matches=false;
globalThis.window=new EventTarget();window.devicePixelRatio=1;
globalThis.document=new EventTarget();document.hidden=false;
document.body=new Element();document.documentElement={dataset:{entry:'ready'}};
let modal=false;
document.querySelector=()=>modal?{}:null;document.createElement=()=>new Element();
globalThis.matchMedia=query=>query.includes('forced')?forced:query.includes('reduced')?reduced:fine;
let serial=0,clock=0;
const frames=new Map();
globalThis.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
function step(){clock+=16;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(clock));}
function settle(){let count=0;while(frames.size&&count++<80)step();assert.equal(frames.size,0,'tracking must return to idle');return count;}
const emit=(element,type,properties={})=>{
  const event=new Event(type);for(const [key,value]of Object.entries(properties))Object.defineProperty(event,key,{value});
  element.dispatchEvent(event);
};
const move=(properties={})=>emit(window,'pointermove',{pointerType:'mouse',clientX:220,clientY:120,target:{closest:()=>null},...properties});
const abort=new AbortController();setMaxListeners(0,abort.signal);
const hide=initPointerGuides(abort.signal),root=document.body.children[0];
const [horizontal,vertical]=root.children;
const focusHorizontal=horizontal.children[0],focusVertical=vertical.children[0];
const checks=[];const check=(name,fn)=>{fn();checks.push(name);};
check('two axes own their accents and remain outside accessibility',()=>{
  assert.equal(root.hidden,true);assert.equal(root.attributes.get('aria-hidden'),'true');assert.equal(root.children.length,2);
  assert.equal(focusHorizontal.parent,horizontal);assert.equal(focusVertical.parent,vertical);
});
document.documentElement.dataset.entry='loading';move();
check('entry loading prevents decoration and frame work',()=>{assert.equal(root.hidden,true);assert.equal(frames.size,0);});
document.documentElement.dataset.entry='ready';move({clientX:0,clientY:0});
check('first movement appears at the pointer without sweeping in from an old point',()=>{
  assert.equal(horizontal.style.transform,'translate3d(0, 0px, 0)');
  assert.equal(vertical.style.transform,'translate3d(0px, 0, 0)');assert.equal(frames.size,0);assert.equal(root.hidden,false);
});
move({clientX:640.5,clientY:350.25});
check('new movement schedules one follow frame without jumping the visible guides',()=>{
  assert.equal(vertical.style.transform,'translate3d(0px, 0, 0)');assert.equal(frames.size,1);
});
step();
check('the follow frame advances smoothly between the old and new positions',()=>{
  const x=Number(vertical.style.transform.match(/\(([^p]+)/)[1]);assert.ok(x>0&&x<640);
  assert.equal(root.dataset.moving,'true');assert.ok(Number(focusHorizontal.style['--guide-stretch'])>1);
});
for(let i=0;i<200;i++)move({clientX:800+i,clientY:400});
check('a burst of input coalesces into a single active frame chain',()=>assert.equal(frames.size,1));
const count=settle();
check('stopping converges to the latest pointer and leaves zero idle frames',()=>{
  assert.equal(vertical.style.transform,'translate3d(999px, 0, 0)');assert.equal(horizontal.style.transform,'translate3d(0, 400px, 0)');
  assert.equal(root.dataset.moving,'false');assert.ok(count<40);
});
check('child accents share their axes without a second perpendicular offset',()=>{
  assert.equal(focusHorizontal.style.transform,'translate3d(999px, 0, 0)');
  assert.equal(focusVertical.style.transform,'translate3d(0, 400px, 0)');
});
move({target:{closest:selector=>selector==='.social-link'||selector==='[data-type-play]'?null:{}}});settle();
check('hovering an interactive element enables the restrained tick expansion',()=>assert.equal(root.dataset.interactive,'true'));
check('ordinary controls keep their existing guide response',()=>assert.equal(root.dataset.contact,'false'));
move({target:{closest:selector=>selector==='[data-type-play]'?null:{}}});settle();
check('social links signal the quiet contact treatment without hiding tracking',()=>{
  assert.equal(root.dataset.contact,'true');assert.equal(root.dataset.interactive,'true');assert.equal(root.hidden,false);
});
move();settle();
check('leaving a social link restores the normal guide treatment',()=>assert.equal(root.dataset.contact,'false'));
move({clientX:650});move({target:{closest:selector=>selector==='[data-type-play]'?{}:null}});
check('the letter playground hides guides and cancels tracking only within its own surface',()=>{assert.equal(root.hidden,true);assert.equal(frames.size,0);});
move();
check('leaving the playground restores normal pointer guides',()=>assert.equal(root.hidden,false));
emit(window,'pointerdown',{pointerType:'mouse',button:0});
check('primary press enables the local tick response',()=>assert.equal(root.dataset.pressed,'true'));
emit(window,'pointerup');
check('release clears pressure without hiding the guides',()=>{assert.equal(root.dataset.pressed,'false');assert.equal(root.hidden,false);});
move({clientX:800});emit(document,'pointerout',{relatedTarget:null});
check('leaving cancels pending tracking and hides decoration',()=>{assert.equal(root.hidden,true);assert.equal(frames.size,0);});
move({clientX:400,clientY:300});emit(document,'pointerout',{relatedTarget:{}});
check('moving between page elements leaves the guides visible',()=>assert.equal(root.hidden,false));
move({pointerType:'touch'});
check('touch removes a previous mouse decoration and pending work',()=>{assert.equal(root.hidden,true);assert.equal(frames.size,0);});
move();emit(window,'pointerdown',{pointerType:'touch'});
check('hybrid-device touch contact hides the mouse guides',()=>assert.equal(root.hidden,true));
fine.matches=false;move();
check('coarse-only input performs no tracking',()=>{assert.equal(root.hidden,true);assert.equal(frames.size,0);});
fine.matches=true;forced.matches=true;move();
check('forced colors suppresses rendering and animation work',()=>{assert.equal(root.hidden,true);assert.equal(frames.size,0);});
forced.matches=false;reduced.matches=true;emit(reduced,'change');move();move({clientX:250,clientY:125});
check('reduced motion tracks directly with no trailing frame chain',()=>{
  assert.equal(vertical.style.transform,'translate3d(250px, 0, 0)');assert.equal(horizontal.style.transform,'translate3d(0, 125px, 0)');assert.equal(frames.size,0);
});
window.devicePixelRatio=2;move({clientX:250,clientY:125});
check('high-DPI strokes align to device pixels',()=>assert.equal(vertical.style.transform,'translate3d(249.5px, 0, 0)'));
for(const dpr of [1,1.25,1.5,2,3]){
  window.devicePixelRatio=dpr;move({clientX:251.375,clientY:126.625});
  check(`axes and nested accents retain one origin at DPR ${dpr}`,()=>{
    const x=Number(vertical.style.transform.match(/\(([^p]+)/)[1]);
    const y=Number(horizontal.style.transform.match(/, ([^p]+)/)[1]);
    assert.ok(Math.abs(x*dpr-Math.round(x*dpr))<.002);
    assert.ok(Math.abs(y*dpr-Math.round(y*dpr))<.002);
    assert.equal(focusHorizontal.style.transform,`translate3d(${x}px, 0, 0)`);
    assert.equal(focusVertical.style.transform,`translate3d(0, ${y}px, 0)`);
  });
}
window.devicePixelRatio=1;reduced.matches=false;emit(reduced,'change');
for(const [element,type,props]of [[document,'keydown',{key:'Tab'}],[window,'blur',{}],[window,'resize',{}],[window,'pagehide',{}],[document,'pointercancel',{}],[fine,'change',{}]]){
  move();move({clientX:600});emit(element,type,props);
  check(`${type} clears active tracking and transient states`,()=>{
    assert.equal(root.hidden,true);assert.equal(frames.size,0);assert.equal(root.dataset.pressed,'false');
  });
}
document.hidden=true;move();
check('a hidden page has no cursor work',()=>{assert.equal(root.hidden,true);assert.equal(frames.size,0);});
document.hidden=false;modal=true;move();
check('a project dialog suppresses the decoration',()=>assert.equal(root.hidden,true));
modal=false;move();move({clientX:900});hide();
check('the existing dialog owner can hide guides immediately',()=>{assert.equal(root.hidden,true);assert.equal(frames.size,0);});
move({clientX:NaN});
check('invalid coordinates never reach CSS',()=>assert.equal(root.hidden,true));
move();move({clientX:900});abort.abort();move();
check('abort removes DOM/listeners and cancels the finite frame chain',()=>{
  assert.equal(document.body.children.length,0);assert.equal(frames.size,0);assert.equal(root.hidden,true);
});
const stopped=new AbortController();stopped.abort();initPointerGuides(stopped.signal);
check('an already-aborted owner creates no decoration',()=>assert.equal(document.body.children.length,0));
console.log(JSON.stringify({mode:'Event/frame fixture, not physical-device FPS',passed:checks.length,checks},null,2));
