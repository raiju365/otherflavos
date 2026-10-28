import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { initRailAtmosphere } from '../src/rail-atmosphere.js';

const passed = [];
const check = (name, run) => { run(); passed.push(name); };
class Element {
  children = []; dataset = {}; attributes = new Map();
  setAttribute(key, value) { this.attributes.set(key, value); }
  append(child) { child.parent = this; this.children.push(child); }
  prepend(child) { child.parent = this; this.children.unshift(child); }
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
}
let frameId=0,now=0;
const frames=new Map(),samples=[];
globalThis.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
const step=delta=>{now+=delta;const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(now));};
const context={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>samples.push(Buffer.from(image.data))};
const rail = new Element();
const figure = new Element(), identity = new Element(); rail.append(figure); rail.append(identity);
globalThis.document = new EventTarget(); globalThis.window = new EventTarget();
document.hidden = false; document.documentElement = { dataset: { entry: 'loading' } };
let hasRail = true;
document.querySelector = () => hasRail ? rail : null;
document.createElement = tag => {const element=new Element();if(tag==='canvas')element.getContext=()=>context;return element;};
const media = new Map();
globalThis.matchMedia = query => {
  if (!media.has(query)) { const item = new EventTarget(); item.matches = false; media.set(query, item); }
  return media.get(query);
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)'), forced = matchMedia('(forced-colors: active)');
let observer;
globalThis.IntersectionObserver = class {
  constructor(callback) { this.callback = callback; observer = this; }
  observe(target) { this.target = target; }
  disconnect() { this.disconnected = true; }
  emit(ratio) { this.callback([{ target: this.target, isIntersecting: ratio > 0, intersectionRatio: ratio }]); }
};
const emit = (target, event) => target.dispatchEvent(new Event(event));
const abort = new AbortController(); setMaxListeners(0, abort.signal);
const control = initRailAtmosphere(abort.signal);
const backdrop = rail.children[0], fields = [...backdrop.children];
const running = () => backdrop.dataset.running;

check('one decorative backdrop is inserted without moving the figure or identity', () => {
  assert.deepEqual(rail.children.slice(1), [figure, identity]);
  assert.equal(backdrop.attributes.get('aria-hidden'), 'true'); assert.equal(fields.length, 1);
  assert.equal(backdrop.attributes.has('tabindex'), false); assert.equal(running(), 'false');
});
check('an intersecting rail remains paused behind document entry', () => {
  observer.emit(1); assert.equal(running(), 'false');
});
check('actual entry readiness starts the supplied flow canvas without replacing them', () => {
  document.documentElement.dataset.entry = 'ready'; emit(document, 'portfolio:entryready');
  assert.equal(running(), 'true'); assert.deepEqual(backdrop.children, fields);
});
check('a rail below the visible threshold pauses and reuses the same fields on return', () => {
  observer.emit(.002); assert.equal(running(), 'false');
  observer.emit(0); assert.equal(running(), 'false');
  observer.emit(.5); assert.equal(running(), 'true'); assert.deepEqual(backdrop.children, fields);
});
check('hidden documents pause and resume without constructing another backdrop', () => {
  document.hidden = true; emit(document, 'visibilitychange'); assert.equal(running(), 'false');
  document.hidden = false; emit(document, 'visibilitychange'); assert.equal(running(), 'true');
  assert.equal(rail.children.length, 3);
});
check('reduced motion remains effective across visibility and readiness events', () => {
  reduced.matches = true; emit(reduced, 'change'); assert.equal(running(), 'false');
  observer.emit(1); emit(document, 'portfolio:entryready'); assert.equal(running(), 'false');
  reduced.matches = false; emit(reduced, 'change'); assert.equal(running(), 'true');
});
check('forced colors pause the decoration independently of motion preferences', () => {
  forced.matches = true; emit(forced, 'change'); assert.equal(running(), 'false');
  forced.matches = false; emit(forced, 'change'); assert.equal(running(), 'true');
});
check('a project dialog holds the background until close and preserves offscreen gating', () => {
  control.setDialogOpen(true); assert.equal(running(), 'false');
  observer.emit(0); control.setDialogOpen(false); assert.equal(running(), 'false');
  observer.emit(1); assert.equal(running(), 'true');
});
check('page-cache suspension pauses fields and restoration honors other gates', () => {
  emit(window, 'pagehide'); assert.equal(running(), 'false');
  control.setDialogOpen(true); emit(window, 'pageshow'); assert.equal(running(), 'false');
  control.setDialogOpen(false); assert.equal(running(), 'true');
});
check('opening and changing themes keeps the same gradient frame and grain running',()=>{
 step(50);const pending=[...frames.keys()],before=samples.at(-1);
 document.documentElement.dataset.themeControlOpen='true';emit(document,'portfolio:themecontrol');assert.equal(running(),'true');
 for(const theme of ['light','unexpected','amethyst','dark']){document.documentElement.dataset.theme=theme;emit(document,'portfolio:themecontrol');assert.deepEqual([...frames.keys()],pending);}
 for(let i=0;i<12;i++)step(50);
 assert.equal(frames.size,1);assert.equal(running(),'true');assert.ok(!before.equals(samples.at(-1)));
});
check('tab transitions in both directions preserve one frame owner and keep the field changing',()=>{
 const before=samples.at(-1);
 for(let transition=0;transition<5;transition++){
  const pending=[...frames.keys()];
  emit(document,'portfolio:sectionstart');emit(document,'portfolio:sectionstart');
  assert.deepEqual([...frames.keys()],pending);assert.equal(running(),'true');
  for(let i=0;i<4;i++)step(50);
  const settling=[...frames.keys()];emit(document,'portfolio:sectionsettled');
  assert.deepEqual([...frames.keys()],settling);assert.equal(frames.size,1);
 }
 assert.ok(!before.equals(samples.at(-1)));
});
check('the Projects entrance and subsequent gallery motion cannot suspend the gradient',()=>{
 const pending=[...frames.keys()],before=samples.at(-1);
 document.documentElement.dataset.galleryMoving='true';emit(document,'portfolio:gallerymotion');
 assert.equal(running(),'true');assert.deepEqual([...frames.keys()],pending);
 for(let i=0;i<4;i++)step(50);
 assert.ok(!before.equals(samples.at(-1)));assert.equal(frames.size,1);
 const settling=[...frames.keys()];
 document.documentElement.dataset.themeControlOpen='false';emit(document,'portfolio:themecontrol');
 document.documentElement.dataset.galleryMoving='false';emit(document,'portfolio:gallerymotion');
 assert.equal(running(),'true');assert.deepEqual([...frames.keys()],settling);
});
check('navigation events cannot restart a hidden or reduced-motion background',()=>{
 document.hidden=true;emit(document,'visibilitychange');
 emit(document,'portfolio:sectionstart');emit(document,'portfolio:sectionsettled');emit(document,'portfolio:gallerymotion');
 assert.equal(running(),'false');assert.equal(frames.size,0);
 document.hidden=false;reduced.matches=true;emit(reduced,'change');
 emit(document,'portfolio:sectionstart');emit(document,'portfolio:sectionsettled');
 assert.equal(running(),'false');assert.equal(frames.size,0);
 reduced.matches=false;emit(reduced,'change');assert.equal(running(),'true');
});
check('abort removes the backdrop, disconnects visibility tracking and releases listeners', () => {
  abort.abort(); assert.equal(observer.disconnected, true); assert.equal(running(), 'false');
  assert.equal(frames.size,0);
  assert.deepEqual(rail.children, [figure, identity]);
  backdrop.dataset.running = 'sentinel'; emit(document, 'portfolio:entryready'); emit(window, 'pageshow');
  emit(reduced, 'change'); assert.equal(running(), 'sentinel');
});
check('missing rail and already-aborted initialization do not alter content', () => {
  initRailAtmosphere(abort.signal); assert.equal(rail.children.length, 2);
  hasRail = false; initRailAtmosphere(new AbortController().signal).setDialogOpen(true);
  assert.equal(rail.children.length, 2); hasRail = true;
});
check('missing visibility APIs retain a static decorative fallback', () => {
  delete globalThis.IntersectionObserver;
  const fallbackAbort = new AbortController(); setMaxListeners(0, fallbackAbort.signal);
  const fallback = initRailAtmosphere(fallbackAbort.signal), staticBackdrop = rail.children[0];
  emit(document, 'portfolio:entryready'); fallback.setDialogOpen(false);
  assert.equal(staticBackdrop.dataset.running, 'false');
  fallbackAbort.abort(); assert.deepEqual(rail.children, [figure, identity]);
});
mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});
writeFileSync(new URL('../artifacts/rail-atmosphere-results.json', import.meta.url), JSON.stringify({ checks: passed.length, passed, limits: 'Node DOM/event lifecycle and real flow buffers only; native flow/grain appearance, compositing and motion quality are not rendered or measured.' }, null, 2) + '\n');
console.log(`${passed.length} rail-atmosphere checks passed`);
