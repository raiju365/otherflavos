// Recorded-amplitude reaction fixtures; not a live audio, bass or stem test.
import assert from 'node:assert/strict';
import { createWaveformPulse, createOnsetPulse, sampleWaveformPulse } from '../src/audio-pulse.js';

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
check('several rising bins within one transient trigger a single pulse', () => {
  const samples = Array.from({ length: 101 }, () => .1);
  samples[20] = .6; samples[22] = 1; samples[34] = 1;
  const cache = createWaveformPulse(samples, 2000);
  assert.ok(atMs(cache, 400).impact > .9);
  assert.ok(atMs(cache, 440).impact < atMs(cache, 420).impact);
  assert.ok(atMs(cache, 680).impact > .9);
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

check('measured bass onsets trigger at their audio positions with no early expansion', () => {
  const pulse = createOnsetPulse({ version: 1, durationMs: 2000, onsets: [[400, .8], [900, 1]] });
  assert.equal(pulse.kind, 'analyzed-audio-pulse');
  assert.equal(atMs(pulse, 399).impact, 0);
  assert.ok(Math.abs(atMs(pulse, 400).impact - .8) < 1e-6);
  assert.ok(atMs(pulse, 600).impact < .16);
  assert.equal(atMs(pulse, 900).impact, 1);
});
check('fractional onset positions round forward by at most one analysis bin', () => {
  const pulse = createOnsetPulse({ version: 1, durationMs: 1997, onsets: [[403, 1]] });
  assert.equal(atMs(pulse, 403).impact, 0);
  assert.ok(atMs(pulse, 413).impact > .9);
});
check('bass analysis reads are deterministic across seeks and do not synthesize a tempo', () => {
  const pulse = createOnsetPulse({ version: 1, durationMs: 3000, onsets: [[500, .7], [1100, 1]] });
  const expected = atMs(pulse, 1150);
  for (const time of [2800, 0, 230, 1150]) atMs(pulse, time);
  assert.deepEqual(atMs(pulse, 1150), expected);
  assert.ok(atMs(pulse, 2800).impact < 1e-5);
  const silence = createOnsetPulse({ version: 1, durationMs: 3000, onsets: [] });
  for (let time = 0; time <= 3000; time += 17) assert.deepEqual(atMs(silence, time), zero);
});
check('bass analysis rejects malformed, unsorted and oversized input', () => {
  for (const data of [null, {}, {version:2,durationMs:1000,onsets:[]}, {version:1,durationMs:2000000,onsets:[]},
    ...[[[20, 1], [10, 1]], [[10, 1], [10, .8]], [[-1, 1]], [[1200, 1]], [[10, 2]], [[10, NaN]], [[10]], [null]]
      .map(onsets => ({ version: 1, durationMs: 1000, onsets }))]) assert.equal(createOnsetPulse(data), null);
});

console.log(JSON.stringify({ mode: 'Recorded waveform and measured bass-onset response fixtures', passed: checks.length, checks }, null, 2));
