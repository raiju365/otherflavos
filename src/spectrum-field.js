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
  if (!samples.length) return { floor: 0, span: 1, motion: [] };
  const sorted = [...samples].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * .12)];
  const span = Math.max(.08, sorted[Math.floor(sorted.length * .96)] - floor);
  const weight = amplitude => amplitude > 0 ? .65 + .35 * (clamp((amplitude - floor) / span, 0, 1) * .8 + amplitude * .2) : 0;
  // A deterministic artistic timeline that also holds still across true silence.
  // This controls formation choreography, never an invented BPM/beat signal.
  const motion = new Float64Array(samples.length);
  for (let i = 1; i < samples.length; i++) motion[i] = motion[i - 1]
    + (weight(samples[i - 1]) + weight(samples[i])) * .5 / Math.max(1, samples.length - 1);
  return { floor, span, motion };
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
export const PARTICLE_FORMS = ['ribbons', 'pleats', 'shards', 'braid', 'cascade', 'fan',
  'calligraphy', 'branches', 'chevrons', 'arches', 'strata', 'comets'];
function createFormationTimeline(random) {
  const order = [];
  // Eight shuffled sets give a long itinerary; adjacent forms never repeat.
  for (let round = 0; round < 8; round++) {
    const set = PARTICLE_FORMS.map((_, i) => i);
    for (let i = set.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)); [set[i], set[j]] = [set[j], set[i]];
    }
    if (set[0] === order.at(-1)) [set[0], set[1]] = [set[1], set[0]];
    order.push(...set);
  }
  if (order.at(-1) === order[0]) [order[order.length - 1], order[order.length - 2]] = [order.at(-2), order.at(-1)];
  let total = 0;
  const stages = order.map(form => {
    const hold = 1.8 + random() * 1.2, morph = 4.8 + random() * 1.6;
    const stage = { form, start: total, hold, morph }; total += hold + morph; return stage;
  });
  return { stages, total };
}
const DEFAULT_TIMELINE = { stages: PARTICLE_FORMS.map((_, form) => ({ form, start: form * 8.5, hold: 2.5, morph: 6 })), total: PARTICLE_FORMS.length * 8.5 };
export function createParticleField(width, height, seed = 'quiet') {
  const random = randomGenerator(seed), phase = random() * Math.PI * 2;
  const timeline = createFormationTimeline(random);
  const count = clamp(Math.round(width * height / 150), 240, 820);
  return { width, height, phase, timeline, particles: Array.from({ length: count }, (_, index) => {
    const u = random() * 2 - 1, v = random() * 2 - 1, depth = random(), lane = index % 2 ? 1 : -1;
    const faces = [
      [[-.91,-.49,-.15],[-.13,-.72,.15],[-.2,.15,.42]],
      [[.04,-.18,.3],[.87,-.2,-.25],[.35,.62,.2]],
      [[-.62,.26,.1],[-.1,.2,-.35],[-.15,.78,.2]]
    ];
    let a = (u + 1) * .5, b = (v + 1) * .5;
    if (a + b > 1) { a = 1 - a; b = 1 - b; }
    const face = faces[index % 3], shard = face[0].map((n, axis) => n + a * (face[1][axis] - n) + b * (face[2][axis] - n));
    const strand = index % 3 - 1, stream = index % 5 - 2, branch = index % 4;
    const theta = (u + 1) * 1.12 - 1.12, reach = .22 + (v + 1) * .37;
    const comet = index % 3, tail = (u + 1) * .5, widthAtTail = .025 + tail * .13;
    const targets = [
      [u * .83, lane * Math.sin(u * 2.6) * .38 + v * .07, lane * Math.cos(u * 2.6) * .32 + v * .06],
      [u * (.43 + (v + 1) * .2) + v * .1, v * .58 + Math.sin(u * 2.2 + phase) * .09, Math.sin(u * Math.PI * 3) * .24 + v * .12],
      shard,
      [Math.sin(u * 4.4 + strand * 2.1) * .26 + strand * .08 + v * .035, u * .78,
        Math.cos(u * 4.4 + strand * 2.1) * .3],
      [stream * .29 + Math.sin(u * 3.4 + stream * .9) * .13 + v * .035, u * .73 + stream * .05,
        Math.cos(u * 2.5 + stream) * .2],
      [Math.sin(theta) * reach, Math.cos(theta) * reach - .38 + v * .025, Math.sin(theta * 3) * .18],
      [u * .77 + Math.sin(u * 4.4) * .12, Math.sin(u * 3.7 + .25) * .53 + v * (.035 + .045 * (1 - u * u)),
        Math.cos(u * 3.7) * .24],
      [u * .76, (branch - 1.5) * .19 * (u + 1) + Math.sin(u * 3 + branch) * .09 + v * .035,
        (branch - 1.5) * .12 + Math.sin(u * 3) * .1],
      [u * .82, Math.asin(Math.sin(u * 4.5)) * .22 + stream * .14 + v * .035,
        stream * .08 + Math.sin(u * 4) * .12],
      [u * (.65 + strand * .06), (.55 - u * u * .95) + strand * .24 + v * .04,
        strand * .15 + u * .1],
      [u * .8, stream * .23 + Math.sin(u * 3.5 + stream * .65) * .16 + v * .045,
        Math.cos(u * 3 + stream) * .22],
      [(.56 - tail * .92) + comet * .08, (comet - 1) * .46 + tail * .17 + v * widthAtTail,
        Math.sin(tail * 3 + comet) * .2]
    ];
    return { u, v, depth, targets, angles: targets.map(([x, y]) => Math.atan2(y, x)),
      phase: random() * Math.PI * 2, delay: (u + 1) * .3 + random() * .4, route: random() * 2 - 1,
      size: 1.5 + depth * depth * 1.1, glyph: index % 11 < 5 ? 0 : index % 11 < 9 ? 1 : 2,
      accent: random() < .16 };
  }) };
}
const smooth = value => { const t = clamp(value, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const mix = (a, b, t) => a + (b - a) * t;
export function formationAt(time, timeline = DEFAULT_TIMELINE) {
  const local = Math.max(0, time) % timeline.total;
  let low = 0, high = timeline.stages.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (timeline.stages[mid].start <= local) low = mid; else high = mid - 1; }
  const stage = timeline.stages[low];
  return { from: stage.form, to: timeline.stages[(low + 1) % timeline.stages.length].form,
    progress: clamp((local - stage.start - stage.hold) / stage.morph, 0, 1) };
}
export function particleGeometry(field, samples, progress, duration, range) {
  const calibration = range?.motion ? range : waveformRange(samples);
  const energy = particleEnergy(samples, progress, duration, calibration);
  const time = sampleAt(calibration.motion, progress) * duration / 1000;
  const formation = formationAt(time, field.timeline);
  const yaw = Math.sin(time * .13 + field.phase) * .35, roll = Math.sin(time * .09 + field.phase) * .12;
  const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw), cosRoll = Math.cos(roll), sinRoll = Math.sin(roll);
  const geometry = field.particles.map(p => {
    const t = smooth((formation.progress - p.delay * .12) / .88), arc = Math.sin(Math.PI * t);
    const from = p.targets[formation.from], to = p.targets[formation.to];
    const wave = Math.sin(p.u * 7 + time * .8 + p.phase) * .027 * energy.level;
    const burst = energy.rise * (.015 + p.depth * .035);
    const x3 = mix(from[0], to[0], t) + arc * p.route * .055 + wave;
    const y3 = mix(from[1], to[1], t) + arc * Math.sin(p.u * 3 + time * .12) * .065 + Math.cos(p.phase) * burst;
    const z3 = mix(from[2], to[2], t) + arc * (.06 + p.depth * .09) + wave;
    const xTurn = x3 * cosYaw + z3 * sinYaw, zTurn = z3 * cosYaw - x3 * sinYaw;
    const perspective = 1 / (1 - zTurn * .24), spread = .43 + energy.level * .035;
    const x = .5 + (xTurn * cosRoll - y3 * sinRoll) * spread * perspective;
    const y = .5 + (xTurn * sinRoll + y3 * cosRoll) * spread * perspective;
    return { x: clamp(x, .045, .955) * field.width, y: clamp(y, .07, .93) * field.height,
      radius: p.size * (1 + energy.level * .15 + p.depth * energy.rise * .16) * clamp(perspective, .8, 1.2),
      alpha: clamp(.7 + p.depth * .17 + zTurn * .08 + energy.level * .08, .65, .98),
      accent: p.accent || (arc > .7 && p.delay > .92), glyph: p.glyph,
      trail: p.accent ? energy.rise * (3 + p.depth * 8) + arc * 5 : 0,
      angle: p.angles[formation.from] + Math.atan2(Math.sin(p.angles[formation.to] - p.angles[formation.from]),
        Math.cos(p.angles[formation.to] - p.angles[formation.from])) * t + time * .08 + p.phase,
      depth: p.depth };
  });
  return { ...energy, formation: PARTICLE_FORMS[formation.from], nextFormation: PARTICLE_FORMS[formation.to],
    morph: formation.progress, points: geometry, width: field.width, height: field.height };
}
export function morphParticlePoses(from, to, progress) {
  const amount = clamp(progress, 0, 1);
  return { ...to, points: to.points.map((p, index) => {
    const old = from.points[index % from.points.length];
    const t = smooth((amount - (index % 13) / 13 * .1) / .9), arc = Math.sin(Math.PI * t);
    const x = old.x / from.width * to.width, y = old.y / from.height * to.height;
    const side = index % 2 ? 1 : -1;
    const radius = mix(old.radius, p.radius, t), margin = radius + 2;
    return { ...p, x: clamp(mix(x, p.x, t) + Math.sin(index * 2.4) * arc * to.width * .022, margin, to.width - margin),
      y: clamp(mix(y, p.y, t) + side * arc * to.height * .026, margin, to.height - margin),
      radius, alpha: mix(old.alpha, p.alpha, t), glyph: t < .5 ? old.glyph : p.glyph,
      angle: old.angle + Math.atan2(Math.sin(p.angle - old.angle), Math.cos(p.angle - old.angle)) * t,
      trail: mix(old.trail, p.trail, t), accent: (t < .45 ? old.accent : p.accent) || (arc > .7 && index % 17 === 0) };
  }) };
}
export function paintParticlePose(geometry, palette, ctx) {
  ctx.clearRect(0, 0, geometry.width, geometry.height);
  // Solid light/orange cores over a dark edge stay distinct from both the
  // bright gradient and the darker grain. Paint the core last, never as a ring.
  for (const p of geometry.points) {
    ctx.globalAlpha = p.alpha; ctx.fillStyle = p.accent ? palette.accent : palette.ink;
    if (p.trail > 1) {
      ctx.strokeStyle = palette.accent; ctx.lineWidth = 1.15; ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(p.angle) * p.trail, p.y - Math.sin(p.angle) * p.trail); ctx.stroke();
    }
    ctx.beginPath();
    if (!p.glyph) ctx.arc(p.x, p.y, p.radius * .86, 0, Math.PI * 2);
    else {
      const cos = Math.cos(p.angle), sin = Math.sin(p.angle), narrow = p.glyph === 1 ? .22 : .65;
      for (const [index, pair] of [[1, 0], [0, narrow], [-1, 0], [0, -narrow]].entries()) {
        const x = p.x + (pair[0] * cos - pair[1] * sin) * p.radius;
        const y = p.y + (pair[0] * sin + pair[1] * cos) * p.radius;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.strokeStyle = '#10130f'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return geometry;
}
