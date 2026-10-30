// Data-driven particle geometry and lifecycle fixtures, not audible browser tests.
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import { waveformURL, normalizeWaveform, waveformRange, particleEnergy, createParticleField, particleGeometry, formationAt, morphParticlePoses, settleParticlePose, PARTICLE_FORMS } from '../src/spectrum-field.js';
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
  check(`${width}px particle cloud stays inside its canvas with a bounded point count`, () => {
    const field = createParticleField(width, height, 'fixture');
    assert.ok(field.particles.length >= 240 && field.particles.length <= 820);
    for (let form=0;form<PARTICLE_FORMS.length;form++) {
      field.timeline={stages:[{form,start:0,hold:2.5,morph:6},{form:(form+1)%PARTICLE_FORMS.length,start:8.5,hold:2.5,morph:6}],total:17};
      const data=Array(100).fill(1),range=waveformRange(data),duration=120000,speed=range.motion.at(-1)*duration/1000;
      for(const time of [1,3,5.5,8.49]) {
        const geometry = particleGeometry(field, data, time/speed, duration,range);
        assert.ok(geometry.points.every(b => b.x - b.radius >= 0 && b.x + b.radius <= width
          && b.y - b.radius >= 0 && b.y + b.radius <= height && b.alpha >= 0 && b.alpha <= 1));
      }
    }
  });
}
check('energy comes from recorded amplitudes and rising transients, not an invented beat', () => {
  const range = waveformRange(samples);
  assert.ok(particleEnergy(samples, .25, 180000, range).level < particleEnergy(samples, .75, 180000, range).level);
  assert.equal(particleEnergy([0, 0, 0], .5, 1000).level, 0);
  assert.ok(particleEnergy([0, 0, 1, 1], .7, 1000).rise > 0);
});
check('track seeds give irregular repeatable layouts, with a different composition for another song', () => {
  assert.deepEqual(createParticleField(300, 180, 'a'), createParticleField(300, 180, 'a'));
  assert.notDeepEqual(createParticleField(300, 180, 'a'), createParticleField(300, 180, 'b'));
});
check('silence and missing data have no moving particle positions or transient streaks', () => {
  const field = createParticleField(300, 180);
  assert.deepEqual(particleGeometry(field, [], .1, 180000), particleGeometry(field, [], .9, 180000));
  assert.deepEqual(particleGeometry(field, [0, 0], .1, 180000), particleGeometry(field, [0, 0], .9, 180000));
});
check('the same track position reproduces the same pose across seek and timing changes', () => {
  const field = createParticleField(300, 180, 'same');
  assert.deepEqual(particleGeometry(field, samples, .7, 180000), particleGeometry(field, samples, .7, 180000));
});
check('eleven distinct formations remain and the rejected split-shard destination is absent', () => {
  assert.equal(PARTICLE_FORMS.length, 11); assert.ok(!PARTICLE_FORMS.includes('shards'));
  const field = createParticleField(300, 180, 'forms');
  for(let a=0;a<PARTICLE_FORMS.length;a++) for(let b=a+1;b<PARTICLE_FORMS.length;b++) {
    const distance=field.particles.reduce((sum,p)=>sum+Math.hypot(...p.targets[a].map((n,k)=>n-p.targets[b][k])),0)/field.particles.length;
    assert.ok(distance>.25, `${PARTICLE_FORMS[a]} and ${PARTICLE_FORMS[b]} are too similar`);
  }
});
check('each shuffled set covers all forms with no adjacent repeats, including timeline wrap', () => {
  const {timeline}=createParticleField(300,180,'sequence');
  const size=PARTICLE_FORMS.length;
  for(let i=0;i<timeline.stages.length;i+=size) assert.equal(new Set(timeline.stages.slice(i,i+size).map(s=>s.form)).size,size);
  timeline.stages.forEach((stage,i)=>{
    assert.notEqual(stage.form,timeline.stages[(i+1)%timeline.stages.length].form);
    assert.ok(stage.morph>=4.8&&stage.morph<=6.4);
    assert.equal(formationAt(stage.start+stage.hold*.5,timeline).from,stage.form);
    assert.ok(formationAt(stage.start+stage.hold+stage.morph*.5,timeline).progress>.49);
  });
  assert.notDeepEqual(timeline.stages.slice(0,size).map(s=>s.form), timeline.stages.slice(size,size*2).map(s=>s.form));
});
check('the morph leaves and arrives with a gradual position and rotation change', () => {
  const field=createParticleField(300,180,'softness'),data=Array(100).fill(1),range=waveformRange(data),duration=120000;
  const stage=field.timeline.stages[0], speed=range.motion.at(-1)*duration/1000;
  const at=t=>particleGeometry(field,data,t/speed,duration,range);
  const a=at(stage.hold), b=at(stage.hold+.05), c=at(stage.hold+.1);
  assert.ok(b.points.every((p,i)=>Math.hypot(p.x-a.points[i].x,p.y-a.points[i].y)<1));
  assert.ok(c.points.every((p,i)=>Math.abs(Math.atan2(Math.sin(p.angle-b.points[i].angle),Math.cos(p.angle-b.points[i].angle)))<.02));
});
check('a silent passage holds the artistic timeline instead of cycling through shapes', () => {
  const data = [1, 0, 0, 0, 1], field = createParticleField(300,180,'silence'), range = waveformRange(data);
  assert.deepEqual(particleGeometry(field,data,.4,120000,range), particleGeometry(field,data,.6,120000,range));
});
check('shape boundaries do not teleport particles at the transition endpoint', () => {
  const field = createParticleField(300,180,'continuity'), data = Array(100).fill(1), range = waveformRange(data);
  const duration = 2000000, speed = range.motion.at(-1) * duration / 1000;
  for(const stage of [...field.timeline.stages.slice(1), {start:field.timeline.total}]) {
    const a = particleGeometry(field,data,(stage.start-.0001)/speed,duration,range);
    const b = particleGeometry(field,data,(stage.start+.0001)/speed,duration,range);
    assert.ok(a.points.every((p,i)=>Math.hypot(p.x-b.points[i].x,p.y-b.points[i].y)<.1));
    assert.ok(a.points.every((p,i)=>Math.abs(Math.atan2(Math.sin(p.angle-b.points[i].angle),Math.cos(p.angle-b.points[i].angle)))<.01));
  }
});
check('track transitions preserve their source pose, settle at the target and remain bounded in between', () => {
  const a = particleGeometry(createParticleField(300,180,'old'), samples,.5,180000);
  const b = particleGeometry(createParticleField(300,180,'new'), samples,.7,180000);
  const start=morphParticlePoses(a,b,0), end=morphParticlePoses(a,b,1);
  assert.ok(start.points.every((p,i)=>Math.hypot(p.x-a.points[i].x,p.y-a.points[i].y)<.0001));
  assert.ok(end.points.every((p,i)=>Math.hypot(p.x-b.points[i].x,p.y-b.points[i].y)<.0001));
  for(const t of [.1,.3,.5,.7,.9]) assert.ok(morphParticlePoses(a,b,t).points.every(p=>p.x-p.radius>=0&&p.x+p.radius<=300&&p.y-p.radius>=0&&p.y+p.radius<=180));
});
check('retargeting a transition starts from the visible intermediate pose', () => {
  const a=particleGeometry(createParticleField(300,180,'a'),samples,.5,180000);
  const b=particleGeometry(createParticleField(300,180,'b'),samples,.5,180000);
  const c=particleGeometry(createParticleField(300,180,'c'),samples,.5,180000);
  const visible=morphParticlePoses(a,b,.43), retarget=morphParticlePoses(visible,c,0);
  assert.ok(retarget.points.every((p,i)=>Math.hypot(p.x-visible.points[i].x,p.y-visible.points[i].y)<.0001));
});
const springStart={width:300,height:180,level:1,points:[{x:70,y:60,radius:2,alpha:.8,angle:0,trail:0,accent:true,glyph:0}]};
const springTarget={...springStart,points:[{...springStart.points[0],x:220,y:110,angle:1}]};
check('position damping converges without overshoot and is consistent at 30 and 60Hz',()=>{
  const run=hz=>{let pose=structuredClone(springStart);for(let i=0;i<hz;i++){pose=settleParticlePose(pose,springTarget,1/hz);assert.ok(pose.points[0].x>=70&&pose.points[0].x<=220);}return pose.points[0];};
  const a=run(30),b=run(60);assert.ok(Math.abs(a.x-b.x)<1e-8);assert.ok(Math.abs(b.x-220)<.001);
});
check('wakes use displayed positions, have a fixed cap and stop on silence or a zero time step',()=>{
  let pose=structuredClone(springStart);
  for(let i=0;i<24;i++)pose=settleParticlePose(pose,springTarget,1/60);
  assert.equal(pose.points[0].wake.length,18);assert.ok(pose.points[0].wake.every(q=>q.x>=70&&q.x<=220));
  const held=settleParticlePose(pose,springTarget,0);assert.deepEqual(held.points[0].wake,pose.points[0].wake);assert.ok(Math.abs(held.points[0].x-pose.points[0].x)<1e-10);
  const silent=settleParticlePose(pose,{...springTarget,level:0},.05);assert.equal(silent.points[0].x,pose.points[0].x);assert.equal(silent.points[0].vx,0);
});
check('a long scheduling gap is bounded and a resized field drops obsolete wake coordinates',()=>{
  assert.deepEqual(settleParticlePose(springStart,springTarget,10),settleParticlePose(springStart,springTarget,.05));
  const resized={...springTarget,width:400};assert.equal(settleParticlePose(springStart,resized,.02),resized);
});
class Element extends EventTarget {
  dataset = {}; hidden = false; children = []; open = false;
  rect = { width: 300, height: 180 };
  getBoundingClientRect() { return this.rect; }
}
let draws = 0, geometry = [], path = [], unavailable = false, clipped = false, clipRect = null;
const corePaths=()=>geometry.filter(([,alpha])=>alpha>=.65);
const paintedPoints=()=>corePaths().reduce((sum,[commands])=>sum+commands.filter(c=>c[0]==='M').length,0);
const context = { setTransform() {}, clearRect() { draws++; geometry = []; },
  save() { clipped=false; }, restore() { clipped=false; }, rect(...args) { clipRect=args; }, clip() { clipped=true; },
  beginPath() { path=[]; }, moveTo(...args) { path.push(['M',...args]); }, lineTo(...args) { path.push(['L',...args]); },
  closePath() {}, stroke() { assert.ok(clipped,'particle strokes must stay inside the music bar'); }, fill() { assert.ok(clipped,'particle dots and echoes must stay inside the music bar');geometry.push([path,this.globalAlpha,this.fillStyle]); },
  arc(...args) { path.push(['A',...args]); } };
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
check('the quiet dots paint inside an inset music-bar clip once, with capped DPR and no recurring clock', () => {
  assert.equal(draws, 1); assert.equal(canvas.width, 600); assert.equal(frames.size, 0);
  assert.ok(clipRect[0]>0&&clipRect[1]>0&&clipRect[0]+clipRect[2]<board.rect.width&&clipRect[1]+clipRect[3]<board.rect.height);
});
controller.setPlaying(true); emit(board, 'pointermove'); emit(board, 'click'); step();
check('Play and pointer movement cannot manufacture a beat', () => assert.equal(frames.size, 0));
controller.setTrack({waveform:'https://wave.sndcdn.com/first.json', duration:180000}); answer(requests.at(-1)); await flush(); step();
check('data loading alone cannot start a simulated beat before playback progress', () => { assert.equal(root.dataset.waveform, 'ready'); assert.ok(paintedPoints() > 100); assert.equal(frames.size, 0); });
const before = structuredClone(geometry); for (let i = 0; i < 200; i++) controller.setProgress(.75); step(34); step(34);
check('provider updates wake one particle owner with actual recorded energy', () => { assert.ok(JSON.stringify(geometry) !== JSON.stringify(before)); assert.equal(frames.size, 1); assert.equal(root.dataset.progress, '0.75000'); });
controller.setPlaying(false); const midMorph=structuredClone(geometry); step(500);
check('Pause also freezes an unfinished track transition without advancing its clock', () => {assert.equal(frames.size,0);assert.deepEqual(geometry,midMorph);});
controller.setPlaying(true); controller.setProgress(.75); step(34);
const startDraws = draws;
for (let n = 0; n < 180; n++) { if (n % 10 === 0) controller.setProgress(.75 + n / 180000); step(); }
check('continuous playback uses one 60Hz owner, small circular dots and at most eight core paths', () => { assert.equal(frames.size, 1); assert.ok(draws-startDraws>=175&&draws-startDraws<=181);assert.ok(corePaths().length<=8);assert.ok(geometry.length<=14);assert.ok(paintedPoints()>=240);assert.ok(geometry.every(([commands])=>commands.every(c=>c[0]==='M'||c[0]==='A')));assert.ok(corePaths().every(([commands])=>commands.filter(c=>c[0]==='A').every(c=>c[3]>=.55&&c[3]<=1.05)));assert.equal(root.dataset.trackMorph,'1.000'); });
controller.setPlaying(false); const held = structuredClone(geometry); for (let i = 0; i < 60; i++) step();
check('Pause immediately cancels frames and freezes the exact particle pose', () => { assert.equal(frames.size, 0); assert.deepEqual(geometry, held); });
controller.setPlaying(true); controller.setProgress(.8); for (let i = 0; i < 70; i++) step();
check('stale provider progress cannot sustain an independent animation clock', () => assert.equal(frames.size, 0));
document.hidden = true; emit(document, 'visibilitychange'); controller.setProgress(.5);
check('hidden pages retain position without drawing', () => assert.equal(frames.size, 0));
document.hidden = false; emit(document, 'visibilitychange'); step();
check('visibility restore uses the newest provider position without catch-up', () => { assert.equal(root.dataset.progress, '0.50000'); assert.equal(frames.size, 1); });
dialog.open = true; observers[2].fire(); controller.setProgress(.6);
check('open project dialogs suppress waveform drawing', () => assert.equal(frames.size, 0));
dialog.open = false; observers[2].fire(); step();
reduced.matches = true; emit(reduced, 'change'); step(); controller.setProgress(.7);
check('reduced motion retains a still composition with zero particle loops', () => assert.equal(frames.size, 0));
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
check('missing or unsafe waveform data stays as quiet dust without fake rhythm', () => { assert.equal(root.dataset.waveform, 'unavailable'); assert.ok(paintedPoints() >= 240); assert.equal(frames.size, 0); });
controller.setTrack({waveform:'https://wave.sndcdn.com/aborted.json'}); const pending = requests.at(-1); abort.abort(); answer(pending); await flush();
check('abort cancels pending data, frames and every observer; late results cannot revive it', () => { assert.equal(frames.size, 0); assert.equal(pending.options.signal.aborted, true); assert.ok(observers.every(o => o.dead)); assert.equal(root.hidden, true); });
unavailable = true; const fallbackAbort = new AbortController(); setMaxListeners(0, fallbackAbort.signal); initSpectrumPlay(fallbackAbort.signal); step();
check('missing canvas keeps the static dust fallback', () => assert.equal(root.dataset.fallback, 'true')); fallbackAbort.abort();
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../src/spectrum-field.js', import.meta.url), 'utf8');
check('spatial flow is kept separate from amplitude data and there are no vocal/frequency claims', () => {
  assert.doesNotMatch(source.slice(source.indexOf('export function particleEnergy'), source.indexOf('function randomGenerator')), /Math\.sin|Math\.cos|Math\.random/);
  assert.match(html, /recorded waveform/); assert.match(html, /not live frequency analysis/);
  assert.doesNotMatch(html, /Move to shape the bands/);
});
console.log(JSON.stringify({mode:'Recorded-amplitude particle fixtures; no FFT or stem separation claim',passed:checks.length,checks},null,2));
