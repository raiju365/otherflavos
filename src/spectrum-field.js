// Original synthetic equalizer. This model never opens an audio source.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function level(u, time) {
  const beat = Math.exp(-((time * 1.8) % 1) * 7);
  const melody = Math.abs(Math.sin(u * 9 - time * 2.1)) * Math.abs(Math.sin(u * 21 + time * 1.3));
  return clamp(.10 + .44 * melody + beat * (.10 + .24 * Math.abs(Math.cos(u * 8)))
    + .08 * Math.sin(u * 43 - time * 4.2) ** 2, .05, .95);
}
export function createSpectrumField(width, height) {
  const count = clamp(Math.round((width - 44) / 9), 20, 56);
  const field = { width, height, bars: Array.from({ length: count }, (_, i) => ({
    u: (i + .5) / count, value: 0, peak: 0, impulse: 0
  })), clock: 0, accumulator: 0 };
  clearSpectrum(field); return field;
}
export function clearSpectrum(field) {
  field.clock = field.accumulator = 0;
  for (const bar of field.bars) { bar.value = bar.peak = level(bar.u, 0); bar.impulse = 0; }
}
export function pulseSpectrum(field, x, y, strength = 1) {
  if (![x, y, strength].every(Number.isFinite) || strength <= 0) return false;
  for (const bar of field.bars) {
    const distance = (bar.u - clamp(x, 0, 1)) / .16;
    bar.impulse = Math.min(.8, bar.impulse + Math.exp(-distance * distance) * clamp(strength, 0, 3) * .22 * (1.25 - clamp(y, 0, 1) * .5));
  }
  return true;
}
export function stepSpectrum(field, elapsed) {
  field.accumulator = Math.min(.05, field.accumulator + clamp(Number.isFinite(elapsed) ? elapsed : 0, 0, .05));
  let count = 0;
  while (field.accumulator + 1e-9 >= 1 / 60 && count < 3) {
    field.clock += 1 / 60;
    for (const bar of field.bars) {
      const target = Math.min(1, level(bar.u, field.clock) + bar.impulse);
      bar.value += (target - bar.value) * (target > bar.value ? .46 : .16);
      bar.peak = Math.max(bar.value, bar.peak - .006);
      bar.impulse *= .91;
      if (bar.impulse < .0001) bar.impulse = 0;
    }
    field.accumulator = Math.max(0, field.accumulator - 1 / 60); count++;
  }
  return count;
}
export function spectrumGeometry(field) {
  const span = Math.max(1, field.width - 44), slot = span / field.bars.length;
  const baseline = field.height * .78, maximum = Math.max(12, field.height * .67 - 16);
  return field.bars.map(bar => ({ x: 22 + bar.u * span - slot * .29,
    y: baseline - Math.max(3, bar.value * maximum), width: Math.max(2, slot * .58),
    height: Math.max(3, bar.value * maximum), peakY: baseline - bar.peak * maximum - 5,
    baseline, hot: bar.impulse > .08 }));
}
export function paintSpectrum(field, palette, context) {
  context.clearRect(0, 0, field.width, field.height);
  context.lineWidth = 1.4; context.strokeStyle = '#080a08';
  for (const bar of spectrumGeometry(field)) {
    context.globalAlpha = 1;
    context.fillStyle = bar.hot ? palette.accent : palette.ink;
    context.strokeRect(bar.x, bar.y, bar.width, bar.height);
    context.fillRect(bar.x, bar.y, bar.width, bar.height);
    context.fillStyle = palette.accent;
    context.fillRect(bar.x, bar.peakY, bar.width, 2);
    context.globalAlpha = .12; context.fillStyle = palette.ink;
    context.fillRect(bar.x, bar.baseline + 5, bar.width, Math.min(field.height * .12, bar.height * .2));
  }
  context.globalAlpha = 1;
}
