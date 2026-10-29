// Recorded waveform geometry and lifecycle fixtures, not audible browser tests.
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import { waveformURL, normalizeWaveform, waveformGeometry } from '../src/spectrum-field.js';
import { initSpectrumPlay } from '../src/spectrum-play.js';
const checks = [], check = (name, fn) => { fn(); checks.push(name); };
check('waveform metadata accepts only exact HTTPS provider hosts and known formats', () => {
  assert.equal(waveformURL('https://wave.sndcdn.com/fixture.json'), 'https://wave.sndcdn.com/fixture.json');
  for (const url of ['http://wave.sndcdn.com/a.json', 'https://wave.sndcdn.com.attacker.test/a.json', 'javascript:alert(1)', 'https://attacker.test/a.json']) assert.equal(waveformURL(url), null);
});
check('recorded amplitudes normalize without inventing values, including silence', () => {
  assert.deepEqual(normalizeWaveform({ samples: [0, 64, 128], height: 128 }), [0, .5, 1]);
  assert.deepEqual(normalizeWaveform({ samples: [0, 0] }), [0, 0]);
  assert.deepEqual(normalizeWaveform({ samples: [1, NaN] }), []);
  assert.deepEqual(normalizeWaveform({ samples: [1, -1] }), []);
});
const samples = Array.from({length: 1000}, (_, i) => i < 500 ? .1 : .9);
for (const [width, height] of [[220, 86], [300, 144], [470, 390], [780, 900]]) {
  check(`${width}px recorded waveform stays inside its canvas`, () => {
    for (const p of [0, .25, .5, 1]) {
      const bars = waveformGeometry(samples, p, width, height, 180000);
      assert.ok(bars.every(b => b.x >= 0 && b.x <= width && b.half <= height * .34 && Number.isFinite(b.alpha)));
    }
  });
}
check('moving provider position selects different recorded samples, never elapsed wall time', () => {
  const a = waveformGeometry(samples, .25, 300, 180, 180000), b = waveformGeometry(samples, .75, 300, 180, 180000);
  assert.ok(a[40].amplitude < b[40].amplitude);
  assert.deepEqual(a, waveformGeometry(samples, .25, 300, 180, 180000));
  assert.ok(waveformGeometry([], .5, 300, 180).every(b => b.amplitude === 0));
});
class Element extends EventTarget {
  dataset = {}; hidden = false; children = []; open = false;
  rect = { width: 300, height: 180 };
  getBoundingClientRect() { return this.rect; }
}
let draws = 0, geometry = [], unavailable = false;
const context = { setTransform() {}, clearRect() { draws++; geometry = []; },
  fillRect(...args) { geometry.push([...args, this.globalAlpha]); } };
const root = new Element(), board = new Element(), canvas = new Element(), dialog = new Element();
canvas.getContext = () => unavailable ? null : context;
root.querySelector = selector => ({ '[data-spectrum-board]': board, canvas })[selector];
globalThis.window = new EventTarget(); window.devicePixelRatio = 4;
globalThis.document = new EventTarget(); document.hidden = false;
document.documentElement = { dataset: { entry: 'loading' } };
document.querySelector = selector => ({ '[data-spectrum-play]': root, '#project-detail': dialog })[selector];
const desktop = new EventTarget(), reduced = new EventTarget(), forced = new EventTarget(); desktop.matches = true;
globalThis.matchMedia = q => q.includes('min-width') ? desktop : q.includes('forced') ? forced : reduced;
globalThis.getComputedStyle = () => ({ color: '#fff', getPropertyValue: () => '#ff4c13' });
let serial = 0; const frames = new Map(), observers = [], requests = [];
globalThis.requestAnimationFrame = fn => { frames.set(++serial, fn); return serial; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
globalThis.fetch = (url, options) => new Promise(resolve => requests.push({url, options, resolve}));
class Observer { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.dead = true; } fire(arg) { if (!this.dead) this.fn(arg); } }
globalThis.ResizeObserver = class extends Observer {};
globalThis.IntersectionObserver = class extends Observer {};
globalThis.MutationObserver = class extends Observer {};
const emit = (target, type) => target.dispatchEvent(new Event(type));
const step = () => { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn()); };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const answer = request => request.resolve({ok:true, json: async () => ({ samples, height: 1 })});
const abort = new AbortController(); setMaxListeners(0, abort.signal); const controller = initSpectrumPlay(abort.signal);
check('entry starts no animation and requests no waveform before a track exists', () => { assert.equal(frames.size, 0); assert.equal(requests.length, 0); });
document.documentElement.dataset.entry = 'ready'; emit(document, 'portfolio:entryready'); step();
check('the quiet baseline paints once with DPR capped at two and no recurring clock', () => {
  assert.equal(draws, 1); assert.equal(canvas.width, 600); assert.equal(frames.size, 0);
});
controller.setPlaying(true); emit(board, 'pointermove'); emit(board, 'click');
check('Play and pointer movement cannot manufacture a beat', () => assert.equal(frames.size, 0));
controller.setTrack({waveform:'https://wave.sndcdn.com/first.json', duration:180000}); answer(requests.at(-1)); await flush(); step();
check('only the supplied recorded waveform becomes the visible track geometry', () => { assert.equal(root.dataset.waveform, 'ready'); assert.ok(geometry.length > 100); assert.equal(frames.size, 0); });
const before = structuredClone(geometry); for (let i = 0; i < 200; i++) controller.setProgress(.75); step();
check('repeated provider updates share one draw and scroll the actual waveform', () => { assert.notDeepEqual(geometry, before); assert.equal(frames.size, 0); assert.equal(root.dataset.progress, '0.75000'); });
document.hidden = true; emit(document, 'visibilitychange'); controller.setProgress(.5);
check('hidden pages retain position without drawing', () => assert.equal(frames.size, 0));
document.hidden = false; emit(document, 'visibilitychange'); step();
check('visibility restore draws the latest provider position once', () => { assert.equal(root.dataset.progress, '0.50000'); assert.equal(frames.size, 0); });
dialog.open = true; observers[2].fire(); controller.setProgress(.6);
check('open project dialogs suppress waveform drawing', () => assert.equal(frames.size, 0));
dialog.open = false; observers[2].fire(); step();
reduced.matches = true; emit(reduced, 'change'); step(); controller.setProgress(.7);
check('reduced motion does not scroll on incoming playback updates', () => assert.equal(frames.size, 0));
reduced.matches = false; emit(reduced, 'change'); step();
desktop.matches = false; emit(desktop, 'change'); controller.setProgress(.8);
check('compact view hides the waveform without removing playback controls', () => { assert.equal(root.hidden, true); assert.equal(frames.size, 0); });
desktop.matches = true; emit(desktop, 'change'); step();
controller.setTrack({waveform:'https://wave.sndcdn.com/obsolete.json'}); const old = requests.at(-1);
controller.setTrack({waveform:'https://wave.sndcdn.com/current.json'}); const current = requests.at(-1);
answer(old); await flush();
check('a late waveform from the previous song cannot replace the latest track', () => { assert.equal(old.options.signal.aborted, true); assert.equal(root.dataset.waveform, 'loading'); });
answer(current); await flush(); step();
controller.setTrack({waveform:'https://attacker.test/track.json'}); step();
check('missing or unsafe waveform data stays quiet instead of falling back to fake rhythm', () => { assert.equal(root.dataset.waveform, 'unavailable'); assert.equal(geometry.length, 3); });
controller.setTrack({waveform:'https://wave.sndcdn.com/aborted.json'}); const pending = requests.at(-1); abort.abort(); answer(pending); await flush();
check('abort cancels pending data, frames and every observer; late results cannot revive it', () => { assert.equal(frames.size, 0); assert.equal(pending.options.signal.aborted, true); assert.ok(observers.every(o => o.dead)); assert.equal(root.hidden, true); });
unavailable = true; const fallbackAbort = new AbortController(); setMaxListeners(0, fallbackAbort.signal); initSpectrumPlay(fallbackAbort.signal); step();
check('missing canvas keeps the static baseline fallback', () => assert.equal(root.dataset.fallback, 'true')); fallbackAbort.abort();
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../src/spectrum-field.js', import.meta.url), 'utf8');
check('visualization has no synthetic oscillator, fake frequency claims or pointer game', () => {
  assert.doesNotMatch(source, /Math\.sin|Math\.cos|Math\.random/);
  assert.match(html, /recorded waveform/); assert.match(html, /not live frequency analysis/);
  assert.doesNotMatch(html, /Move to shape the bands/);
});
console.log(JSON.stringify({mode:'Recorded waveform and lifecycle fixtures; no FFT or audible playback claim',passed:checks.length,checks},null,2));
