// Deterministic native-animation fixture. These are continuity/lifecycle checks,
// not measurements of browser frames or physical iPhone performance.
import assert from 'node:assert/strict';
import { createThemePanelMotion, panelFrame } from '../src/theme-panel-motion.js';

const passed = [], jobs = [], rests = [];
const check = (name, fn) => { fn(); passed.push(name); };
const surfaces = ['glass', 'menu', 'rim', 'tone', 'close', 'closeSurface'];
const elements = Object.fromEntries(surfaces.map(key => [key, {
  style: {}, offsetWidth: 240, offsetHeight: 288, ownerDocument: { timeline: { currentTime: 1000 } },
  animate(frames, timing) {
    let resolve, reject;
    const job = { key, frames, timing, currentTime: 0, startTime: null, cancelled: false,
      finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
      finish() { this.currentTime = timing.duration; resolve(); },
      cancel() { this.cancelled = true; reject(Error('cancelled')); } };
    jobs.push(job); return job;
  },
}]));
const motion = createThemePanelMotion(elements, { onRest: value => rests.push(value) });
const batch = () => jobs.slice(-surfaces.length);
const jobFor = key => batch().find(job => job.key === key);
const seek = index => batch().forEach(job => { job.currentTime = index * job.timing.duration / 60; });
const pAt = frame => (232 - Number(frame.clipPath.match(/inset\(([^p]+)/)[1])) / 232;
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

check('rest is the exact 56px anchored circle, with a matching single rim', () => {
  assert.equal(elements.glass.style.clipPath, 'inset(232px 184px 0px 0px round 28px)');
  assert.equal(elements.rim.style.width, '56px'); assert.equal(elements.rim.style.height, '56px');
});
motion.set({ open: true });
check('all material and icon effects share one native clock', () => {
  assert.equal(jobs.length, surfaces.length);
  assert.ok(batch().every(job => job.startTime === 1000 && job.timing.duration === 460));
});
check('glass never fades, scales content, animates blur or changes panel layout size', () => {
  assert.ok(jobs.filter(job => job.key === 'glass').every(job => job.frames.every(frame =>
    Object.keys(frame).every(key => ['offset','clipPath'].includes(key)))));
});
check('open reaches full panel with aligned X and full opacity content surface', () => {
  assert.equal(batch()[0].frames.at(-1).clipPath, 'inset(0px 0px 0px 0px round 32px)');
  assert.equal(jobFor('close').frames.at(-1).opacity, 1);
  assert.equal(jobFor('close').frames.at(-1).transform, 'translate(4px, -4px) scale(1)');
});
check('the outline follows the same expanding mask at every sample', () => {
  const glass = jobFor('glass').frames;
  const rim = jobFor('rim').frames;
  for (let i = 0; i < glass.length; i++) {
    const [top, right, bottom, left, radius] = [...glass[i].clipPath.matchAll(/([\d.]+)px/g)].map(match => Number(match[1]));
    assert.ok(Math.abs(parseFloat(rim[i].width) - (240 - left - right)) < .0002);
    assert.ok(Math.abs(parseFloat(rim[i].height) - (288 - top - bottom)) < .0002);
    assert.equal(parseFloat(rim[i].borderRadius), radius);
  }
});
check('opening leads with width and reveals menu rows inside the expanding glass', () => {
  const early = panelFrame(.2, 0, 240, 288);
  const middle = panelFrame(.6, 0, 240, 288);
  const width = (parseFloat(early.rim.width) - 56) / (240 - 56);
  const height = (parseFloat(early.rim.height) - 56) / (288 - 56);
  assert.ok(width > height * 1.6);
  assert.equal(early.menu.opacity, 0);
  assert.ok(middle.menu.opacity > 0 && middle.menu.opacity < 1);
  assert.equal(jobFor('menu').frames.at(-1).transform, 'translateY(0px)');
  assert.equal(jobFor('menu').frames.at(-1).opacity, 1);
});
const opening = batch();
seek(12);
motion.set({ open: false });
check('reversing open to close preserves the presented shape and glyph positions', () => {
  for (let i = 0; i < surfaces.length; i++) {
    const previous = { ...opening[i].frames[12], offset: 0 };
    assert.deepEqual(batch()[i].frames[0], previous);
  }
});
check('reversal carries velocity instead of braking abruptly or restarting from rest', () => {
  assert.ok(pAt(batch()[0].frames[1]) > pAt(batch()[0].frames[0]));
  assert.equal(batch()[0].frames.at(-1).clipPath, elements.glass.style.clipPath);
});
check('interrupted effects are cancelled instead of queued', () => assert.ok(opening.every(job => job.cancelled)));
// Complete an obsolete opening after the newer close has started.
opening[0].finish(); await tick();
check('obsolete completion cannot settle or hide an active reverse motion', () => assert.equal(rests.length, 0));
const closing = batch();
seek(16);
motion.set({ open: true });
check('reopening during close also preserves the exact displayed geometry', () => {
  assert.deepEqual(batch()[0].frames[0], { ...closing[0].frames[16], offset: 0 });
});
for (let i = 0; i < 25; i++) {
  batch().forEach(job => { job.currentTime = 40; });
  motion.set({ open: i % 2 === 0 });
}
check('rapid repeated inputs leave only one bounded native batch', () => {
  assert.equal(jobs.filter(job => !job.cancelled).length, surfaces.length);
});
const count = jobs.length;
motion.set({ open: true });
check('same destination does not restart the spring', () => assert.equal(jobs.length, count));
batch()[0].finish(); await tick();
check('completion removes all effects and retains exact underlying endpoints', () => {
  assert.ok(jobs.every(job => job.cancelled));
  assert.deepEqual(rests.at(-1), { open: true, pressed: false });
});
motion.set({ open: false, animate: false });
motion.set({ pressed: true });
check('press compresses the same resting glass circle around its original center', () => {
  assert.equal(batch()[0].frames.at(-1).clipPath, 'inset(234px 186px 2px 2px round 26px)');
});
seek(8);
const pressed = batch();
motion.set({ open: true, pressed: false });
check('press to opening handoff has no material swap or position reset', () => {
  assert.deepEqual(batch()[0].frames[0], { ...pressed[0].frames[8], offset: 0 });
});
check('expanded pressure keeps the full panel stationary', () => {
  assert.deepEqual(panelFrame(1, 1, 240, 288).glass, panelFrame(1, 0, 240, 288).glass);
});
motion.set({ open: false, pressed: false, animate: false });
check('reduced motion synchronously settles and cancels every native effect', () => {
  assert.ok(jobs.every(job => job.cancelled));
  assert.deepEqual(rests.at(-1), { open: false, pressed: false });
});
elements.glass.offsetWidth = 220; elements.glass.offsetHeight = 240;
motion.resize();
check('resize measures the untransformed panel and retains the exact trigger circle', () => {
  assert.equal(elements.glass.style.clipPath, 'inset(184px 164px 0px 0px round 28px)');
});
motion.set({ open: true }); motion.destroy(); const afterDestroy = jobs.length;
motion.set({ open: true });
check('abort destroys effects, restores the circle, and cannot restart', () => {
  assert.ok(jobs.every(job => job.cancelled)); assert.equal(jobs.length, afterDestroy);
  assert.equal(elements.glass.style.clipPath, 'inset(184px 164px 0px 0px round 28px)');
});
const staticGlass = { style: {}, offsetWidth: 240, offsetHeight: 288 };
const styledGlass = {
  ...staticGlass, style: {},
  ownerDocument: {
    defaultView: {
      getComputedStyle: () => ({ getPropertyValue: name => name === '--theme-panel-radius' ? '36px' : '' }),
    },
  },
};
const styledMotion = createThemePanelMotion({ glass: styledGlass });
styledMotion.set({ open: true, animate: false });
check('the open mask uses the same CSS radius token as the inset selection', () => {
  assert.equal(styledGlass.style.clipPath, 'inset(0px 0px 0px 0px round 36px)');
});
let fallbackRest;
const fallback = createThemePanelMotion({ glass: staticGlass }, { onRest: state => { fallbackRest = state; } });
fallback.set({ open: true });
check('missing native API retains a usable immediate panel', () => {
  assert.equal(staticGlass.style.clipPath, 'inset(0px 0px 0px 0px round 32px)');
  assert.equal(fallbackRest.open, true);
});
const failing = { ...elements.glass, style: {}, animate() { throw Error('unavailable'); } };
const failure = createThemePanelMotion({ glass: failing });
check('native animation failure falls back without throwing or leaving stale effects', () => {
  assert.doesNotThrow(() => failure.set({ open: true }));
  assert.equal(failing.style.clipPath, 'inset(0px 0px 0px 0px round 32px)');
});
await tick();
console.log(JSON.stringify({ mode: 'Native-animation fixture; no browser FPS measurement', passed: passed.length, checks: passed }, null, 2));
