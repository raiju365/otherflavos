// Recorded amplitude data only. No oscillator, synthetic beat or audio capture.
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
export function waveformGeometry(samples, progress, width, height, duration = 0) {
  const count = clamp(Math.floor((width - 32) / 3.5), 32, 240), span = width - 32;
  // The centre cursor is the actual provider position; show ~32 seconds around it.
  const window = duration > 0 ? clamp(32000 / duration, .025, 1) : 1;
  return Array.from({ length: count }, (_, i) => {
    const u = i / (count - 1), position = progress + (u - .5) * window;
    const index = Math.round(position * (samples.length - 1));
    const amplitude = position < 0 || position > 1 ? 0 : samples[index] || 0;
    const edge = Math.min(1, u * 8, (1 - u) * 8);
    return { x: 16 + u * span, amplitude, half: Math.max(.65, amplitude * Math.min(100, height * .34)),
      alpha: edge * (u < .5 ? .38 : .85), past: u < .5 };
  });
}
export function paintWaveform({ width, height, samples, progress, duration, image }, palette, ctx) {
  ctx.clearRect(0, 0, width, height);
  const y = height * .48;
  ctx.fillStyle = palette.ink; ctx.globalAlpha = .14; ctx.fillRect(16, y, width - 32, 1);
  if (samples.length) {
    for (const bar of waveformGeometry(samples, progress, width, height, duration)) {
      ctx.fillStyle = bar.past ? palette.accent : palette.ink; ctx.globalAlpha = bar.alpha;
      ctx.fillRect(bar.x, y - bar.half, 1.5, bar.half * 2);
      ctx.globalAlpha *= .08;
      ctx.fillRect(bar.x, y + Math.min(100, height * .34) + 16, 1.5, bar.half * .3);
    }
  } else if (image) {
    const window = duration > 0 ? clamp(32000 / duration, .025, 1) : 1;
    const full = (width - 32) / window, left = width / 2 - progress * full;
    ctx.save(); ctx.beginPath(); ctx.rect(16, 0, width - 32, height); ctx.clip();
    ctx.globalAlpha = .7; ctx.drawImage(image, left, y - height * .24, full, height * .48); ctx.restore();
  }
  // A quiet, anchored playhead; its position is never driven by a free clock.
  ctx.globalAlpha = samples.length || image ? .9 : .3; ctx.fillStyle = palette.accent;
  ctx.fillRect(width / 2, y - Math.min(100, height * .34) - 10, 1, Math.min(200, height * .68) + 20);
  ctx.fillRect(width / 2 - 1.5, y - Math.min(100, height * .34) - 15, 4, 3);
  ctx.globalAlpha = 1;
}
