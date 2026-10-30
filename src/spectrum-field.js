// Recorded amplitude drives the energy; seeded spatial noise only shapes particles.
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
  return { floor, span: Math.max(.08, sorted[Math.floor(sorted.length * .96)] - floor) };
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
function randomGenerator(text) {
  let seed = 2166136261;
  for (const char of String(text)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed += 0x6D2B79F5;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
export function createParticleField(width, height, seed = 'quiet') {
  const random = randomGenerator(seed), phase = random() * Math.PI * 2;
  const count = clamp(Math.round(width * height / 145), 240, 880);
  return { width, height, phase, particles: Array.from({ length: count }, () => {
    const x = random(), depth = random();
    // An irregular folded cloud, with no circular perimeter, grid or centre axis.
    const y = .5 + Math.sin(x * 7.2 + phase) * .17 + (random() - .5) * (.22 + depth * .38);
    return { x, y, depth, phase: random() * Math.PI * 2, speed: .22 + random() * .42,
      size: .55 + depth * depth * 1.5, accent: random() < .14, split: random() - .5 };
  }) };
}
export function particleGeometry(field, samples, progress, duration, range) {
  const energy = particleEnergy(samples, progress, duration, range);
  const time = progress * duration / 1000;
  const geometry = field.particles.map(p => {
    const drift = energy.level * (.045 + p.depth * .035), burst = energy.rise * p.depth;
    const phase = p.phase + (energy.level > 0 ? time * p.speed : 0);
    const fold = Math.sin(p.x * 5.4 + phase) * Math.cos(p.y * 4.7 - phase * .6);
    const x = .5 + (p.x - .5) * (.78 + energy.level * .12 + burst * .15)
      + Math.cos(phase + p.y * 6) * drift + p.split * burst * .1;
    const y = .5 + (p.y - .5) * (.65 + energy.level * .4 + burst * .25) + fold * drift * 1.8;
    const edge = Math.min(1, x * 9, (1 - x) * 9, y * 9, (1 - y) * 9);
    return { x: clamp(x, .035, .965) * field.width, y: clamp(y, .055, .945) * field.height,
      radius: p.size * (.8 + energy.level * .4 + burst * .35),
      alpha: clamp(edge, 0, 1) * (.2 + p.depth * .55) * (.45 + energy.level * .55),
      accent: p.accent, trail: p.accent ? energy.rise * (3 + p.depth * 9) : 0,
      angle: phase + field.phase, depth: p.depth };
  });
  return { ...energy, points: geometry };
}
export function paintParticles(field, samples, progress, duration, range, palette, ctx) {
  ctx.clearRect(0, 0, field.width, field.height);
  const geometry = particleGeometry(field, samples, progress, duration, range);
  // Low-contrast distant dust, with a dark edge on foreground flecks for rail contrast.
  for (const p of geometry.points) {
    ctx.globalAlpha = p.alpha; ctx.fillStyle = p.accent ? palette.accent : palette.ink;
    if (p.trail > 1) {
      ctx.strokeStyle = palette.accent; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(p.angle) * p.trail, p.y - Math.sin(p.angle) * p.trail); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
    if (p.depth > .7) { ctx.strokeStyle = '#080a08'; ctx.lineWidth = .55; ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  return geometry;
}
