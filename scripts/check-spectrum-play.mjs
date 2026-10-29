// Real model, drawing-command and controller lifecycle fixtures; not browser FPS.
import assert from 'node:assert/strict';
import {setMaxListeners} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createSpectrumField,clearSpectrum,pulseSpectrum,stepSpectrum,spectrumGeometry} from '../src/spectrum-field.js';
import {initSpectrumPlay} from '../src/spectrum-play.js';
const checks=[],check=(name,test)=>{test();checks.push(name);};
for(const [width,height] of [[220,86],[300,144],[470,390],[780,900]]) {
 check(width+'px spectrum has bounded bars inside its drawing area',()=>{
  const f=createSpectrumField(width,height);assert.ok(f.bars.length>=20&&f.bars.length<=56);
  for(let n=0;n<600;n++) {if(n%10===0)pulseSpectrum(f,(n%7)/6,.5,3);stepSpectrum(f,1/60);
   assert.ok(f.bars.every(b=>Number.isFinite(b.value)&&b.value>=0&&b.value<=1&&b.peak<=1));
   assert.ok(spectrumGeometry(f).every(b=>b.x>=0&&b.x+b.width<=width&&b.y>=0&&b.peakY>=0&&b.baseline+5+Math.min(height*.12,b.height*.2)<height));
  }
 });
 check(width+'px rhythm advances and user input affects nearby bands',()=>{
  const a=createSpectrumField(width,height),b=createSpectrumField(width,height),rest=a.bars.map(v=>v.value);
  pulseSpectrum(a,.5,.5,3);stepSpectrum(a,1/60);stepSpectrum(b,1/60);
  assert.notDeepEqual(a.bars.map(v=>v.value),rest);assert.ok(a.bars.some((v,i)=>v.value>b.bars[i].value));
  assert.equal(pulseSpectrum(a,NaN,Infinity),false);assert.equal(stepSpectrum(a,900),3);
  clearSpectrum(a);assert.equal(a.clock,0);assert.ok(a.bars.every(v=>v.impulse===0));
 });
}
check('equal elapsed time at 30 and 60Hz yields the same rhythm',()=>{
 const a=createSpectrumField(300,180),b=createSpectrumField(300,180);
 for(let n=0;n<60;n++)stepSpectrum(a,1/60);for(let n=0;n<30;n++)stepSpectrum(b,1/30);
 assert.deepEqual(a.bars,b.bars);
});
class Element extends EventTarget {
  dataset = {}; hidden = false; children = []; textContent = ''; captures = new Set();
  style = { setProperty(key, value) { this[key] = value; } };
  rect = { left: 100, top: 400, width: 280, height: 150 };
  getBoundingClientRect() { return { ...this.rect }; }
  contains(element) { return element === this || this.children.some(child => child.contains(element)); }
  focus() { document.activeElement = this; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); emit(this, 'lostpointercapture', { pointerId: id }); }
}
let draws = 0, lastDrawing = null, canvasUnavailable = false;
class Canvas extends Element {
  context = { globalAlpha: 1, setTransform() {}, clearRect() { draws++; lastDrawing=[]; },
    strokeRect() {}, fillRect(x,y,w,h) { lastDrawing.push([x,y,w,h,this.fillStyle,this.globalAlpha]); } };
  getContext() { return canvasUnavailable ? null : this.context; }
}
const root = new Element(), board = new Element(), canvas = new Canvas(), status = new Element(), toggle = new Element(), dialog = new Element();
root.hidden = true; root.children = [board]; board.children = [canvas]; dialog.open = false;
root.querySelector = selector => new Map([['[data-spectrum-board]', board], ['canvas', canvas], ['[data-spectrum-status]', status]]).get(selector) ?? null;
const desktop = new EventTarget(), reduced = new EventTarget(), forced = new EventTarget(); desktop.matches = true; reduced.matches = forced.matches = false;
globalThis.window = new EventTarget(); window.devicePixelRatio = 1;
globalThis.document = new EventTarget(); document.hidden = false; document.activeElement = null; document.documentElement = { dataset: { entry: 'loading', theme: 'dark' } };
document.querySelector = selector => new Map([['[data-spectrum-play]', root], ['#project-detail', dialog], ['#theme-toggle', toggle]]).get(selector) ?? null;
document.createElement = () => new Canvas();
globalThis.getComputedStyle = () => ({ color: document.documentElement.dataset.theme === 'light' ? '#ffffff' : '#f5f4ed', getPropertyValue: () => document.documentElement.dataset.theme === 'light' ? '#b5320a' : '#f07146' });
globalThis.matchMedia = query => query.includes('min-width') ? desktop : query.includes('forced') ? forced : reduced;
const observers = [];
class Observer { constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } fire(entries = []) { if (!this.disconnected) this.callback(entries); } }
globalThis.ResizeObserver = class extends Observer {}; globalThis.IntersectionObserver = class extends Observer {}; globalThis.MutationObserver = class extends Observer {};
let serial = 0, clock = 0; const frames = new Map();
globalThis.performance = { now: () => clock };
globalThis.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; }; globalThis.cancelAnimationFrame = id => frames.delete(id);
function step(ms = 1000 / 60) { clock += ms; const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(clock)); }
function emit(element, type, properties = {}) { const event = new Event(type, { cancelable: true }); for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value }); element.dispatchEvent(event); return event; }
const click = (target = board, detail = 1) => emit(target, 'click', { detail, clientX: 240, clientY: 475 });
const move = (x, y, id = 7, pointerType = 'mouse') => emit(board, 'pointermove', { pointerId: id, pointerType, clientX: x, clientY: y });
const down = (id = 7) => emit(board, 'pointerdown', { pointerId: id, button: 0, isPrimary: true, clientX: 240, clientY: 475 });

const abort=new AbortController();setMaxListeners(0,abort.signal);initSpectrumPlay(abort.signal);
check('entry has a static spectrum and no running clock',()=>{assert.equal(frames.size,0);assert.ok(draws>0);});
document.documentElement.dataset.entry='ready';emit(document,'portfolio:entryready');
check('ready starts exactly one visible rhythmic owner',()=>assert.equal(frames.size,1));
const before=structuredClone(lastDrawing),beforeDraw=draws;for(let n=0;n<120;n++)step();
check('the synthetic rhythm changes real bar commands with a 30Hz drawing cap',()=>{
 assert.notDeepEqual(lastDrawing,before);assert.ok(draws-beforeDraw>=58&&draws-beforeDraw<=61);assert.equal(frames.size,1);
});
emit(board,'keydown',{key:'Escape'});const frozen=structuredClone(lastDrawing);for(let n=0;n<60;n++)step();
check('Escape pauses all frames and freezes an accessible resting spectrum',()=>{assert.equal(frames.size,0);assert.deepEqual(lastDrawing,frozen);});
click(board,0);step();
check('native button activation resumes and pulses without duplicate owners',()=>assert.equal(frames.size,1));
emit(board,'pointerenter');for(let n=0;n<200;n++)move(120+n%230,460);
check('rapid pointer input shares the same single owner',()=>assert.equal(frames.size,1));
emit(board,'keydown',{key:'Home'});down();move(280,490,8);
check('another pointer cannot start work while one pointer is captured',()=>assert.equal(frames.size,0));
move(280,490);step();emit(window,'pointerup',{pointerId:8});assert.equal(board.hasPointerCapture(7),true);
emit(window,'pointerup',{pointerId:7});const beforeClick=structuredClone(lastDrawing);click();
check('drag release clears capture and suppresses the trailing click',()=>{assert.equal(board.hasPointerCapture(7),false);assert.deepEqual(lastDrawing,beforeClick);});
for(const key of ['Enter',' ']){
 emit(board,'keydown',{key:'Home'});const e=emit(board,'keydown',{key});
 check(JSON.stringify(key)+' preserves native single activation',()=>{assert.equal(e.defaultPrevented,false);assert.equal(frames.size,0);});click(board,0);assert.equal(frames.size,1);
}
for(const key of ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']){
 const e=emit(board,'keydown',{key});check(key+' pulses without scrolling',()=>{assert.equal(e.defaultPrevented,true);assert.equal(frames.size,1);});
}
step();const owner=[...frames.keys()][0],oldTheme=structuredClone(lastDrawing);document.documentElement.dataset.theme='light';observers[3].fire();
check('theme recolouring preserves the live owner and band positions',()=>{
 assert.equal([...frames.keys()][0],owner);assert.notDeepEqual(lastDrawing,oldTheme);
 assert.deepEqual(lastDrawing.map(x=>x.slice(0,4)),oldTheme.map(x=>x.slice(0,4)));
});
for(const gate of ['hidden','dialog','offscreen','pagehide','blur']){
 down();
 if(gate==='hidden'){document.hidden=true;emit(document,'visibilitychange');}
 if(gate==='dialog'){dialog.open=true;observers[2].fire();}
 if(gate==='offscreen')observers[1].fire([{isIntersecting:false}]);
 if(gate==='pagehide')emit(window,'pagehide');if(gate==='blur')emit(window,'blur');
 const stopped=structuredClone(lastDrawing);step(30000);
 check(gate+' stops drawing, releases capture and blocks input',()=>{assert.equal(frames.size,0);assert.equal(board.hasPointerCapture(7),false);click(board,0);assert.equal(frames.size,0);assert.deepEqual(lastDrawing,stopped);});
 document.hidden=false;dialog.open=false;observers[1].fire([{isIntersecting:true}]);emit(window,'pageshow');emit(window,'focus');emit(document,'visibilitychange');observers[2].fire();step();
 check(gate+' resumes one owner without hidden-time catch-up',()=>{assert.equal(frames.size,1);assert.ok(lastDrawing.every(x=>x.slice(0,4).every(Number.isFinite)));});
}
emit(document,'portfolio:sectionstart');check('section changes preserve the spectrum clock',()=>assert.equal(frames.size,1));
reduced.matches=true;emit(reduced,'change');const directBefore=structuredClone(lastDrawing);click(board,0);
check('reduced motion has direct static feedback and zero animated frames',()=>{assert.equal(frames.size,0);assert.notDeepEqual(lastDrawing,directBefore);});
forced.matches=true;emit(forced,'change');click(board,0);
check('forced colours expose a static spectrum with pause feedback',()=>{assert.equal(frames.size,0);assert.equal(board.dataset.disturbed,'true');emit(board,'keydown',{key:'Home'});assert.equal(board.dataset.disturbed,undefined);});
forced.matches=reduced.matches=false;emit(forced,'change');click(board,0);board.focus();down();desktop.matches=false;emit(desktop,'change');
check('mobile and short screens hide the spectrum and restore focus',()=>{assert.equal(root.hidden,true);assert.equal(frames.size,0);assert.equal(document.activeElement,toggle);assert.equal(board.hasPointerCapture(7),false);});
desktop.matches=true;emit(desktop,'change');down();board.rect={...board.rect,width:220,height:86};observers[0].fire();
check('resize releases old capture and keeps one resized owner',()=>{assert.equal(board.hasPointerCapture(7),false);assert.equal(canvas.width,220);assert.equal(frames.size,1);});
window.devicePixelRatio=4;observers[0].fire();check('DPR caps at two without creating another owner',()=>{assert.equal(canvas.width,440);assert.equal(frames.size,1);});
abort.abort();observers.forEach(o=>o.callback([{isIntersecting:true}]));
check('abort stops all work and late observers cannot revive the spectrum',()=>{assert.equal(frames.size,0);assert.equal(root.hidden,true);assert.ok(observers.every(o=>o.disconnected));});
canvasUnavailable=true;const noCanvas=new AbortController();setMaxListeners(0,noCanvas.signal);initSpectrumPlay(noCanvas.signal);click(board,0);
check('missing canvas retains static band feedback with no frames',()=>{assert.equal(root.dataset.fallback,'true');assert.equal(board.dataset.disturbed,'true');assert.equal(frames.size,0);});noCanvas.abort();
const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),css=await readFile(new URL('../src/spectrum-play.css',import.meta.url),'utf8');
check('only the native spectrum surface is visible and it retains full rail geometry',()=>{
 const surface=html.slice(html.indexOf('<section class="spectrum-play"'),html.indexOf('<section class="music-player"'));
 assert.equal((surface.match(/<button/g)||[]).length,1);assert.doesNotMatch(surface,/data-dot|dot-fallback|DOT \/ PLAY/);
 assert.match(surface,/rhythm is simulated/);assert.match(css,/width: calc\(100% - 32px\)/);assert.match(css,/min-width: 801px.*min-height: 540px/);assert.match(css,/background: transparent/);assert.match(css,/CanvasText/);
});
canvasUnavailable=false;
const syncedAbort=new AbortController();setMaxListeners(0,syncedAbort.signal);
const synced=initSpectrumPlay(syncedAbort.signal,{musicControlled:true});
check('music-controlled spectrum has no frames before confirmed playback',()=>{assert.equal(frames.size,0);click(board,0);assert.equal(frames.size,0);});
synced.setPlaying(true);
check('confirmed SoundCloud playback wakes exactly one spectrum owner',()=>assert.equal(frames.size,1));
synced.setPlaying(false);const quiet=structuredClone(lastDrawing);step(10000);move(180,460);
check('music pause stops the spectrum and pointer input cannot fake playback',()=>{assert.equal(frames.size,0);assert.deepEqual(lastDrawing,quiet);});
syncedAbort.abort();synced.setPlaying(true);
check('late playback events cannot revive an aborted spectrum',()=>assert.equal(frames.size,0));
console.log(JSON.stringify({mode:'Synthetic spectrum and lifecycle fixtures; not native browser or audio analysis',passed:checks.length,checks},null,2));
