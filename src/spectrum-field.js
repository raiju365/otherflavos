// Validated recorded-amplitude metadata, separate from authored visual rhythm.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function waveformURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['wave.sndcdn.com', 'wis.sndcdn.com'].includes(url.hostname)
      && !url.username && !url.password && /\.(json|png)$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}
export function normalizeWaveform(data) {
  if (!Array.isArray(data?.samples) || data.samples.length < 2 || data.samples.length > 100000) return [];
  if (data.samples.some(n => !Number.isFinite(n) || n < 0)) return [];
  const maximum = Number.isFinite(data.height) && data.height > 0 ? data.height : data.samples.reduce((a, b) => Math.max(a, b), 0);
  if (!maximum) return data.samples.map(() => 0);
  return data.samples.map(n => clamp(n / maximum, 0, 1));
}
export function waveformRange(samples) {
  if (!samples.length) return { floor: 0, span: 1 };
  const sorted = [...samples].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * .12)];
  const span = Math.max(.08, sorted[Math.floor(sorted.length * .96)] - floor);
  return { floor, span };
}
function sampleAt(samples, position) {
  if (!samples.length || position < 0 || position > 1) return 0;
  const index = position * (samples.length - 1), left = Math.floor(index), fraction = index - left;
  return samples[left] * (1 - fraction) + (samples[left + 1] ?? samples[left]) * fraction;
}
export function particleEnergy(samples, progress, duration, range = waveformRange(samples)) {
  const amplitude = sampleAt(samples, progress);
  if (amplitude <= 0) return { level: 0, rise: 0 };
  const previous = sampleAt(samples, progress - 140 / Math.max(1, duration));
  return { level: clamp((amplitude - range.floor) / range.span, 0, 1) * .8 + amplitude * .2,
    rise: clamp((amplitude - previous) / range.span * 2.4, 0, 1) };
}
