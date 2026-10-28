import assert from 'node:assert/strict';
import {setMaxListeners} from 'node:events';
import {readFileSync} from 'node:fs';
import {createEntryCounter} from '../src/entry-counter.js';
import {initEntryLoader} from '../src/entry-loader.js';
import {settleBeforeDeadline} from '../src/entry-readiness.js';
import {createEntryNumerals,numeralReels,entryCompletionPose,entryCompletionFrames} from '../src/entry-numerals.js';
import {entryWaveEdge,entryWaveFrames} from '../src/entry-reveal.js';
const NativeAbort=AbortController;
globalThis.AbortController=class extends NativeAbort{constructor(){super();setMaxListeners(0,this.signal);}};
const results=[];
const check=(name,fn)=>{fn();results.push(name);};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function clock(){let time=0,id=0;const frames=new Map();globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);return {get size(){return frames.size;},async step(ms=16){time+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));await flush();},async run(){for(let i=0;i<300&&frames.size;i++)await this.step();}};}
{
 const c=clock(),element={textContent:''},counter=createEntryCounter(element);
 check('starts at zero',()=>assert.equal(element.textContent,'0'));
 counter.target(50);const values=[];for(let i=0;i<180;i++){await c.step();values.push(+element.textContent);}
 check('monotonic asset-bound count',()=>assert.ok(values.every((v,i)=>v<=50&&(!i||v>=values[i-1]))));
 check('sleeps at readiness ceiling',()=>{assert.equal(element.textContent,'50');assert.equal(c.size,0);});
 counter.target(20);counter.target(NaN);await c.step();check('rejects backward and invalid progress',()=>assert.equal(element.textContent,'50'));
 counter.target(99);counter.pause(true);await c.step(10000);check('hidden counter pauses',()=>{assert.equal(element.textContent,'50');assert.equal(c.size,0);});
 counter.pause(false);await c.step();check('resume has no elapsed-time jump',()=>assert.ok(+element.textContent<=52));
 await c.run();check('99 is not completion',()=>assert.equal(element.textContent,'99'));
 counter.target(100);await c.run();check('completes exactly at 100',()=>assert.equal(element.textContent,'100'));assert.equal(await counter.done,true);counter.destroy();assert.equal(c.size,0);
 const aborted=createEntryCounter({});aborted.target(100);aborted.destroy();check('abort resolves counter wait',()=>assert.equal(c.size,0));assert.equal(await aborted.done,false);
 const snapElement={},snap=createEntryCounter(snapElement);snap.snap();snap.target(38);check('reduced motion still follows readiness',()=>assert.equal(snapElement.textContent,'38'));snap.destroy();
}
{
 const c=clock(),values=[],counter=createEntryCounter({}, {render:value=>values.push(value)});
 counter.target(99);await c.run();const start=values.length-1;
 counter.target(100);await c.run();assert.equal(await counter.done,true);
 check('99 to 100 completes continuously without the old final snap',()=>{
  const carry=values.slice(start);assert.equal(carry[0],99);assert.equal(carry.at(-1),100);
  assert.ok(carry.length>=19);assert.ok(carry.every((v,i)=>i===0||(v>=carry[i-1]&&v-carry[i-1]<.11)));
  assert.ok(carry.at(-1)-carry.at(-2)<.006);
 });
 counter.destroy();
 const resumedValues=[],resumed=createEntryCounter({}, {render:value=>resumedValues.push(value)});
 resumed.target(99);await c.run();resumed.target(100);await c.step();await c.step();
 const before=resumedValues.at(-1);resumed.pause(true);await c.step(10000);
 check('hidden final carry sleeps without resolving or advancing',()=>{assert.equal(resumedValues.at(-1),before);assert.equal(c.size,0);assert.ok(before<100);});
 resumed.pause(false);await c.step();
 check('final carry resumes locally rather than catching up hidden time',()=>{assert.ok(resumedValues.at(-1)>before&&resumedValues.at(-1)-before<.11);});
 resumed.destroy();
}
{
 const frames=entryWaveFrames();
 check('single wave has compatible native keyframes and full coverage endpoints',()=>{
  assert.equal(frames.length,33);assert.equal(frames[0].offset,0);assert.equal(frames.at(-1).offset,1);
  assert.ok(frames.every(frame=>frame.clipPath.split(',').length===35));
  for(let i=0;i<=32;i++){assert.ok(entryWaveEdge(0,i/32)>1);assert.ok(entryWaveEdge(1,i/32)<0);}
 });
 check('curved reveal edge travels one way without separate strips or reversals',()=>{
  for(let x=0;x<=32;x++)for(let t=1;t<=128;t++)assert.ok(entryWaveEdge(t/128,x/32)<entryWaveEdge((t-1)/128,x/32));
  const mid=Array.from({length:33},(_,i)=>entryWaveEdge(.5,i/32));
  assert.ok(Math.max(...mid)-Math.min(...mid)>.08);
  for(let i=1;i<32;i++)assert.ok(Math.abs(mid[i-1]-2*mid[i]+mid[i+1])<.005);
 });
}
let motions=[];
class Element extends EventTarget{
 dataset={};style={};attrs={};children=[];hidden=false;inert=false;textContent='';
 setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;this.textContent='';}
 get firstElementChild(){return this.children[0];}contains(node){return node===this||this.children.some(child=>child.contains(node));}
 focus(){document.activeElement=this;}blur(){document.activeElement=null;}remove(){this.removed=true;}
 animate(keyframes,options){const d=deferred();const m={keyframes,options,element:this,playState:'running',finished:d.promise,pause(){this.playState='paused';},play(){this.playState='running';},finish(){this.playState='finished';d.resolve();},cancel(){this.playState='idle';d.resolve();}};motions.push(m);return m;}
}
{
 const c=clock();globalThis.document={createElement:()=>new Element()};
 const element=new Element(),paint=createEntryNumerals(element);paint(0);
 check('three cached reels start with only a centered zero',()=>{
  assert.equal(element.children[0].children.length,3);assert.equal(element.children[0].children[0].children[0].children.length,11);
  assert.deepEqual(numeralReels(0).map(r=>r.opacity),[0,0,1]);assert.equal(element.style.transform,'translateX(-0.58em)');
 });
 const [group,terminal]=element.children,terminalTrack=terminal.children[0];
 check('0 through 98 retains the existing separate reels and centering',()=>{
  for(const value of [0,9.5,38.5,98.75]){
   paint(value);const states=numeralReels(value);
   assert.equal(group.style.visibility,'visible');assert.equal(terminal.style.visibility,'hidden');
   states.forEach((state,index)=>assert.equal(group.children[index].children[0].style.transform,`translate3d(0,${-state.position*1.05}em,0)`));
  }
 });
 check('99 to 100 rolls one complete centered row with no leading-digit fade',()=>{
  assert.deepEqual(terminalTrack.children.map(row=>row.children.map(glyph=>glyph.textContent).join('')),['99','100']);
  for(const [value,offset] of [[99,0],[99.5,-.525],[100,-1.05]]){
   paint(value);assert.equal(group.style.visibility,'hidden');assert.equal(terminal.style.visibility,'visible');
   assert.equal(element.style.transform,'translateX(0em)');assert.equal(terminalTrack.style.transform,`translate3d(0,${offset}em,0)`);
  }
 });
 check('the last carry recedes and arrives as intact centered words',()=>{
  paint(99);assert.equal(terminalTrack.children[0].style.transform,entryCompletionPose(99).outgoing);
  paint(99.5);assert.equal(terminalTrack.children[0].style.transform,entryCompletionPose(99.5).outgoing);
  assert.equal(terminalTrack.children[1].style.transform,entryCompletionPose(99.5).incoming);
  assert.ok(terminalTrack.children[0].style.transform.includes('rotateX(-18deg)'));
  assert.ok(terminalTrack.children[1].style.transform.includes('rotateX(18deg)'));
  assert.equal(paint.completion,terminalTrack.children[1]);
 });
 check('the landing starts and ends at the exact completed numeral pose',()=>{
  paint(100);const frames=entryCompletionFrames();
  assert.equal(frames[0].transform,paint.completion.style.transform);
  assert.equal(frames.at(-1).transform,paint.completion.style.transform);
  assert.ok(frames.every(frame=>!('filter' in frame)&&!('opacity' in frame)&&!('width' in frame)&&!('color' in frame)));
 });
 check('final carry poses stay bounded and never mirror or turn the numeral sideways',()=>{
  for(let i=0;i<=1000;i++){
   const pose=entryCompletionPose(99+i/1000);
   for(const transform of [pose.outgoing,pose.incoming]){
    const turn=Number(transform.match(/rotateX\(([^d]+)/)[1]);assert.ok(Math.abs(turn)<=36);
    const scales=transform.match(/scale\(([^)]+)/)[1].split(',').map(Number);assert.ok(scales.every(scale=>scale>=.93&&scale<=1));
   }
  }
 });
 check('carry moves only at the end of its unit',()=>{
  assert.equal(numeralReels(38.5)[1].position,3);
  assert.equal(numeralReels(39.5)[1].position,3.5);
  assert.equal(numeralReels(40)[1].position,4);
  assert.deepEqual(numeralReels(99.5).map(r=>r.position),[.5,9.5,9.5]);
 });
 check('all fractional progress has bounded reel positions and visibility',()=>{
  for(let n=0;n<=10000;n++)for(const reel of numeralReels(n/100)){
   assert.ok(Number.isFinite(reel.position)&&reel.position>=0&&reel.position<10);
   assert.ok(reel.opacity>=0&&reel.opacity<=1);
  }
  for(const invalid of [NaN,Infinity,-1])assert.deepEqual(numeralReels(invalid),numeralReels(0));
 });
 const nodes=[...element.children],values=[];
 const counter=createEntryCounter(element,{render(value){values.push(value);paint(value);}});
 counter.target(40);await c.run();
 check('counter drives continuous reels without rebuilding glyphs',()=>{
  assert.ok(values.some(v=>v!==Math.floor(v)));assert.equal(element.dataset.value,'40');
  assert.deepEqual(element.children,nodes);assert.equal(c.size,0);
 });
 counter.target(100);await c.run();await counter.done;
 check('100 finishes on exact centered digits before transition',()=>{
  assert.deepEqual(numeralReels(100),[{position:1,opacity:1},{position:0,opacity:1},{position:0,opacity:1}]);
  assert.equal(element.dataset.value,'100');assert.equal(element.style.transform,'translateX(0em)');
 });
 counter.destroy();const count=values.length;counter.target(99);await c.step();
 check('destroy releases numeral updates with the counter frame owner',()=>{assert.equal(values.length,count);assert.equal(c.size,0);});
}
function emit(target,type,properties={}){const e=new Event(type,{cancelable:true});Object.assign(e,properties);target.dispatchEvent(e);return e;}
function setup({reduced=false,compact=false,noAnimation=false,pending=false}={}){
 motions=[];const c=clock(),asset=deferred();
 const doc=new EventTarget();globalThis.document=doc;doc.documentElement=new Element();doc.documentElement.dataset.entry='loading';doc.hidden=false;
 globalThis.window=new EventTarget();window.innerHeight=900;window.innerWidth=compact?390:1440;
 const media=new EventTarget();media.matches=reduced;globalThis.matchMedia=q=>q.includes('reduced')?media:{matches:!compact};
 const names=Object.fromEntries(['#entry-loader','.portfolio','.workspace > .panels','.figure-wrap','#name','#handle','#profile-role','#tabs','#tabs [aria-selected=true]'].map(s=>[s,new Element()]));
 const stage=names['#entry-loader'],page=names['.portfolio'];
 const internals=Object.fromEntries(['#entry-number','#entry-progress','#entry-status','#entry-announcement','.entry-surface','.entry-counter'].map(s=>[s,new Element()]));
 stage.append(...Object.values(internals));stage.querySelector=s=>internals[s];doc.querySelector=s=>names[s];doc.querySelectorAll=()=>[];doc.createElement=()=>new Element();
 doc.fonts={ready:Promise.resolve(),load:()=>Promise.resolve()};if(noAnimation)stage.animate=undefined;
 let releases=0,reveals=0,settles=0;window.__portfolioEntry={release(reason){releases++;doc.documentElement.dataset.entry='ready';doc.documentElement.dataset.reason=reason;}};
 const abort=new AbortController(),content=deferred(),entry=initEntryLoader({signal:abort.signal});
 const run=entry.start({figureReady:pending?asset.promise:Promise.resolve(),revealContent(){reveals++;return content.promise;},settleContent(){settles++;content.resolve();}});
 return {c,asset,doc,stage,page,media,abort,run,content,names,...internals,get releases(){return releases;},get reveals(){return reveals;},get settles(){return settles;},async count(){await flush();await c.run();},async reveal(){await this.count();motions.filter(m=>m.playState==='running').forEach(m=>m.finish());await flush();},async finish(){motions.forEach(m=>m.finish());content.resolve();await run;}};
}
{
 const f=setup({pending:true});await f.count();
 check('assets block completion and interaction',()=>{assert.ok(+f['#entry-number'].dataset.value<100);assert.equal(f.reveals,0);assert.equal(f.page.inert,true);});
 f.asset.resolve();await f.count();
 check('100 gets an explicit hold',()=>{assert.equal(f['#entry-number'].dataset.value,'100');assert.equal(f.stage.dataset.phase,'hold');assert.equal(f.reveals,0);assert.equal(motions.at(-1).options.duration,220);});
 check('the existing confirmation animates the real 100 row rather than an empty stage',()=>{
  const row=f['#entry-number'].children[1].children[0].children[1];
  assert.equal(motions.at(-1).element,row);assert.deepEqual(motions.at(-1).keyframes,entryCompletionFrames());
  assert.equal(row.children.map(glyph=>glyph.textContent).join(''),'100');
 });
 const completedReels=[...f['#entry-number'].children];
 await f.reveal();
 check('the exact completed numeral reels survive the content handoff',()=>{
  assert.equal(f.reveals,1);assert.equal(f.stage.dataset.phase,'reveal');
  assert.ok(f['#entry-number'].children.every((node,index)=>node===completedReels[index]));assert.equal(f['#entry-number'].style.transform,'translateX(0em)');
 });
 check('one native curved surface replaces all shutter elements',()=>{
  assert.equal(f['.entry-surface'].children.length,0);
  const fields=motions.filter(m=>m.element===f['.entry-surface']);assert.equal(fields.length,1);
  assert.deepEqual(fields[0].keyframes,entryWaveFrames());
  assert.equal(motions.filter(m=>m.element.className==='entry-shutter').length,0);
 });
 check('100 leaves as one intact numeral without scaling or outline conversion',()=>{
  const exit=motions.find(m=>m.element===f['.entry-counter']);assert.ok(exit);
  assert.equal(exit.keyframes[0].transform,'translate3d(0,0,0)');assert.equal(exit.keyframes.at(-1).opacity,0);
  assert.ok(exit.keyframes.every(frame=>!frame.transform.includes('scale')&&!('color' in frame)));
  assert.equal(motions.filter(m=>completedReels.includes(m.element)).length,0);
 });
 f.doc.hidden=true;emit(f.doc,'visibilitychange');check('hidden reveal pauses native motions',()=>assert.ok(motions.filter(m=>m.playState!=='finished').every(m=>m.playState==='paused')));
 f.doc.hidden=false;emit(f.doc,'visibilitychange');
 const tab=emit(f.doc,'keydown',{key:'Tab'});check('keyboard stays within loading stage',()=>assert.equal(tab.defaultPrevented,true));
 await f.finish();check('completion releases all ownership',()=>{assert.equal(f.page.inert,false);assert.equal(f.releases,1);assert.equal(f.stage.removed,true);assert.equal(f.c.size,0);assert.ok(motions.every(m=>m.playState==='idle'));assert.equal(f.doc.activeElement,f.names['#tabs [aria-selected=true]']);});
}
for(const option of [{reduced:true},{noAnimation:true}]){
 const f=setup({...option,pending:true});await flush();assert.equal(f.releases,0);f.asset.resolve();await f.run;
 check(`${Object.keys(option)[0]} opens only after readiness`,()=>{assert.equal(f.releases,1);assert.equal(f.reveals,0);assert.equal(f.page.inert,false);assert.equal(motions.length,0);});
}
for(const phase of ['count','hold','reveal'])for(const interruption of ['abort','resize','deadline','restore','reduced']){
 const f=setup({pending:phase==='count'});if(phase==='hold')await f.count();if(phase==='reveal')await f.reveal();
 if(interruption==='abort')f.abort.abort();
 if(interruption==='resize')emit(window,'resize');
 if(interruption==='deadline')emit(f.doc,'portfolio:entryfallback');
 if(interruption==='restore')emit(window,'pageshow',{persisted:true});
 if(interruption==='reduced'){f.media.matches=true;emit(f.media,'change');}
 if(phase==='count'&&['resize','reduced'].includes(interruption)){assert.equal(f.releases,0);f.asset.resolve();}
 await f.run;check(`${interruption} during ${phase} cleans and unlocks`,()=>{assert.equal(f.releases,1);assert.equal(f.page.inert,false);assert.equal(f.c.size,0);assert.ok(motions.every(m=>m.playState==='idle'));});
}
{
 for(const compact of [false,true]){
  const f=setup({compact});await f.reveal();
  check(`${compact?'compact':'desktop'} portrait entrance preserves the overflowing oval`,()=>{
   const entrance=motions.find(m=>m.element===f.names['.figure-wrap']);
   assert.ok(entrance);assert.equal(entrance.keyframes.at(0).opacity,0);assert.equal(entrance.keyframes.at(-1).opacity,1);
   assert.ok(entrance.keyframes.every(frame=>!('clipPath' in frame)&&!('height' in frame)&&!('overflow' in frame)));
   assert.equal(entrance.keyframes.at(-1).transform,'translateY(0)');
  });
  if(compact)check('compact transition scales timing',()=>assert.equal(motions.find(m=>m.element===f['.entry-surface']).options.duration,1024));
  await f.finish();
 }
 const ac=new AbortController();const waiting=settleBeforeDeadline(new Promise(()=>{}),1000,ac.signal);ac.abort();assert.equal((await waiting).reason,'aborted');
 check('readiness rejects and deadlines settle',()=>assert.ok(true));assert.equal((await settleBeforeDeadline(Promise.reject(Error()),10,new AbortController().signal)).reason,'error');assert.equal((await settleBeforeDeadline(new Promise(()=>{}),1,new AbortController().signal)).reason,'timeout');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');const stage=html.slice(html.indexOf('<section id="entry-loader"'),html.indexOf('</section>'));
 check('only numeric loader visual, accessible progress retained',()=>{assert.ok(stage.includes('id="entry-number">0'));assert.ok(stage.includes('role="progressbar"'));assert.ok(!/canvas|<svg|entry-scene|Skip animation/.test(stage));assert.ok(/},\s*12000\s*\)/.test(html));});
}
console.log(`${results.length} numeric entry checks passed`);
