// Pure wave/raster and event fixtures. Not browser appearance or device FPS.
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createWaterField, disturbWater, clearWater, stepWater, paintWater } from '../src/water-field.js';
import { initWaterPlay } from '../src/water-play.js';
const checks = [], check = (name, test) => { test(); checks.push(name); };
const sum = array => array.reduce((total, value) => total + Math.abs(value), 0);
const palette = { base: [41, 43, 38], ink: [245, 244, 237], shade: [32, 33, 31] };
check('90 desktop budgets retain the original portrait, identity and 96px theme-control reserve', () => {
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  for (const width of [801, 900, 1100, 1101, 1280, 1699, 1700, 1920, 2560]) for (const height of [540, 600, 601, 650, 651, 800, 801, 820, 900, 1080]) {
    const outer = Math.max(clamp(width * .04, 24, 76), (width - 1540) / 2);
    const rail = width <= 1100 ? 225 : clamp(width * .22, 230, 330), gap = width <= 1100 ? 45 : clamp(width * .055, 40, 102);
    const identityWidth = Math.min(360, rail + outer + gap / 2 - 48);
    const font = height <= 650 ? clamp(identityWidth * .14, 30, 40) : clamp(identityWidth * .16, 30, 52);
    const portrait = height <= 600 ? 125 : height <= 800 ? 180 : width >= 1700 ? 260 : 230;
    const top = height <= 650 ? 10 : clamp(height * .04, 18, 42), bottom = height <= 600 ? 16 : height <= 800 ? 22 : 32;
    const fixed = top + portrait + bottom + font * 1.12 + 12 + 22.4;
    const available = height - (height <= 800 ? 24 : 32) - 96;
    const actual = Math.min(clamp(height - 470, 144, 248), available - fixed - clamp(height * .03, 20, 32));
    assert.ok(actual >= 144); assert.ok(actual - 26 - 32 >= 86);
  }
});
for (const [width, height] of [[220, 86], [300, 144], [300, 190], [800, 600]]) {
  check(`the ${width}x${height} field stays within its bounded raster and sleeps at rest`, () => {
    const field = createWaterField(width, height);
    assert.ok(field.columns <= 112 && field.rows <= 84); assert.equal(stepWater(field, 1), 0); assert.equal(field.active, false);
  });
  check(`a stone at ${width}x${height} propagates, decays and clears to exact rest`, () => {
    const field = createWaterField(width, height); disturbWater(field, .5, .5, 2.8);
    const first = [...field.current]; stepWater(field, 1 / 60); assert.notDeepEqual([...field.current], first);
    let frames = 0;
    while (field.active && frames++ < 650) stepWater(field, 1 / 60);
    assert.ok(frames > 20 && frames < 650); assert.equal(sum(field.current), 0); assert.equal(sum(field.previous), 0);
  });
}
check('two disturbances superpose on the actual height field', () => {
  const first = createWaterField(300, 150), second = createWaterField(300, 150), both = createWaterField(300, 150);
  disturbWater(first, .36, .5, .6); disturbWater(second, .62, .5, .6);
  disturbWater(both, .36, .5, .6); disturbWater(both, .62, .5, .6);
  for (let n = 0; n < 12; n++) { stepWater(first, 1 / 60); stepWater(second, 1 / 60); stepWater(both, 1 / 60); }
  both.current.forEach((value, index) => assert.ok(Math.abs(value - first.current[index] - second.current[index]) < .00001));
});
check('30/60/120Hz delivery retains the same fixed-step wave state', () => {
  const fields = [30, 60, 120].map(rate => {
    const field = createWaterField(300, 144); disturbWater(field, .4, .5, 2);
    for (let frame = 0; frame < rate / 2; frame++) stepWater(field, 1 / rate);
    return field;
  });
  assert.deepEqual(fields[0].current, fields[1].current); assert.deepEqual(fields[1].current, fields[2].current);
});
check('a long hidden interval is limited to three steps without catch-up', () => {
  const a = createWaterField(280, 130), b = createWaterField(280, 130);
  disturbWater(a, .5, .5); disturbWater(b, .5, .5);
  assert.equal(stepWater(a, 600), 3); stepWater(b, .05); assert.deepEqual(a.current, b.current);
});
check('bursts and edge inputs remain finite with a fixed zero boundary', () => {
  const field = createWaterField(300, 144);
  for (let n = 0; n < 120; n++) { disturbWater(field, (n % 7) / 6, (n % 5) / 4, 200); stepWater(field, 1 / 60); }
  assert.ok(field.current.every(value => Number.isFinite(value) && Math.abs(value) < 12));
  for (let x = 0; x < field.columns; x++) { assert.equal(field.current[x], 0); assert.equal(field.current[(field.rows - 1) * field.columns + x], 0); }
  for (let y = 0; y < field.rows; y++) { assert.equal(field.current[y * field.columns], 0); assert.equal(field.current[y * field.columns + field.columns - 1], 0); }
  const before = [...field.current]; assert.equal(disturbWater(field, NaN, Infinity), false); stepWater(field, NaN); assert.deepEqual([...field.current], before);
});
for (const [name, colors] of Object.entries({ Dark: palette, Light: { base: [250, 251, 245], ink: [32, 34, 29], shade: [240, 240, 235] }, Sage: { base: [43, 54, 39], ink: [240, 243, 229], shade: [37, 45, 36] }, Amethyst: { base: [51, 40, 63], ink: [242, 233, 255], shade: [40, 33, 54] } })) {
  check(`${name} renders changing refraction/shading in opaque, bounded RGBA pixels`, () => {
    const field = createWaterField(300, 144), pixels = paintWater(field, colors), resting = [...pixels];
    disturbWater(field, .5, .5, 2.8); for (let n = 0; n < 8; n++) stepWater(field, 1 / 60);
    assert.equal(paintWater(field, colors, pixels), pixels); assert.notDeepEqual([...pixels], resting);
    let contrast = 0; pixels.forEach((value, index) => { if (index % 4 === 3) assert.equal(value, 255); else contrast = Math.max(contrast, Math.abs(value - resting[index])); });
    assert.ok(contrast > 30); clearWater(field); assert.deepEqual([...paintWater(field, colors)], resting);
  });
}

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
let draws = 0, lastPixels = null, canvasUnavailable = false;
class Canvas extends Element {
  context = { imageSmoothingEnabled: true, createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData: image => { lastPixels = [...image.data]; }, drawImage: () => { draws++; } };
  getContext() { return canvasUnavailable ? null : this.context; }
}
const root = new Element(), board = new Element(), canvas = new Canvas(), drop = new Element(), clear = new Element(), status = new Element(), toggle = new Element(), dialog = new Element();
root.hidden = true; root.children = [board, drop, clear]; board.children = [canvas]; dialog.open = false;
root.querySelector = selector => new Map([['[data-water-board]', board], ['canvas', canvas], ['[data-water-drop]', drop], ['[data-water-clear]', clear], ['[data-water-status]', status]]).get(selector) ?? null;
const desktop = new EventTarget(), reduced = new EventTarget(), forced = new EventTarget(); desktop.matches = true; reduced.matches = forced.matches = false;
globalThis.window = new EventTarget(); window.devicePixelRatio = 1;
globalThis.document = new EventTarget(); document.hidden = false; document.activeElement = null; document.documentElement = { dataset: { entry: 'loading', theme: 'dark' } };
document.querySelector = selector => new Map([['[data-water-play]', root], ['#project-detail', dialog], ['#theme-toggle', toggle]]).get(selector) ?? null;
document.createElement = () => new Canvas();
globalThis.getComputedStyle = () => ({ getPropertyValue: key => (document.documentElement.dataset.theme === 'light'
  ? { '--surface': '#fafbf5', '--fg': '#20221d', '--bg': '#f0f0eb' } : { '--surface': '#292b26', '--fg': '#f5f4ed', '--bg': '#20211f' })[key] });
globalThis.matchMedia = query => query.includes('min-width') ? desktop : query.includes('forced') ? forced : reduced;
const observers = [];
class Observer { constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } fire(entries = []) { if (!this.disconnected) this.callback(entries); } }
globalThis.ResizeObserver = class extends Observer {}; globalThis.IntersectionObserver = class extends Observer {}; globalThis.MutationObserver = class extends Observer {};
let serial = 0, clock = 0; const frames = new Map();
globalThis.performance = { now: () => clock };
globalThis.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; }; globalThis.cancelAnimationFrame = id => frames.delete(id);
function step(ms = 1000 / 60) { clock += ms; const batch = [...frames.values()]; frames.clear(); batch.forEach(callback => callback(clock)); }
function settle() { let n = 0; while (frames.size && n++ < 700) step(); assert.equal(frames.size, 0, 'water must return to idle'); return n; }
function emit(element, type, properties = {}) { const event = new Event(type, { cancelable: true }); for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value }); element.dispatchEvent(event); return event; }
const click = (target = board, detail = 1) => emit(target, 'click', { detail, clientX: 240, clientY: 475 });
const move = (x, y, id = 7, pointerType = 'mouse') => emit(board, 'pointermove', { pointerId: id, pointerType, clientX: x, clientY: y });
const down = (id = 7) => emit(board, 'pointerdown', { pointerId: id, button: 0, isPrimary: true, clientX: 240, clientY: 475 });
const abort = new AbortController(); setMaxListeners(0, abort.signal); initWaterPlay(abort.signal);
check('entry loads a static water surface with no competing frame chain', () => { assert.equal(root.hidden, false); assert.equal(frames.size, 0); click(drop); assert.equal(frames.size, 0); assert.ok(draws > 0); });
document.documentElement.dataset.entry = 'ready'; emit(document, 'portfolio:entryready'); const resting = lastPixels;
check('ready water stays still until user input', () => assert.equal(frames.size, 0));
click(); step();
check('a click changes real rendered pixels and starts one water owner', () => { assert.equal(frames.size, 1); assert.notDeepEqual(lastPixels, resting); assert.equal(board.dataset.disturbed, 'true'); });
const settled = settle();
check('the field settles to identical resting pixels with zero idle frames', () => { assert.ok(settled > 60 && settled < 650); assert.deepEqual(lastPixels, resting); assert.equal(root.dataset.active, 'false'); });
emit(board, 'pointerenter'); for (let n = 0; n < 180; n++) move(120 + n % 230, 440 + Math.sin(n) * 20);
check('rapid movement batches input into one bounded frame chain', () => assert.equal(frames.size, 1));
step(); assert.notDeepEqual(lastPixels, resting); click(clear);
check('Clear cancels input, pending waves and all animation immediately', () => { assert.equal(frames.size, 0); assert.deepEqual(lastPixels, resting); assert.equal(board.dataset.disturbed, undefined); });
down(); move(280, 490, 8);
check('another pointer cannot disturb a captured interaction', () => assert.equal(frames.size, 0));
move(280, 490); step(); emit(window, 'pointerup', { pointerId: 8 });
check('unrelated release does not end the held pointer', () => assert.equal(board.hasPointerCapture(7), true));
emit(window, 'pointerup', { pointerId: 7 });
check('the real release safely clears capture', () => assert.equal(board.hasPointerCapture(7), false));
click(clear); down(); move(300, 500); step(); emit(window, 'pointerup', { pointerId: 7 });
const beforeDragClick = lastPixels; click();
check('the native click after a long stir adds no second stone', () => assert.deepEqual(lastPixels, beforeDragClick));
click(clear); down(); move(280, 490); board.captures.delete(7); emit(board, 'lostpointercapture', { pointerId: 7 }); click(clear);
check('capture loss and cancellation never strand held input', () => { down(); emit(window, 'pointercancel', { pointerId: 7 }); assert.equal(board.hasPointerCapture(7), false); });
click(clear);
for (const key of ['Enter', ' ']) {
  const e = emit(board, 'keydown', { key });
  check(`${JSON.stringify(key)} keeps native single button activation`, () => { assert.equal(e.defaultPrevented, false); assert.equal(frames.size, 0); });
  click(board, 0); assert.equal(frames.size, 1); click(clear);
}
for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
  const e = emit(board, 'keydown', { key });
  check(`${key} creates a wave without scrolling`, () => { assert.equal(e.defaultPrevented, true); assert.equal(frames.size, 1); }); click(clear);
}
const shortcut = emit(board, 'keydown', { key: 'ArrowLeft', altKey: true });
check('browser modifier shortcuts remain native', () => { assert.equal(shortcut.defaultPrevented, false); assert.equal(frames.size, 0); });
click(drop); step(); const owner = [...frames.keys()][0], beforeTheme = lastPixels; document.documentElement.dataset.theme = 'light'; observers[3].fire();
check('theme recolouring changes the material without replacing its pending owner', () => { assert.equal([...frames.keys()][0], owner); assert.notDeepEqual(lastPixels, beforeTheme); });
click(clear); const lightRest = lastPixels;
for (const gate of ['hidden', 'dialog', 'offscreen', 'pagehide', 'blur']) {
  click(drop); step(); down();
  if (gate === 'hidden') { document.hidden = true; emit(document, 'visibilitychange'); }
  if (gate === 'dialog') { dialog.open = true; observers[2].fire(); }
  if (gate === 'offscreen') observers[1].fire([{ isIntersecting: false }]);
  if (gate === 'pagehide') emit(window, 'pagehide');
  if (gate === 'blur') emit(window, 'blur');
  check(`${gate} releases capture, blocks input and suspends water work`, () => { assert.equal(frames.size, 0); assert.equal(board.hasPointerCapture(7), false); click(drop); assert.equal(frames.size, 0); });
  step(30000); document.hidden = false; dialog.open = false; observers[1].fire([{ isIntersecting: true }]); emit(window, 'pageshow'); emit(window, 'focus'); emit(document, 'visibilitychange'); observers[2].fire();
  check(`${gate} resumes with one bounded owner`, () => assert.equal(frames.size, 1)); click(clear); assert.deepEqual(lastPixels, lightRest);
}
click(drop); step(); emit(document, 'portfolio:sectionstart');
check('section transitions do not freeze an active left-rail interaction', () => assert.equal(frames.size, 1)); click(clear);
reduced.matches = true; emit(reduced, 'change'); const beforeReduced = lastPixels; click(drop);
check('reduced motion gives a static wave without animated frames', () => { assert.notDeepEqual(lastPixels, beforeReduced); assert.equal(frames.size, 0); });
move(160, 460); assert.equal(frames.size, 0); click(clear);
forced.matches = true; emit(forced, 'change'); click(drop);
check('forced colours offer static wave feedback and usable Clear', () => { assert.equal(frames.size, 0); assert.equal(board.dataset.disturbed, 'true'); click(clear); assert.equal(board.dataset.disturbed, undefined); });
forced.matches = reduced.matches = false; emit(forced, 'change'); board.focus(); down(); desktop.matches = false; emit(desktop, 'change');
check('mobile/short windows hide controls, release capture and restore focus', () => { assert.equal(root.hidden, true); assert.equal(document.activeElement, toggle); assert.equal(frames.size, 0); assert.equal(board.hasPointerCapture(7), false); });
desktop.matches = true; emit(desktop, 'change'); click(clear); down(); move(280, 490); board.rect = { ...board.rect, width: 220, height: 86 }; observers[0].fire();
check('resize safely clears stale pointer geometry and resizes the bounded raster', () => { assert.equal(board.hasPointerCapture(7), false); assert.equal(canvas.width, 220); assert.equal(canvas.height, 86); assert.equal(frames.size, 0); });
window.devicePixelRatio = 4; observers[0].fire();
check('output DPR caps at two and repeated size notifications have no idle loop', () => { assert.equal(canvas.width, 440); observers[0].fire(); assert.equal(frames.size, 0); });
down(); move(280, 490); abort.abort(); observers.forEach(observer => observer.callback([{ isIntersecting: true }]));
check('abort removes capture/listeners/observers and late callbacks cannot unhide the toy', () => { assert.equal(board.hasPointerCapture(7), false); assert.equal(root.hidden, true); assert.equal(frames.size, 0); assert.ok(observers.every(o => o.disconnected)); click(drop); assert.equal(frames.size, 0); });
canvasUnavailable = true; const fallbackAbort = new AbortController(); setMaxListeners(0, fallbackAbort.signal); initWaterPlay(fallbackAbort.signal); click(drop);
check('no-canvas environments retain direct click feedback with no frames', () => { assert.equal(root.dataset.fallback, 'true'); assert.equal(board.dataset.disturbed, 'true'); assert.equal(frames.size, 0); click(clear); assert.equal(board.dataset.disturbed, undefined); });
fallbackAbort.abort(); const count = observers.length; const stopped = new AbortController(); stopped.abort(); initWaterPlay(stopped.signal);
check('an already-aborted owner creates no observers or raster work', () => assert.equal(observers.length, count));
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8'), css = await readFile(new URL('../src/water-play.css', import.meta.url), 'utf8');
check('the desktop-only feature replaces the rejected letter toy with native keyboard controls', () => {
  assert.match(html, /<button type="button" class="water-board"/); assert.match(html, /id="water-play-help"/); assert.doesNotMatch(html, /data-type-play/);
  assert.match(css, /min-width: 801px.*min-height: 540px/); assert.match(css, /flex: 0 1 auto/); assert.match(css, /CanvasText/);
});
console.log(JSON.stringify({ mode: 'Wave/raster and event/lifecycle fixtures; not browser rendering or device FPS', passed: checks.length, checks }, null, 2));
