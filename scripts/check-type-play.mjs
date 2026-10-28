// Pure motion + event fixtures. These are not native browser appearance/FPS tests.
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createTypePlay, placeTypeLetter, kickTypeLetter, mixTypePlay, resetTypePlay, resizeTypePlay, stepTypePlay } from '../src/type-play-model.js';
import { initTypePlay } from '../src/type-play.js';
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };
check('90 desktop geometry budgets preserve the portrait/name and theme-control reserve', () => {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  for (const width of [801, 900, 1100, 1101, 1280, 1699, 1700, 1920, 2560]) {
    for (const height of [540, 600, 601, 650, 651, 800, 801, 820, 900, 1080]) {
      // Existing single-line identity geometry; font rasterization is separate.
      const gutter = clamp(width * .04, 24, 76), outer = Math.max(gutter, (width - 1540) / 2);
      const rail = width <= 1100 ? 225 : clamp(width * .22, 230, 330);
      const gap = width <= 1100 ? 45 : clamp(width * .055, 40, 102);
      const identityWidth = Math.min(360, rail + outer + gap / 2 - 48);
      const nameSize = height <= 650 ? clamp(identityWidth * .14, 30, 40) : clamp(identityWidth * .16, 30, 52);
      const portrait = height <= 600 ? 125 : height <= 800 ? 180 : width >= 1700 ? 260 : 230;
      const portraitTop = height <= 650 ? 10 : clamp(height * .04, 18, 42);
      const portraitBottom = height <= 600 ? 16 : height <= 800 ? 22 : 32;
      const fixed = portraitTop + portrait + portraitBottom + nameSize * 1.12 + 12 + 22.4;
      const available = height - (height <= 800 ? 24 : 32) - 96;
      const margin = clamp(height * .03, 20, 32);
      const preferred = clamp(height - 470, 144, 248);
      const actual = Math.min(preferred, available - fixed - margin);
      assert.ok(actual >= 144, `not enough vertical room at ${width}x${height}`);
      assert.ok(fixed + margin + actual <= available + .001);
    }
  }
});
const homes = model => model.bodies.every(body => body.x === body.homeX && body.y === body.homeY && body.angle === 0);
const bounded = model => model.bodies.every(body => ['x', 'y', 'vx', 'vy', 'angle', 'spin'].every(key => Number.isFinite(body[key]))
  && body.x >= model.margin - .001 && body.x <= model.width - model.margin + .001
  && body.y >= model.margin - .001 && body.y <= model.height - model.margin + .001);
function settleModel(model, held = -1, dt = 1 / 60) {
  let frames = 0;
  while (stepTypePlay(model, dt, held) && frames++ < 500) assert.ok(bounded(model));
  assert.ok(frames < 500, 'the model must sleep'); return frames;
}
for (const [width, height] of [[220, 94], [236, 94], [280, 170], [300, 198]]) {
  check(`four readable letters fit the ${width}x${height} stage`, () => {
    const model = createTypePlay(width, height);
    assert.equal(model.bodies.length, 4); assert.ok(bounded(model)); assert.ok(model.hitSize >= 44);
    for (const body of model.bodies) {
      assert.ok(body.x - model.hitSize / 2 >= 0);
      assert.ok(body.x + model.hitSize / 2 <= width);
    }
    assert.equal(stepTypePlay(model, 1 / 60), false); assert.ok(homes(model));
  });
  check(`Mix and throws settle exactly at home at ${width}x${height}`, () => {
    const model = createTypePlay(width, height); mixTypePlay(model, 3);
    assert.equal(stepTypePlay(model, 1 / 60), true); assert.ok(!homes(model));
    assert.ok(settleModel(model) > 15); assert.ok(homes(model));
    kickTypeLetter(model, 1, 2000, -2000); assert.ok(Math.hypot(model.bodies[1].vx, model.bodies[1].vy) <= 560.001);
    settleModel(model); assert.ok(homes(model));
  });
}
check('substeps keep 30/60/120Hz trajectories consistent', () => {
  const samples = [30, 60, 120].map(rate => {
    const model = createTypePlay(300, 198); kickTypeLetter(model, 2, 250, -180);
    for (let index = 0; index < rate / 5; index++) stepTypePlay(model, 1 / rate);
    return model.bodies.map(body => [body.x, body.y, body.angle]);
  });
  for (const sample of samples.slice(1)) sample.forEach((body, index) => body.forEach((value, key) => assert.ok(Math.abs(value - samples[0][index][key]) < .02)));
});
check('long suspension is bounded to 40ms without catch-up', () => {
  const first = createTypePlay(280, 170), second = createTypePlay(280, 170);
  mixTypePlay(first, 8); mixTypePlay(second, 8);
  stepTypePlay(first, 600); stepTypePlay(second, .04); assert.deepEqual(first, second);
});
check('repeated tosses never escape the stage or become non-finite', () => {
  const model = createTypePlay(220, 94);
  for (let turn = 0; turn < 80; turn++) {
    mixTypePlay(model, turn);
    for (let frame = 0; frame < 8; frame++) { stepTypePlay(model, .04); assert.ok(bounded(model)); }
  }
  settleModel(model); assert.ok(homes(model));
});
check('held coincident bodies stay bounded and return to idle even in contact', () => {
  const model = createTypePlay(280, 170), target = model.bodies[1];
  placeTypeLetter(model, 0, target.x, target.y);
  const held = { x: model.bodies[0].x, y: model.bodies[0].y };
  assert.ok(settleModel(model, 0) < 100);
  assert.equal(model.bodies[0].x, held.x); assert.equal(model.bodies[0].y, held.y);
  assert.ok(bounded(model)); settleModel(model); assert.ok(homes(model));
});
check('direct reduced-motion moves use no inertia and Reset restores the word', () => {
  const model = createTypePlay(280, 170); mixTypePlay(model, 1, true);
  assert.ok(!homes(model)); assert.ok(bounded(model));
  assert.ok(model.bodies.every(body => body.vx === 0 && body.vy === 0 && body.spin === 0));
  resetTypePlay(model, true); assert.ok(homes(model));
});
check('resize preserves bounded relative placement without stored momentum', () => {
  const model = createTypePlay(300, 198); mixTypePlay(model, 6); stepTypePlay(model, .04);
  const next = resizeTypePlay(model, 220, 94); assert.ok(bounded(next));
  assert.ok(next.bodies.every(body => body.vx === 0 && body.vy === 0)); settleModel(next); assert.ok(homes(next));
});
check('invalid coordinates and elapsed values never produce invalid transforms', () => {
  const model = createTypePlay(280, 170); placeTypeLetter(model, 0, NaN, Infinity);
  kickTypeLetter(model, 1, NaN, Infinity); stepTypePlay(model, NaN); assert.ok(bounded(model));
});

class Element extends EventTarget {
  dataset = {}; hidden = false; parent = null; children = []; captures = new Set();
  style = { setProperty(key, value) { this[key] = value; } };
  selectors = new Map(); textContent = ''; rect = { left: 100, top: 400, width: 280, height: 170 };
  querySelector(selector) { return this.selectors.get(selector) ?? null; }
  querySelectorAll(selector) { return this.selectors.get(selector) ?? []; }
  contains(element) { return element === this || this.children.some(child => child.contains(element)); }
  focus() { document.activeElement = this; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); emit(this, 'lostpointercapture', { pointerId: id }); }
  getBoundingClientRect() { return { ...this.rect }; }
}
const root = new Element(), stage = new Element(), dialog = new Element(), toggle = new Element();
const letters = Array.from({ length: 4 }, () => new Element());
const mix = new Element(), reset = new Element(), status = new Element();
root.hidden = true; dialog.open = false;
root.children = [stage, mix, reset, status]; stage.children = letters;
for (const child of root.children) child.parent = root;
for (const letter of letters) letter.parent = stage;
root.selectors = new Map([['[data-type-stage]', stage], ['[data-type-letter]', letters], ['[data-type-status]', status], ['[data-type-mix]', mix], ['[data-type-reset]', reset]]);
const desktop = new EventTarget(), reduced = new EventTarget(); desktop.matches = true; reduced.matches = false;
globalThis.window = new EventTarget(); globalThis.document = new EventTarget();
document.hidden = false; document.activeElement = null; document.documentElement = { dataset: { entry: 'loading' } };
document.querySelector = selector => new Map([['[data-type-play]', root], ['#project-detail', dialog], ['#theme-toggle', toggle]]).get(selector) ?? null;
globalThis.matchMedia = query => query.includes('min-width') ? desktop : reduced;
let serial = 0, clock = 0; const frames = new Map();
globalThis.performance = { now: () => clock };
globalThis.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
function step(ms = 1000 / 60) { clock += ms; const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(clock)); }
function settle() { let count = 0; while (frames.size && count++ < 500) step(); assert.equal(frames.size, 0, 'no idle frame owner'); return count; }
function emit(element, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value });
  element.dispatchEvent(event); return event;
}
const observers = [];
class Observer {
  constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
  observe(target) { this.target = target; }
  disconnect() { this.disconnected = true; }
  fire(entries = []) { if (!this.disconnected) this.callback(entries); }
}
globalThis.ResizeObserver = class extends Observer {};
globalThis.IntersectionObserver = class extends Observer {};
globalThis.MutationObserver = class extends Observer {};
const transforms = () => letters.map(letter => letter.style.transform);
const click = element => emit(element, 'click', { detail: 1 });
const down = (index = 0, properties = {}) => emit(letters[index], 'pointerdown', { button: 0, isPrimary: true, pointerId: 7, clientX: 150, clientY: 480, ...properties });
const move = (x, y, id = 7) => { clock += 16; emit(window, 'pointermove', { pointerId: id, clientX: x, clientY: y }); };
const up = (id = 7) => emit(window, 'pointerup', { pointerId: id });
const abort = new AbortController(); setMaxListeners(0, abort.signal); initTypePlay(abort.signal);
check('entry has static letters with no competing animation frames', () => { assert.equal(root.hidden, false); assert.equal(frames.size, 0); click(mix); assert.equal(frames.size, 0); });
document.documentElement.dataset.entry = 'ready'; emit(document, 'portfolio:entryready'); settle();
const resting = transforms();
check('ready word begins at rest with zero idle frames', () => { assert.equal(resting.length, 4); assert.ok(resting.every(value => value.includes('translate3d'))); assert.equal(root.dataset.active, 'false'); });
click(mix); step();
check('Mix starts one finite owner and moves real letter transforms', () => { assert.equal(frames.size, 1); assert.notDeepEqual(transforms(), resting); assert.match(status.textContent, /mixed/); });
for (let count = 0; count < 100; count++) click(mix);
check('input bursts never create more than one frame owner', () => assert.equal(frames.size, 1));
settle();
check('Mix returns to the exact resting word and leaves no frames', () => assert.deepEqual(transforms(), resting));
down(); const grabbed = transforms(); step();
check('grabbing off-centre never recentres or jumps the glyph', () => { assert.equal(letters[0].dataset.grabbed, 'true'); assert.deepEqual(transforms(), grabbed); assert.ok(letters[0].hasPointerCapture(7)); assert.equal(document.activeElement, letters[0]); });
move(210, 455, 8); step();
check('an unrelated pointer cannot move the held letter', () => assert.deepEqual(transforms(), grabbed));
move(210, 455); step(); const dragged = transforms();
check('dragging changes the glyph itself within the open stage', () => assert.notEqual(dragged[0], resting[0]));
settle();
check('holding a stationary letter sleeps instead of spinning forever', () => assert.equal(frames.size, 0));
up(8);
check('an unrelated release cannot end capture', () => assert.equal(letters[0].dataset.grabbed, 'true'));
move(230, 465); step(); up();
check('release drops capture and starts bounded inertia', () => { assert.equal(letters[0].hasPointerCapture(7), false); assert.equal(letters[0].dataset.grabbed, undefined); assert.equal(frames.size, 1); });
click(letters[0]); settle();
check('the native click after a drag does not trigger a second toss', () => assert.deepEqual(transforms(), resting));
click(letters[0]); step();
check('a plain click remains a discoverable single-letter toss', () => assert.notEqual(transforms()[0], resting[0]));
click(reset); settle();
check('Reset resolves the current motion to exact home positions', () => { assert.deepEqual(transforms(), resting); assert.match(status.textContent, /reset/); });
for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
  const event = emit(letters[1], 'keydown', { key }); step();
  check(`${key} nudges the focused letter without page scrolling`, () => { assert.equal(event.defaultPrevented, true); assert.notEqual(transforms()[1], resting[1]); });
  click(reset); settle();
}
for (const key of ['Enter', ' ']) {
  const event = emit(letters[2], 'keydown', { key });
  check(`${JSON.stringify(key)} keeps native activation without a duplicate toss`, () => { assert.equal(event.defaultPrevented, false); assert.equal(frames.size, 0); });
  emit(letters[2], 'click', { detail: 0 }); step(); assert.notEqual(transforms()[2], resting[2]); settle();
}
const shortcut = emit(letters[0], 'keydown', { key: 'ArrowLeft', altKey: true });
check('browser modifier shortcuts remain native', () => { assert.equal(shortcut.defaultPrevented, false); assert.equal(frames.size, 0); });
down(); move(180, 450); emit(letters[0], 'lostpointercapture', { pointerId: 7, target: letters[0].children[0] ?? stage });
check('a child capture event cannot cancel the real active grab', () => assert.equal(letters[0].dataset.grabbed, 'true'));
letters[0].captures.delete(7); emit(letters[0], 'lostpointercapture', { pointerId: 7 }); settle();
check('unexpected real capture loss releases and settles safely', () => { assert.equal(letters[0].dataset.grabbed, undefined); assert.deepEqual(transforms(), resting); });
down(); move(190, 450); emit(window, 'pointercancel', { pointerId: 7 }); settle();
check('pointer cancellation has no stuck capture or animation loop', () => { assert.equal(letters[0].hasPointerCapture(7), false); assert.deepEqual(transforms(), resting); });
down(); move(200, 450); emit(window, 'blur');
check('blur releases input and pauses all toy frames', () => { assert.equal(frames.size, 0); assert.equal(letters[0].hasPointerCapture(7), false); });
step(30000); emit(window, 'focus'); settle();
check('focus resumes without elapsed-time catch-up', () => assert.deepEqual(transforms(), resting));
for (const gate of ['hidden', 'dialog', 'offscreen', 'pagehide']) {
  click(mix); step();
  if (gate === 'hidden') { document.hidden = true; emit(document, 'visibilitychange'); }
  if (gate === 'dialog') { dialog.open = true; observers[2].fire(); }
  if (gate === 'offscreen') observers[1].fire([{ isIntersecting: false }]);
  if (gate === 'pagehide') emit(window, 'pagehide');
  check(`${gate} suspends frames and blocks further play`, () => { assert.equal(frames.size, 0); click(mix); assert.equal(frames.size, 0); });
  step(10000);
  document.hidden = false; dialog.open = false; observers[1].fire([{ isIntersecting: true }]); emit(window, 'pageshow'); emit(document, 'visibilitychange'); observers[2].fire(); settle();
  assert.deepEqual(transforms(), resting);
}
click(mix); step(); reduced.matches = true; emit(reduced, 'change');
check('reduced-motion changes immediately stop and restore the word', () => { assert.equal(frames.size, 0); assert.deepEqual(transforms(), resting); });
click(mix);
check('reduced-motion Mix is direct, usable and has zero animation frames', () => { assert.notDeepEqual(transforms(), resting); assert.equal(frames.size, 0); });
click(reset); down(); move(210, 450); const reducedDrag = transforms(); up(); click(letters[0]);
check('reduced-motion drag keeps its chosen placement without a release jump or click toss', () => { assert.deepEqual(transforms(), reducedDrag); assert.equal(frames.size, 0); });
emit(letters[0], 'click', { detail: 0 });
check('keyboard activation remains available after a drag', () => { assert.notDeepEqual(transforms(), reducedDrag); assert.equal(frames.size, 0); });
const homeKey = emit(letters[0], 'keydown', { key: 'Home' });
check('Home resets directly in reduced motion', () => { assert.equal(homeKey.defaultPrevented, true); assert.deepEqual(transforms(), resting); });
reduced.matches = false; emit(reduced, 'change'); down(); move(190, 450);
desktop.matches = false; emit(desktop, 'change');
check('mobile/short windows hide all controls, release capture and recover focus', () => { assert.equal(root.hidden, true); assert.equal(frames.size, 0); assert.equal(letters[0].hasPointerCapture(7), false); assert.equal(document.activeElement, toggle); });
click(mix); assert.equal(frames.size, 0); desktop.matches = true; emit(desktop, 'change'); settle();
check('returning to desktop restores the canonical word', () => assert.deepEqual(transforms(), resting));
down(); move(200, 450); stage.rect = { ...stage.rect, width: 220, height: 94 }; observers[0].fire(); settle();
check('resize remeasures once and safely clears the old pointer offset', () => { assert.equal(letters[0].dataset.grabbed, undefined); assert.equal(letters[0].hasPointerCapture(7), false); assert.ok(parseFloat(root.style['--type-letter-size']) < 44); });
observers[0].fire(); settle();
check('unchanged resize notifications return to zero idle work', () => assert.equal(frames.size, 0));
down(); move(180, 450); abort.abort();
check('abort releases capture, disconnects every observer and cancels all frames', () => { assert.equal(frames.size, 0); assert.equal(root.hidden, true); assert.equal(letters[0].hasPointerCapture(7), false); assert.ok(observers.every(observer => observer.disconnected)); });
observers[0].callback(); observers[1].callback([{ isIntersecting: true }]); observers[2].callback();
check('a queued observer callback after disposal cannot unhide or restart the toy', () => { assert.equal(root.hidden, true); assert.equal(frames.size, 0); });
click(mix); move(250, 450); step();
check('aborted listeners cannot restart the toy', () => assert.equal(frames.size, 0));
const stopped = new AbortController(); stopped.abort(); initTypePlay(stopped.signal);
check('an already-aborted owner allocates no observers', () => assert.equal(observers.length, 3));
const css = await readFile(new URL('../src/type-play.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
check('the desktop-only geometry and focus/forced-colour fallbacks are present', () => {
  assert.match(css, /min-width: 801px.*min-height: 540px/);
  assert.match(css, /\.rail-play \{ display: none; \}/);
  assert.match(css, /flex: 0 1 auto/); assert.match(css, /min-height: 144px/);
  assert.match(css, /:focus-visible/); assert.match(css, /CanvasText/);
  assert.match(html, /id="type-play-help"/); assert.match(html, /data-type-status role="status"/);
});
console.log(JSON.stringify({ mode: 'Pure bounded physics and event/lifecycle fixtures; not a browser render or device FPS', passed: checks.length, checks }, null, 2));
