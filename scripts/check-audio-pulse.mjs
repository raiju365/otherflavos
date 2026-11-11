// Recorded-amplitude reaction fixtures; not a live audio, bass or stem test.
import assert from 'node:assert/strict';
import { createWaveformPulse, sampleWaveformPulse } from '../src/audio-pulse.js';

const checks = [], check = (name, fn) => { fn(); checks.push(name); };
const zero = { impact: 0, body: 0, detail: 0 };
const atMs = (analysis, time) => sampleWaveformPulse(analysis, time / analysis.durationMs);

check('missing, malformed, oversized or unnormalized waveform data is rejected', () => {
  for (const samples of [null, {}, [], [1], [0, NaN], [0, Infinity], [-.1, .2], [0, 1.1], new Array(100001).fill(0)])
    assert.equal(createWaveformPulse(samples, 1000), null);
  for (const duration of [undefined, 0, -1, Infinity, NaN]) assert.equal(createWaveformPulse([0, 1], duration), null);
});
check('invalid cache or track position gives a quiet bounded response', () => {
  for (const cache of [null, {}, { kind: 'recorded-amplitude-pulse', stepMs: 0 }])
    assert.deepEqual(sampleWaveformPulse(cache, .5), zero);
  const cache = createWaveformPulse([0, 1], 1000);
  for (const progress of [NaN, Infinity, -.01, 1.01]) assert.deepEqual(sampleWaveformPulse(cache, progress), zero);
});
check('actual silence remains exactly quiet at every sampled position', () => {
  const cache = createWaveformPulse(new Array(100).fill(0), 10000);
  for (let i = 0; i <= 200; i++) assert.deepEqual(sampleWaveformPulse(cache, i / 200), zero);
});
check('constant nonzero amplitude has a body envelope without manufactured beats', () => {
  const cache = createWaveformPulse(new Array(100).fill(.5), 10000);
  for (let i = 0; i <= 200; i++) {
    const value = sampleWaveformPulse(cache, i / 200);
    assert.equal(value.impact, 0); assert.equal(value.detail, 0); assert.equal(value.body, .5);
  }
});
check('a measured impulse attacks immediately, without an early pulse', () => {
  const samples = new Array(101).fill(0); samples[20] = 1;
  const cache = createWaveformPulse(samples, 2000);
  assert.equal(atMs(cache, 399).impact, 0);
  assert.equal(atMs(cache, 400).impact, 1);
  assert.equal(atMs(cache, 400).detail, 1);
});
check('the impulse releases with separate impact and detail times, without oscillation', () => {
  const samples = new Array(101).fill(0); samples[20] = 1;
  const cache = createWaveformPulse(samples, 2000);
  const a = atMs(cache, 400), b = atMs(cache, 480), c = atMs(cache, 560), d = atMs(cache, 800);
  assert.ok(a.impact > b.impact && b.impact > c.impact && c.impact > d.impact);
  assert.ok(Math.abs(c.impact - Math.exp(-160 / 120)) < 1e-5);
  assert.ok(b.detail < b.impact);
  let last = a.impact;
  for (let t = 401; t <= 1900; t += 7) { const current = atMs(cache, t).impact; assert.ok(current <= last + 1e-6); last = current; }
});
check('a sustained plateau cannot retrigger after its one measured onset', () => {
  const samples = new Array(101).fill(.8); samples.fill(0, 0, 20);
  const cache = createWaveformPulse(samples, 2000);
  const onset = atMs(cache, 400), later = atMs(cache, 1000), end = atMs(cache, 1800);
  assert.ok(onset.impact > .9); assert.ok(later.impact < onset.impact); assert.ok(end.impact < .001);
  assert.ok(end.body > .75);
});
check('falling amplitude and metadata-scale noise do not create new impacts', () => {
  const falling = createWaveformPulse([1, .8, .6, .4, .2, 0], 1000);
  const noise = createWaveformPulse([.5, .502, .499, .501, .5], 1000);
  for (let i = 0; i <= 100; i++) {
    assert.equal(sampleWaveformPulse(falling, i / 100).impact, 0);
    assert.equal(sampleWaveformPulse(noise, i / 100).impact, 0);
  }
});
check('small fluctuations around a loud envelope never become repeated thumps', () => {
  const cache = createWaveformPulse([.5, .52, .49, .515, .5, .525, .505, .5], 1400);
  for (let i = 0; i <= 200; i++) assert.equal(sampleWaveformPulse(cache, i / 200).impact, 0);
  const onset = createWaveformPulse([.2, .2, .8, .8, .8, .8], 1000);
  assert.ok(atMs(onset, 400).impact > .9);
  assert.ok(atMs(onset, 640).impact < .14, 'a single onset must release promptly instead of dragging into the next one');
});
check('seeking is deterministic and does not depend on preceding sample calls', () => {
  const samples = Array.from({ length: 1000 }, (_, i) => i % 120 < 8 ? .9 : .1);
  const cache = createWaveformPulse(samples, 180000), expected = sampleWaveformPulse(cache, .45);
  for (const position of [.9, .01, .45, .8, .2, .45]) sampleWaveformPulse(cache, position);
  assert.deepEqual(sampleWaveformPulse(cache, .45), expected);
  assert.deepEqual(sampleWaveformPulse(createWaveformPulse(samples, 180000), .45), expected);
});
check('coarse waveform metadata still gives one causal impulse with a short decay', () => {
  const cache = createWaveformPulse([0, 1, 1, 0], 3000);
  assert.equal(atMs(cache, 999).impact, 0); assert.equal(atMs(cache, 1000).impact, 1);
  assert.ok(atMs(cache, 1200).impact < .3); assert.ok(atMs(cache, 2000).impact < .003);
});
check('precomputation uses four bounded arrays and all readings stay within zero to one', () => {
  const samples = Array.from({ length: 100000 }, (_, i) => (i % 19) / 18);
  const cache = createWaveformPulse(samples, 240000);
  for (const key of ['amplitude', 'body', 'impact', 'detail']) assert.equal(cache[key].length, samples.length);
  assert.equal(cache.amplitude.byteLength + cache.body.byteLength + cache.impact.byteLength + cache.detail.byteLength, samples.length * 16);
  for (let i = 0; i <= 1000; i++) for (const value of Object.values(sampleWaveformPulse(cache, i / 1000)))
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
});
check('the cache owns its amplitude data and accepts normalized floating-point arrays', () => {
  const input = new Float64Array([0, .8, .1]), cache = createWaveformPulse(input, 1000);
  input[1] = 0; assert.ok(cache.amplitude[1] > .79);
  assert.ok(createWaveformPulse(new Float32Array([0, .5]), 1000));
});

console.log(JSON.stringify({ mode: 'Causal recorded-amplitude pulse fixtures; no bass or instrument detection claim', passed: checks.length, checks }, null, 2));
