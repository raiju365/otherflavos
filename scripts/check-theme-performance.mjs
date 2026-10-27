// Controller checks with a DOM fixture, not a rendered browser test.
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { initThemePicker } from '../src/theme-picker.js';

class Element extends EventTarget {
  dataset = {};
  attributes = new Map();
  children = [];
  tabIndex = -1;
  hidden = false;
  inert = false;
  textContent = '';
  style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } };
  offsetTop = 0;
  offsetHeight = 48;
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key); }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  focus() { document.activeElement = this; emit(document, 'focusin', { target: this }); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 224, height: 160 }; }
}
function emit(target, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event;
}
const picker = new Element(), toggle = new Element(), menu = new Element(), glass = new Element();
glass.offsetWidth = 240; glass.offsetHeight = 288;
const panelJobs = [];
glass.animate = (frames, timing) => {
  let resolve, reject;
  const job = { frames, timing, currentTime: 0, cancelled: false,
    finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
    finish() { this.currentTime = timing.duration; resolve(); },
    cancel() { this.cancelled = true; reject(Error('cancel')); } };
  panelJobs.push(job); return job;
};
const finishPanel = async () => { panelJobs.at(-1).finish(); await Promise.resolve(); };
const root = new Element(), meta = {}, outside = new Element(), selection = new Element();
const indicatorJobs = [];
selection.animate = (frames, timing) => {
  let reject;
  const job = { frames, timing, currentTime: 0, cancelled: false,
    finished: new Promise((_, no) => { reject = no; }),
    cancel() { this.cancelled = true; reject(Error('cancel')); } };
  indicatorJobs.push(job); return job;
};
const motion = new EventTarget();
motion.matches = false;
root.dataset.theme = 'dark';
menu.hidden = true;
menu.inert = true;
const options = ['dark', 'light', 'unexpected', 'amethyst'].map((theme, index) => {
  const option = new Element();
  option.dataset.setTheme = theme;
  option.offsetTop = index * 56;
  option.querySelector = () => ({ textContent: theme[0].toUpperCase() + theme.slice(1) });
  return option;
});
menu.children = [selection, ...options];
menu.querySelector = () => selection;
glass.children = [menu];
picker.children = [glass, toggle];
picker.querySelector = () => glass;
menu.querySelectorAll = () => options;
globalThis.document = new EventTarget();
globalThis.window = new EventTarget();
let modalOpen = false;
document.documentElement = root;
document.activeElement = outside;
document.querySelector = selector => selector === 'dialog[open]' ? (modalOpen ? {} : null)
  : ({ '.theme-picker': picker, '#theme-toggle': toggle,
    '#theme-menu': menu, 'meta[name="theme-color"]': meta })[selector];
globalThis.matchMedia = () => motion;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => root.dataset.theme === 'light' ? '#f8f8f6' : root.dataset.theme === 'amethyst' ? '#282136' : '#0a0a0a' });
const stored = new Map();
globalThis.localStorage = { setItem: (key, value) => stored.set(key, value) };
const abort = new AbortController();
setMaxListeners(0, abort.signal);
const activity=[];document.addEventListener('portfolio:themecontrol',event=>activity.push(event.detail.open));
initThemePicker(abort.signal);
const passed = [];
const check = (name, test) => { test(); passed.push(name); };

check('initial checked theme', () => assert.equal(options[0].getAttribute('aria-checked'), 'true'));
emit(picker,'pointerdown',{button:0,target:toggle});
check('primary press immediately engages the shared glass material',()=>assert.equal(picker.dataset.pressed,'true'));
emit(window,'pointercancel');
check('cancelled touch releases material compression',()=>assert.equal(picker.dataset.pressed,'false'));
emit(picker,'pointerdown',{button:0,target:options[0]});
check('pressing an option never compresses the panel',()=>assert.equal(picker.dataset.pressed,'false'));
emit(picker,'pointerdown',{button:0,target:toggle,pointerId:4,isPrimary:true});
emit(window,'pointerup',{pointerId:5});
check('an unrelated finger release cannot interrupt the held trigger',()=>assert.equal(picker.dataset.pressed,'true'));
emit(window,'pointercancel',{pointerId:4});
emit(toggle,'keydown',{key:' '});
check('keyboard activation shares the pressure response',()=>assert.equal(picker.dataset.pressed,'true'));
emit(toggle,'keyup',{key:' '});
check('keyboard release clears pressure',()=>assert.equal(picker.dataset.pressed,'false'));
emit(glass,'pointermove',{clientX:112,clientY:80,pointerType:'mouse'});
check('glass highlight stays fixed while the mouse moves',()=>{
  assert.equal(glass.style['--glass-light-x'],undefined);
  assert.equal(glass.style['--glass-light-y'],undefined);
});
emit(glass,'pointerleave');
check('leaving the glass preserves the fixed highlight',()=>assert.equal(glass.style['--glass-light-x'],undefined));
emit(picker,'pointerdown',{button:0,target:toggle});emit(window,'blur');
check('window blur releases held input',()=>assert.equal(picker.dataset.pressed,'false'));
emit(glass,'pointermove',{clientX:99,clientY:40,pointerType:'touch'});
check('touch avoids pointer-position lighting',()=>assert.equal(glass.style['--glass-light-x'],undefined));
emit(toggle, 'keydown', { key: 'ArrowDown' });
check('keyboard open exposes menu and focuses selected theme', () => {
  assert.equal(menu.inert, false); assert.equal(menu.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, options[0]);
});
emit(menu, 'keydown', { key: 'ArrowDown' });
check('arrow navigation moves focus without changing theme', () => {
  assert.equal(document.activeElement, options[1]); assert.equal(root.dataset.theme, 'dark');
});
emit(options[1], 'click');
check('selection updates palette and persistence while staying open', () => {
  assert.equal(root.dataset.theme, 'light');
  assert.equal(stored.get('personal-web:theme'), 'light');
  assert.equal(meta.content, '#f8f8f6');
  assert.equal(options.filter(option => option.getAttribute('aria-checked') === 'true').length, 1);
  assert.equal(document.activeElement, options[1]);
  assert.equal(menu.inert, false); assert.equal(menu.hidden, false);
  assert.equal(picker.dataset.open, 'true');
  assert.equal(selection.style.transform, 'translateY(56px)');
});
emit(options[3], 'click');
check('fourth theme persists with aligned indicator and an open preview', () => {
  assert.equal(root.dataset.theme, 'amethyst');assert.equal(stored.get('personal-web:theme'), 'amethyst');
  assert.equal(selection.style.transform, 'translateY(168px)');assert.equal(meta.content, '#282136');
  assert.equal(options.filter(option=>option.getAttribute('aria-checked')==='true').length,1);
  assert.equal(document.activeElement,options[3]);assert.equal(picker.dataset.open,'true');
});
emit(menu,'keydown',{key:'ArrowDown'});
check('keyboard wraps from fourth to first option',()=>assert.equal(document.activeElement,options[0]));
emit(options[1],'click');
document.startViewTransition=()=>{throw Error('Snapshot capture must not run');};
root.animate=()=>{throw Error('Full-page animation must not run');};
emit(options[3],'click');
check('theme changes commit immediately without page capture or animation',()=>{
 assert.equal(root.dataset.theme,'amethyst');assert.equal(stored.get('personal-web:theme'),'amethyst');
 assert.equal(options[3].getAttribute('aria-checked'),'true');assert.equal(root.dataset.themeRevealing,undefined);
});
delete document.startViewTransition;delete root.animate;
emit(options[2], 'click'); emit(options[0], 'click'); emit(options[1], 'click');
check('rapid theme selection ends on the latest option with one checked state', () => {
  assert.equal(root.dataset.theme, 'light');
  assert.equal(selection.style.transform, 'translateY(56px)');
  assert.equal(options.filter(option => option.getAttribute('aria-checked') === 'true').length, 1);
});
emit(toggle, 'click'); emit(toggle, 'click');
await new Promise(resolve => setTimeout(resolve, 520));
check('reopening cannot be hidden by an obsolete closing completion', () => { assert.equal(menu.hidden, false); assert.equal(menu.inert, false); });
emit(document, 'keydown', { key: 'Escape' });
check('Escape closes access immediately and restores trigger', () => {
  assert.equal(menu.inert, true); assert.equal(document.activeElement, toggle);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});
emit(toggle, 'keydown', { key: 'ArrowUp' });
check('ArrowUp opens at fourth option', () => assert.equal(document.activeElement, options[3]));
emit(menu, 'keydown', { key: 'Home' });
check('Home focuses first option', () => assert.equal(document.activeElement, options[0]));
emit(menu, 'keydown', { key: 'End' });
check('End focuses fourth option', () => assert.equal(document.activeElement, options[3]));
const tab = emit(menu, 'keydown', { key: 'Tab' });
check('Tab is not trapped and does not dismiss the persistent preview', () => {
  assert.equal(tab.defaultPrevented, false); assert.equal(menu.inert, false);
  assert.equal(picker.dataset.open, 'true');
});
emit(document, 'pointerdown', { target: options[0] });
check('inside pointer leaves preview open', () => assert.equal(picker.dataset.open, 'true'));
for (const target of [glass, menu, selection]) {
  emit(document,'pointerdown',{target});
}
check('blank glass, row gaps and selection surface keep the menu open',()=>assert.equal(picker.dataset.open,'true'));
emit(document,'pointerdown',{target:root,clientX:100,clientY:130,pointerType:'mouse'});
check('snapshot-retargeted mouse inside the visible panel keeps it open',()=>assert.equal(picker.dataset.open,'true'));
emit(document,'pointerdown',{target:root,clientX:20,clientY:20,pointerType:'touch'});
check('snapshot-retargeted touch inside the visible panel keeps it open',()=>assert.equal(picker.dataset.open,'true'));
emit(document,'pointerdown',{target:outside,composedPath:()=>[outside,picker,document]});
check('composed event paths recognize content inside the control',()=>assert.equal(picker.dataset.open,'true'));
emit(document, 'pointerdown', { target: outside, clientX: 300, clientY: 200 });
check('outside pointer closes preview', () => {
  assert.equal(picker.dataset.open, 'false'); assert.equal(menu.inert, true);
});
emit(toggle, 'click');
outside.focus();
check('outside focus stays outside while preview remains open', () => {
  assert.equal(picker.dataset.open, 'true'); assert.equal(document.activeElement, outside);
});
modalOpen = true;
const escapeDuringModal = emit(document, 'keydown', { key: 'Escape' });
check('theme menu does not consume Escape intended for the project dialog', () => {
  assert.equal(escapeDuringModal.defaultPrevented, false); assert.equal(picker.dataset.open, 'true');
});
modalOpen = false;
emit(window, 'resize');
check('resize keeps the indicator aligned with the selected option', () => assert.equal(selection.style.transform, 'translateY(56px)'));
emit(toggle, 'click');
check('X closes and restores focus to the trigger', () => {
  assert.equal(picker.dataset.open, 'false'); assert.equal(document.activeElement, toggle);
  assert.ok(indicatorJobs.every(job=>job.cancelled));
});
check('closing releases input immediately but keeps content until the morph completes',()=>{
  assert.equal(menu.inert,true);assert.equal(menu.hidden,false);
  assert.equal(root.dataset.themeControlOpen,'true');
});
emit(glass,'transitionend',{target:menu,propertyName:'clip-path'});
emit(glass,'transitionend',{target:glass,propertyName:'opacity'});
check('child and unrelated transitions cannot truncate the closing morph',()=>assert.equal(menu.hidden,false));
emit(glass,'transitionend',{target:glass,propertyName:'clip-path'});
check('legacy CSS events cannot finish the new native spring',()=>assert.equal(menu.hidden,false));
await finishPanel();
check('completed surface return hides the menu and releases the decorative pause',()=>{
 assert.equal(menu.hidden,true);assert.equal(root.dataset.themeControlOpen,'false');
});
emit(toggle,'click');
emit(glass,'transitionend',{target:glass,propertyName:'clip-path'});
check('a late surface event cannot hide a reopened menu',()=>{
  assert.equal(menu.hidden,false);assert.equal(menu.inert,false);assert.equal(picker.dataset.open,'true');
});
emit(options[0],'click');
document.hidden=true;emit(document,'visibilitychange');
check('hidden document settles the actual indicator spring and retains selection',()=>{
  assert.ok(indicatorJobs.length>0&&indicatorJobs.every(job=>job.cancelled));
  assert.equal(selection.style.transform,'translateY(0px)');assert.equal(picker.dataset.open,'true');
});
document.hidden=false;
emit(toggle,'click');
motion.matches = true;
emit(toggle, 'click'); emit(toggle, 'click');
check('reduced motion closes without waiting for animation', () => assert.equal(menu.hidden, true));
emit(picker,'pointerdown',{button:0,target:toggle});
check('reduced motion removes pressure displacement as well as playback',()=>{
  assert.equal(glass.style.clipPath,'inset(232px 184px 0px 0px round 28px)');
});
emit(window,'pointercancel');
emit(toggle, 'click'); abort.abort(); emit(toggle, 'click');
check('abort removes handlers and closes the menu', () => {
  assert.equal(picker.dataset.open, 'false'); assert.equal(menu.hidden, true); assert.equal(menu.inert, true);
  assert.ok(indicatorJobs.every(job=>job.cancelled));
});

check('missing optional theme elements cannot crash application startup',()=>{
  const query=document.querySelector;
  for(const missing of ['#theme-toggle','#theme-menu','.theme-picker']){
    document.querySelector=selector=>selector===missing?null:query(selector);
    assert.doesNotThrow(()=>initThemePicker(new AbortController().signal));
  }
  document.querySelector=query;
});
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
check('the menu remains accessible and releases the decorative pause on abort',()=>{
 assert.equal((html.match(/id="theme-toggle"/g)||[]).length,1);
 assert.ok(activity.includes(true));assert.equal(activity.at(-1),false);assert.equal(root.dataset.themeControlOpen,undefined);
});
const bootstrap=html.match(/<script>\s*(try\s*\{\s*const t\s*=\s*localStorage[\s\S]*?)<\/script>/)[1];
check('reload bootstrap restores all four themes and rejects unknown values',()=>{
  for(const theme of ['dark','light','unexpected','amethyst','invalid']){
    const element={dataset:{theme:'dark'}};
    vm.runInNewContext(bootstrap,{document:{documentElement:element},localStorage:{getItem:()=>theme}});
    assert.equal(element.dataset.theme,theme==='invalid'?'dark':theme);
  }
  assert.equal((html.match(/data-set-theme=/g)||[]).length,4);
});
const report = { mode: 'Node DOM fixture; no local browser rendering', passed: passed.length, checks: passed,
  limits: ['CSS appearance, animation geometry, native Tab movement and physical touch require browser review.'] };
console.log(JSON.stringify(report, null, 2));
