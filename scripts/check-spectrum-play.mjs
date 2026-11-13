// Actual pointillist renderer/controller fixtures; no detected audio BPM claim.
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import { waveformURL, normalizeWaveform, waveformRange, particleEnergy } from '../src/spectrum-field.js';
import { createPointillistField, pointillistMotion, projectPointillistField, themeInkRGB, createPointillistRenderer, POINTILLIST_FORMS } from '../src/pointillist-flow.js';
import { initSpectrumPlay } from '../src/spectrum-play.js';
const checks=[], check=(name,fn)=>{fn();checks.push(name);};
const samples=Array.from({length:1000},(_,i)=>i<500?.1:.9);
check('waveform URLs accept exact HTTPS provider hosts and known formats',()=>{
  assert.equal(waveformURL('https://wave.sndcdn.com/fixture.json'),'https://wave.sndcdn.com/fixture.json');
  for(const url of ['http://wave.sndcdn.com/a.json','https://wave.sndcdn.com.attacker.test/a.json','javascript:alert(1)','https://attacker.test/a.json'])assert.equal(waveformURL(url),null);
});
check('normalization rejects malformed amplitudes and retains real silence',()=>{
  assert.deepEqual(normalizeWaveform({samples:[0,64,128],height:128}),[0,.5,1]);
  assert.deepEqual(normalizeWaveform({samples:[0,0]}),[0,0]);
  assert.deepEqual(normalizeWaveform({samples:[1,NaN]}),[]);assert.deepEqual(normalizeWaveform({samples:[1,-1]}),[]);
});
check('energy reflects real amplitude and rises, never an invented beat',()=>{
  const range=waveformRange(samples);
  assert.ok(particleEnergy(samples,.25,180000,range).level<particleEnergy(samples,.75,180000,range).level);
  assert.equal(particleEnergy([0,0],.5,1000).level,0);
  assert.ok(particleEnergy([0,0,1,1],.7,1000).rise>0);
});
check('decorative motion has no independent swell or beat signal',()=>{
  for(let time=0;time<30;time+=.01){const a=pointillistMotion(time),b=pointillistMotion(time+.001);
    assert.ok(Math.abs((b.flow-a.flow)/.001-.45)<1e-8);assert.equal(a.swell,undefined);assert.equal(a.impact,undefined);
  }
});
check('the shuffled itinerary visits seven distinct profiles with no adjacent repeats',()=>{
  const forms=new Set();let last=null,stages=0;
  for(let time=0;time<450;time+=.02){const state=pointillistMotion(time);forms.add(state.from);
    assert.notEqual(state.from,state.to);assert.ok(state.morph>=0&&state.morph<=1);
    if(last!==state.from){stages++;last=state.from;}
  }
  assert.equal(forms.size,7);assert.ok(stages>50);
});
for (const [width, height] of [[220, 86], [320, 220], [470, 390], [768, 250], [1000, 240], [1920, 1080]]) {
  check(`${width}px projection retains transparent margins and fine dots within both renderer budgets`, () => {
    for (const fallback of [false, true]) {
      const field = createPointillistField(width, height, fallback);
      assert.ok(field.count > 100 && field.count <= (fallback ? 6500 : 28000));
      for (let time = 0; time < 58; time += 1.9) {
        const state = { ...pointillistMotion(time), impact: 1, body: 1, detail: 1 };
        const dots = projectPointillistField(field, state);
        let left = width;
        let right = 0;
        for (let i = 0; i < dots.length; i += 4) {
          const x = dots[i], y = dots[i + 1], radius = dots[i + 2], alpha = dots[i + 3];
          assert.ok(radius > 0 && radius < 2 && alpha > 0 && alpha <= 1);
          assert.ok(x - radius > 6 && x + radius < width - 6);
          assert.ok(y - radius > 6 && y + radius < height - 6);
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
        assert.ok(right - left > width * .68);
      }
    }
  });
}
function difference(a, b, channels) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (const channel of channels) sum += Math.abs(a[i + channel] - b[i + channel]);
  }
  return sum / (a.length / 4);
}
check('the seven profiles preserve one point surface and produce distinct folds and shading', () => {
  const field = createPointillistField(1000, 240);
  const poses = POINTILLIST_FORMS.map((_, form) => projectPointillistField(field, {
    flow: 1, from: form, to: form, morph: 0, fromSeed: 1.3, toSeed: 1.3,
  }).slice());
  for (let a = 0; a < poses.length; a++) {
    const shade = poses[a].filter((_, i) => i % 4 === 3);
    assert.ok(shade.some(alpha => alpha < .08), 'far side should fade into the background');
    assert.ok(shade.some(alpha => alpha > .78), 'lit points should have a visible highlight');
    for (let b = a + 1; b < poses.length; b++) assert.ok(difference(poses[a], poses[b], [0, 1]) > 2);
  }
});
check('profile transitions are continuous and each profile turns on its own', () => {
  const field = createPointillistField(420, 220);
  const project = state => projectPointillistField(field, state).slice();
  let previous = pointillistMotion(0).from;
  for (let time = .01; time < 450; time += .01) {
    const state = pointillistMotion(time);
    if (state.from === previous) continue;
    const before = project(pointillistMotion(time - .01));
    const after = project(state);
    assert.ok(difference(before, after, [0, 1]) < .65);
    assert.ok(difference(before, after, [2, 3]) < .02);
    previous = state.from;
  }
  for (const form of POINTILLIST_FORMS.keys()) {
    const state = { flow: 1, from: form, to: form, morph: 0, fromSeed: 1.3, toSeed: 1.3 };
    assert.ok(difference(project(state), project({ ...state, flow: 1.5 }), [0, 1]) > 3);
  }
});
check('a measured impact displaces surface points and increases point radius', () => {
  const field = createPointillistField(1000, 240);
  const quiet = pointillistMotion(2);
  const before = projectPointillistField(field, quiet).slice();
  const hit = projectPointillistField(field, { ...quiet, impact: 1, body: 1 });
  assert.ok(difference(before, hit, [0, 1]) > 6);
  for (let i = 2; i < hit.length; i += 4) assert.ok(hit[i] > before[i]);
});
check('all current theme inks resolve to the expected GPU color without a rainbow palette',()=>{
  assert.deepEqual(themeInkRGB('rgb(242, 233, 255)'),[242/255,233/255,1]);
  assert.deepEqual(themeInkRGB('#20221d'),[32/255,34/255,29/255]);
});
check('GPU rendering uploads one batch of shaded dots and releases its graphics resources', () => {
  const calls = [], uniforms = {};
  let released = 0, uploaded;
  const gl = {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4, POINTS: 5,
    ARRAY_BUFFER: 6, FLOAT: 7, STREAM_DRAW: 8,
    createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true,
    deleteShader() { released++; },
    createProgram: () => ({}), attachShader() {}, linkProgram() {}, getProgramParameter: () => true,
    deleteProgram() { released++; },
    createVertexArray: () => ({}), deleteVertexArray() { released++; }, bindVertexArray() {},
    createBuffer: () => ({}), deleteBuffer() { released++; }, bindBuffer() {}, enableVertexAttribArray() {},
    vertexAttribPointer: (...args) => assert.deepEqual(args, [0, 4, 7, false, 0, 0]),
    bufferData: (target, value, usage) => {
      assert.equal(target, gl.ARRAY_BUFFER);
      assert.equal(usage, gl.STREAM_DRAW);
      uploaded = value;
    },
    getUniformLocation: (program, name) => name,
    isContextLost: () => false, viewport() {}, clearColor() {}, clear() {}, enable() {}, blendFuncSeparate() {}, useProgram() {},
    uniform2f: (name, ...value) => uniforms[name] = value,
    uniform1f: (name, value) => uniforms[name] = value,
    uniform3fv: (name, value) => uniforms[name] = value,
    drawArrays: (...value) => calls.push(value),
  };
  const renderer = createPointillistRenderer({ width: 2000, height: 480, getContext: type => type === 'webgl2' ? gl : null });
  const field = createPointillistField(1000, 240);
  renderer.paint(field, { ...pointillistMotion(2), impact: .8 }, 'rgb(32, 34, 29)', 2);
  assert.equal(renderer.kind, 'webgl2');
  assert.deepEqual(calls, [[gl.POINTS, 0, field.count]]);
  assert.equal(uploaded, field.dots);
  assert.equal(uploaded.length, field.count * 4);
  assert.ok(uploaded[0] > 0 && uploaded[2] > 0 && uploaded[3] > 0);
  assert.deepEqual(uniforms.uInk, [32 / 255, 34 / 255, 29 / 255]);
  assert.deepEqual(uniforms.uSize, [1000, 240]);
  assert.equal(uniforms.uRatio, 2);
  renderer.restore();
  renderer.dispose();
  assert.equal(released, 10);
});

class Element extends EventTarget {
  dataset = {}; hidden = false; children = []; open = false;
  rect = { width: 300, height: 180 };
  getBoundingClientRect() { return this.rect; }
}
let draws = 0, geometry = [], path = [], unavailable = false, clipped = false, clipRect = null;
const clipStack = [];
const corePaths = () => geometry.filter(([commands, alpha, , kind]) => kind === 'fill' && alpha >= .65 && commands.some(c => c[0] === 'A'));
const paintedPoints = () => corePaths().reduce((sum, [commands]) => sum + commands.filter(c => c[0] === 'A').length, 0);
const context = { setTransform() {}, clearRect() { draws++; geometry = []; },
  save() { clipStack.push(clipped); }, restore() { clipped = clipStack.pop(); }, rect(...args) { clipRect = args; }, clip() { clipped = true; },
  beginPath() { path = []; }, moveTo(...args) { path.push(['M', ...args]); }, lineTo(...args) { path.push(['L', ...args]); },
  closePath() {},
  stroke() { assert.ok(clipped, 'all data-art lines must stay inside the About canvas'); geometry.push([path, this.globalAlpha, this.strokeStyle, 'stroke', this.lineWidth]); },
  fill() { assert.ok(clipped, 'all data-art nodes must stay inside the About canvas'); geometry.push([path, this.globalAlpha, this.fillStyle, 'fill']); },
  arc(...args) { path.push(['A', ...args]); } };
const root = new Element(), board = new Element(), canvas = new Element(), dialog = new Element(), aboutPanel = new Element();
root.hidden = true;
root.closest = () => aboutPanel;
canvas.getContext = type => type === '2d' && !unavailable ? context : null;
root.querySelector = selector => ({ '[data-spectrum-board]': board, canvas })[selector];
globalThis.window = new EventTarget(); window.devicePixelRatio = 4;
globalThis.document = new EventTarget(); document.hidden = false;
document.documentElement = { dataset: { entry: 'loading' } };
document.querySelector = selector => ({ '[data-spectrum-play]': root, '#project-detail': dialog })[selector];
const desktop = new EventTarget(), reduced = new EventTarget(), forced = new EventTarget(); desktop.matches = true;
globalThis.matchMedia = q => q.includes('min-width') ? desktop : q.includes('forced') ? forced : reduced;
let fixtureInk = '#f4f0e7';
const fixtureColors = Array(6).fill(fixtureInk);
globalThis.getComputedStyle = () => ({ color: root.hidden ? '' : fixtureInk, getPropertyValue: name => {
  const tone = /^--data-art-color-([0-5])$/.exec(name);
  return tone ? (root.hidden ? '' : fixtureColors[Number(tone[1])]) : name === '--bg' ? '#282136' : '#ffa286';
} });
let serial = 0, clock = 0; const frames = new Map(), observers = [], requests = [];
globalThis.performance = { now: () => clock };
globalThis.requestAnimationFrame = fn => { frames.set(++serial, fn); return serial; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
globalThis.fetch = (url, options) => new Promise(resolve => requests.push({url, options, resolve}));
class Observer { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.dead = true; } fire(arg) { if (!this.dead) this.fn(arg); } }
globalThis.ResizeObserver = class extends Observer {};
globalThis.IntersectionObserver = class extends Observer {};
globalThis.MutationObserver = class extends Observer {};
const emit = (target, type) => target.dispatchEvent(new Event(type));
const step = (elapsed = 1000 / 60) => { clock += elapsed; const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(clock)); };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const answer = request => request.resolve({ok:true, json: async () => ({ samples, height: 1 })});
const abort = new AbortController(); setMaxListeners(0, abort.signal); const controller = initSpectrumPlay(abort.signal);
check('entry starts no animation and requests no waveform before a track exists', () => { assert.equal(frames.size, 0); assert.equal(requests.length, 0); });
document.documentElement.dataset.entry = 'ready'; emit(document, 'portfolio:entryready'); step();
check('the visible About field runs one decorative owner before music, with capped DPR', () => {
  assert.equal(draws, 1); assert.equal(canvas.width, 450); assert.equal(frames.size, 1);
  assert.deepEqual(new Set(corePaths().map(([, , color]) => color)), new Set([fixtureInk]), 'first paint must read the theme ink after unhiding the artwork');
  assert.ok(clipRect[0]>0&&clipRect[1]>0&&clipRect[0]+clipRect[2]<board.rect.width&&clipRect[1]+clipRect[3]<board.rect.height);
});
const beforeThemeMotion = Number(root.dataset.motionTime);
fixtureInk = '#20221d'; observers[3].fire(); step();
check('a theme change recolors every particle with the new ink without resetting motion or adding an owner', () => {
  assert.deepEqual(new Set(corePaths().map(([, , color]) => color)), new Set([fixtureInk]));
  assert.ok(Number(root.dataset.motionTime) > beforeThemeMotion); assert.equal(frames.size, 1);
});
controller.setPlaying(true); emit(board, 'pointermove'); emit(board, 'click'); step();
check('Play and pointer input keep one decorative owner without inventing energy', () => { assert.equal(frames.size, 1); assert.equal(root.dataset.energy, '0.000'); });
controller.setTrack({waveform:'https://wave.sndcdn.com/first.json', duration:180000}); answer(requests.at(-1)); await flush(); step();
check('waveform loading retains one flowing owner before audio progress', () => { assert.equal(root.dataset.waveform, 'ready'); assert.ok(paintedPoints() > 20); assert.equal(frames.size, 1); });
controller.setProgress(0,{positionMs:0,durationMs:180000,seek:true});
controller.setProgress(0,{positionMs:0,durationMs:180000}); step(200);
check('a seek to zero followed by buffering never starts an early pulse',()=>{
  assert.equal(root.dataset.renderPositionMs,'0.0'); assert.equal(root.dataset.impact,'0.000');
});
controller.setProgress(.1,{positionMs:500/999*200000,durationMs:200000}); step(34);
check('runtime duration and exact milliseconds replace conflicting metadata and relative progress',()=>{
  assert.equal(root.dataset.durationMs,'200000'); assert.equal(root.dataset.clockSource,'milliseconds');
  assert.equal(root.dataset.progress,'0.50050'); assert.ok(Number(root.dataset.impact)>.5);
});
const clockAnchor=Number(root.dataset.positionMs); step(700);
check('the clock keeps moving between sparse provider updates instead of freezing after 150ms',()=>{
  assert.ok(Number(root.dataset.renderPositionMs)-clockAnchor>=700);
});
step(400);
check('adaptive position prediction never exceeds one second beyond the provider anchor',()=>{
  assert.ok(Number(root.dataset.renderPositionMs)-clockAnchor<=1000.1);
});
controller.setProgress(.25,{positionMs:45000,durationMs:180000}); step(34);
const visibleMotion = Number(root.dataset.motionTime); step(240);
check('a delayed visible frame advances the analytic pattern by real elapsed time',()=>{
  assert.ok(Math.abs(Number(root.dataset.motionTime)-visibleMotion-.24)<.002);
});
controller.setProgress(.25,{positionMs:45000,durationMs:180000,seek:true});
controller.setProgress(.25,{positionMs:45001,durationMs:180000});
clock+=100; const delayedFrames=[...frames.values()]; frames.clear(); delayedFrames.forEach(fn=>fn(clock-300));
check('audio sampling uses current execution time even if the RAF timestamp is stale',()=>{
  assert.ok(Math.abs(Number(root.dataset.renderPositionMs)-45101)<.2);
});
controller.setProgress(.25,{positionMs:45070,durationMs:180000}); step(20);
check('a late progress update slows down instead of replaying an onset',()=>{
  assert.ok(Number(root.dataset.renderPositionMs)>=45101);
  assert.ok(Number(root.dataset.renderPositionMs)<45121);
});
controller.setProgress(.25,{positionMs:45070,durationMs:180000}); step(1100);
check('a repeated provider position cannot hold a pulse at the prediction limit',()=>{
  assert.equal(root.dataset.impact,'0.000'); assert.equal(root.dataset.energy,'0.000');
});
controller.setProgress(.25,{positionMs:45020,durationMs:180000,seek:true}); step(20);
check('an explicit backward seek resets the clock even within the correction window',()=>{
  assert.equal(Number(root.dataset.renderPositionMs),45020);
  assert.equal(root.dataset.impact,'0.000');
});
controller.setProgress(.3,{positionMs:60000,durationMs:180000}); step(300);
controller.setProgress(.3,{positionMs:60300,durationMs:180000}); step(300);
controller.setProgress(.3,{positionMs:60600,durationMs:180000});
const learnedCadence=Number(root.dataset.clockCadenceMs); step(100);
controller.setProgress(.9,{positionMs:150000,durationMs:180000});
check('clock cadence adapts to normal playback updates and ignores a seek jump',()=>{
  assert.ok(learnedCadence>=300&&learnedCadence<500);
  assert.equal(Number(root.dataset.clockCadenceMs),learnedCadence);
});
const before = structuredClone(geometry); for (let i = 0; i < 200; i++) controller.setProgress(.75); step(34); step(34);
check('provider updates wake one particle owner with actual recorded energy', () => { assert.ok(JSON.stringify(geometry) !== JSON.stringify(before)); assert.equal(frames.size, 1); assert.equal(root.dataset.progress, '0.75000'); });
controller.setProgress(500 / 999, {seek:true});
controller.setProgress(500 / 999 + .00001); step(34);
check('a genuine recorded amplitude attack reaches the controller as a strong impact', () => {
  assert.ok(Number(root.dataset.impact) > .5); assert.ok(Number(root.dataset.body) > 0);
});
controller.setPlaying(false); const midMorph=structuredClone(geometry); step(500);
check('music Pause leaves decorative flow running but clears audio-derived thumps', () => { assert.equal(frames.size, 1); assert.equal(root.dataset.impact, '0.000'); assert.equal(root.dataset.body, '0.000'); assert.equal(root.dataset.detail, '0.000'); });
controller.setPlaying(true); controller.setProgress(.75); step(34);
const startDraws = draws;
for (let n = 0; n < 180; n++) { if (n % 10 === 0) controller.setProgress(.75 + n / 180000); step(); }
check('continuous playback uses one owner and five bounded opacity batches of fine dots', () => {
  assert.equal(frames.size, 1); assert.ok(draws - startDraws >= 175 && draws - startDraws <= 181);
  assert.equal(geometry.length, 5); assert.ok(paintedPoints() >= 20 && paintedPoints() <= 6500);
  assert.ok(corePaths().every(([commands]) => commands.every(c => c[0] === 'M' || c[0] === 'A')));
  assert.ok(corePaths().every(([commands]) => commands.filter(c => c[0] === 'A').every(c => c[3] > 0 && c[3] < 2)));
  assert.deepEqual(new Set(corePaths().map(([, , color]) => color)), new Set([fixtureInk]));
  assert.equal(root.dataset.renderer, 'canvas2d'); assert.ok(POINTILLIST_FORMS.includes(root.dataset.formation));

});
controller.setPlaying(false); const held = structuredClone(geometry); for (let i = 0; i < 60; i++) step();
check('music Pause preserves visible movement with one bounded owner', () => { assert.equal(frames.size, 1); assert.notDeepEqual(geometry, held); });
controller.setPlaying(true); controller.setProgress(.8); for (let i = 0; i < 110; i++) step();
check('stale audio progress does not stop decorative motion or advance reported audio position', () => { assert.equal(frames.size, 1); assert.equal(root.dataset.progress, '0.80000'); assert.equal(root.dataset.impact, '0.000'); assert.equal(root.dataset.body, '0.000'); assert.equal(root.dataset.detail, '0.000'); });
document.hidden = true; emit(document, 'visibilitychange'); controller.setProgress(.5);
check('hidden pages retain position without drawing', () => assert.equal(frames.size, 0));
const hiddenMotion = root.dataset.motionTime; step(60000);
document.hidden = false; emit(document, 'visibilitychange'); step();
check('visibility restore uses the newest provider position without hidden-time catch-up', () => { assert.equal(root.dataset.progress, '0.50000'); assert.equal(frames.size, 1); assert.equal(root.dataset.motionTime, hiddenMotion); });
observers[1].fire([{isIntersecting:false}]);
check('offscreen About stops its continuous owner', () => assert.equal(frames.size, 0));
observers[1].fire([{isIntersecting:true}]); step();
emit(window, 'blur');
check('window blur keeps visible artwork moving while actual visibility gates remain active', () => assert.equal(frames.size, 1));
emit(window, 'focus'); step(); forced.matches = true; emit(forced, 'change');
check('forced colors stops the canvas owner', () => assert.equal(frames.size, 0));
forced.matches = false; emit(forced, 'change'); step();
dialog.open = true; observers[2].fire(); controller.setProgress(.6);
check('open project dialogs suppress waveform drawing', () => assert.equal(frames.size, 0));
dialog.open = false; observers[2].fire(); step();
reduced.matches = true; emit(reduced, 'change'); step(); controller.setProgress(.7);
check('reduced motion retains a still composition with zero particle loops', () => assert.equal(frames.size, 0));
const reducedMotionTime = root.dataset.motionTime;
fixtureInk = '#f2e9ff'; observers[3].fire(); step();
check('a reduced-motion theme change repaints once in the new ink without resuming motion', () => {
  assert.deepEqual(new Set(corePaths().map(([, , color]) => color)), new Set([fixtureInk]));
  assert.equal(root.dataset.motionTime, reducedMotionTime); assert.equal(frames.size, 0);
});
reduced.matches = false; emit(reduced, 'change'); step();
board.rect = { width: 276, height: 200 }; emit(window, 'resize'); step();
check('compact About retains visible particles with its own responsive canvas', () => { assert.equal(root.hidden, false); assert.equal(canvas.width, 414); });
aboutPanel.hidden = true; emit(document, 'portfolio:sectionstart'); controller.setProgress(.8);
check('leaving About stops its particle owner even if playback continues', () => assert.equal(frames.size, 0));
aboutPanel.hidden = false; board.rect = { width: 1000, height: 240 }; emit(document, 'portfolio:sectionsettled'); step();
check('returning to About measures the wide surface and resumes one owner', () => { assert.equal(canvas.width, 1500); assert.equal(frames.size, 1); });
const uninterrupted = root.dataset.motionTime;
controller.setTrack({waveform:'https://wave.sndcdn.com/transition.json'}); step();
check('a new song preserves the visible flow phase and never resets the rhythm', () => {
  assert.ok(Number(root.dataset.motionTime) > Number(uninterrupted)); assert.equal(frames.size,1);
});
const lostEvent = new Event('webglcontextlost', { cancelable: true }); canvas.dispatchEvent(lostEvent);
check('graphics loss cancels drawing and retains the static fallback', () => {
  assert.equal(lostEvent.defaultPrevented,true); assert.equal(frames.size,0); assert.equal(root.dataset.fallback,'true');
});
const beforeRestore = root.dataset.motionTime; step(60000); emit(canvas,'webglcontextrestored'); step();
check('graphics restoration resumes one owner without hidden-time catch-up', () => {
  assert.equal(root.dataset.fallback,'false'); assert.equal(frames.size,1); assert.equal(root.dataset.motionTime,beforeRestore);
});
controller.setTrack({waveform:'https://wave.sndcdn.com/obsolete.json'}); const old = requests.at(-1);
controller.setTrack({waveform:'https://wave.sndcdn.com/current.json'}); const current = requests.at(-1);
answer(old); await flush();
check('a late waveform from the previous song cannot replace the latest track', () => { assert.equal(old.options.signal.aborted, true); assert.equal(root.dataset.waveform, 'loading'); });
answer(current); await flush(); step();
controller.setTrack({waveform:'https://attacker.test/track.json'}); step();
check('missing or unsafe waveform data keeps decorative flow without fake energy', () => { assert.equal(root.dataset.waveform, 'unavailable'); assert.ok(paintedPoints() >= 20); assert.equal(root.dataset.energy, '0.000'); assert.equal(frames.size, 1); });
controller.setTrack({waveform:'https://wave.sndcdn.com/aborted.json'}); const pending = requests.at(-1); abort.abort(); answer(pending); await flush();
check('abort cancels pending data, frames and every observer; late results cannot revive it', () => { assert.equal(frames.size, 0); assert.equal(pending.options.signal.aborted, true); assert.ok(observers.every(o => o.dead)); assert.equal(root.hidden, true); });
unavailable = true; const fallbackAbort = new AbortController(); setMaxListeners(0, fallbackAbort.signal); initSpectrumPlay(fallbackAbort.signal); step();
check('missing canvas keeps the static dust fallback', () => assert.equal(root.dataset.fallback, 'true')); fallbackAbort.abort();

const css=await readFile(new URL('../src/spectrum-play.css',import.meta.url),'utf8');
check('the artwork retains theme ink and has no decorative grid or rainbow overrides',()=>{
  assert.doesNotMatch(css,/\.spectrum-board::before|--data-art-color|#[0-9a-f]{3,8}\b/i);assert.match(css,/color:\s*var\(--fg\)/);
});
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
check('accessible copy describes the texture and controls without false audio-analysis claims',()=>{
  assert.match(html,/three-dimensional pointillist ribbon/);assert.match(html,/Highlights follow its folds/);assert.match(html,/pause, resume or mute/);
  assert.doesNotMatch(html,/bass detection|BPM detection|instrument detection/i);
});
console.log(JSON.stringify({mode:'Three-dimensional pointillist ribbon, measured onset responses and lifecycle',passed:checks.length,checks},null,2));
