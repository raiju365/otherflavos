// Read recorded waveform reactions or offline bass-onset analysis at the
// current provider position. Neither path runs an independent beat clock.
const MAX_SAMPLES = 100000;
const IMPACT_RELEASE_MS = 120;
const DETAIL_RELEASE_MS = 70;
const BODY_RELEASE_MS = 320;
const ONSET_GROUP_MS = 160;
const bound = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const quiet = () => ({ impact: 0, body: 0, detail: 0 });

/** Cache a normalized recorded waveform. `durationMs` is the track duration. */
export function createWaveformPulse(samples, durationMs) {
  if ((!Array.isArray(samples) && !(samples instanceof Float32Array) && !(samples instanceof Float64Array))
    || samples.length < 2 || samples.length > MAX_SAMPLES
    || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  for (const value of samples) if (!Number.isFinite(value) || value < 0 || value > 1) return null;

  const amplitude = Float32Array.from(samples), count = amplitude.length;
  const body = new Float32Array(count), impact = new Float32Array(count), detail = new Float32Array(count);
  const stepMs = durationMs / (count - 1);
  const bodyDecay = Math.exp(-stepMs / BODY_RELEASE_MS);
  const impactDecay = Math.exp(-stepMs / IMPACT_RELEASE_MS);
  const detailDecay = Math.exp(-stepMs / DETAIL_RELEASE_MS);
  body[0] = amplitude[0];
  let lastOnset = -Infinity;
  for (let i = 1; i < count; i++) {
    // Integrate only the preceding known amplitude so the broad envelope is
    // continuous at a bin boundary and never anticipates a future sample.
    body[i] = body[i - 1] * bodyDecay + amplitude[i - 1] * (1 - bodyDecay);
    const rise = Math.max(0, amplitude[i] - amplitude[i - 1]);
    const novelty = Math.max(0, amplitude[i] - body[i]);
    // Gate small fluctuations relative to the local envelope. Only a distinct
    // measured onset expands the motifs; the decorative clock never does.
    const excess = Math.max(0, rise - (.025 + body[i] * .04));
    const onset = novelty > .035 && excess > 0 && (i - lastOnset) * stepMs >= ONSET_GROUP_MS;
    if (onset) lastOnset = i;
    const attack = onset ? bound(excess * 10 + Math.min(rise, novelty) * 1.5) : 0;
    impact[i] = Math.max(attack, impact[i - 1] * impactDecay);
    detail[i] = Math.max(onset ? bound(excess * 4) : 0, detail[i - 1] * detailDecay);
  }
  return Object.freeze({ kind: 'recorded-amplitude-pulse', durationMs, stepMs, amplitude, body, impact, detail });
}

/** Decode the measured low-frequency transients for one exact recording. */
export function createOnsetPulse(data) {
  if (data?.version !== 1 || !Number.isFinite(data.durationMs) || data.durationMs <= 0
    || !Array.isArray(data.onsets) || data.onsets.length > 20000) return null;
  const count = Math.ceil(data.durationMs / 10) + 1;
  if (count > MAX_SAMPLES) return null;
  const stepMs = data.durationMs / (count - 1);
  const amplitude = new Float32Array(count), body = new Float32Array(count);
  const impact = new Float32Array(count), detail = new Float32Array(count);
  let previous = -1;
  for (const onset of data.onsets) {
    if (!Array.isArray(onset) || onset.length !== 2) return null;
    const [time, strength] = onset;
    if (!Number.isFinite(time) || time < 0 || time > data.durationMs || time <= previous
      || !Number.isFinite(strength) || strength < 0 || strength > 1) return null;
    // Round forward so a visual attack cannot precede the measured transient.
    const index = Math.min(count - 1, Math.ceil(time / stepMs));
    amplitude[index] = Math.max(amplitude[index], strength);
    previous = time;
  }
  const impactDecay = Math.exp(-stepMs / IMPACT_RELEASE_MS);
  const detailDecay = Math.exp(-stepMs / DETAIL_RELEASE_MS);
  const bodyDecay = Math.exp(-stepMs / BODY_RELEASE_MS);
  for (let index = 0; index < count; index++) {
    impact[index] = Math.max(amplitude[index], index ? impact[index - 1] * impactDecay : 0);
    detail[index] = Math.max(amplitude[index], index ? detail[index - 1] * detailDecay : 0);
    body[index] = index ? body[index - 1] * bodyDecay + amplitude[index - 1] * (1 - bodyDecay) : 0;
  }
  return Object.freeze({ kind: 'analyzed-audio-pulse', durationMs: data.durationMs, stepMs, amplitude, body, impact, detail });
}

/** Read cached reactions at an actual track position, in constant time. */
export function sampleWaveformPulse(analysis, progress) {
  if (!['recorded-amplitude-pulse', 'analyzed-audio-pulse'].includes(analysis?.kind) || !Number.isFinite(progress) || progress < 0 || progress > 1
    || !Number.isFinite(analysis.stepMs) || analysis.stepMs <= 0
    || !(analysis.amplitude instanceof Float32Array) || analysis.amplitude.length < 2
    || !(analysis.body instanceof Float32Array) || !(analysis.impact instanceof Float32Array)
    || !(analysis.detail instanceof Float32Array)
    || analysis.body.length !== analysis.amplitude.length || analysis.impact.length !== analysis.amplitude.length
    || analysis.detail.length !== analysis.amplitude.length) return quiet();
  const position = progress * (analysis.amplitude.length - 1), index = Math.floor(position);
  const elapsedMs = (position - index) * analysis.stepMs;
  const bodyDecay = Math.exp(-elapsedMs / BODY_RELEASE_MS);
  return {
    impact: bound(analysis.impact[index] * Math.exp(-elapsedMs / IMPACT_RELEASE_MS)),
    body: bound(analysis.body[index] * bodyDecay + analysis.amplitude[index] * (1 - bodyDecay)),
    detail: bound(analysis.detail[index] * Math.exp(-elapsedMs / DETAIL_RELEASE_MS))
  };
}
