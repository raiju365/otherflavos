// One progress/pressure clock drives the material, its rim and both glyphs.
// Native keyframes do the playback; input samples the interrupted spring once.
const duration = 460, frequency = 20, steps = 60;
const clamp = value => Math.max(0, Math.min(1, value));
const px = value => `${Number(value.toFixed(4))}px`;

export function panelSpring({ from, velocity, to }, seconds) {
  const t = Math.max(0, seconds), error = from - to;
  const slope = velocity + frequency * error, decay = Math.exp(-frequency * t);
  return { value: to + (error + slope * t) * decay,
    velocity: (velocity - frequency * slope * t) * decay };
}

function reveal(progress, start, end) {
  const t = clamp((progress - start) / (end - start));
  return t * t * (3 - 2 * t);
}

export function panelFrame(progress, pressure, width, height, openRadius = 32) {
  const p = clamp(progress), q = clamp(pressure);
  // The circle first widens into a pill, then lifts into the menu. Both axes
  // derive from the same spring so reversal retains their presented velocity.
  const stretch = p * (1 - p);
  const horizontal = p + .72 * stretch;
  const vertical = p - .42 * stretch;
  const inset = 2 * q * (1 - p);
  const top = (height - 56) * (1 - vertical) + inset;
  const right = (width - 56) * (1 - horizontal) + inset;
  const radius = 28 + (openRadius - 28) * p - inset;
  const shift = 4 * p, scale = 1 - .06 * q;
  const toneMix = reveal(p, .08, .49);
  const closeMix = reveal(p, .38, .80);
  const rows = reveal(p, .24, .86);
  const transform = size => `translate(${px(shift)}, ${px(-shift)}) scale(${Number(size.toFixed(5))})`;
  return {
    glass: { clipPath: `inset(${px(top)} ${px(right)} ${px(inset)} ${px(inset)} round ${px(radius)})` },
    // The single decorative edge shares the silhouette, with room for its
    // shadow outside the clip. The actual menu layout stays fixed.
    rim: {
      left: px(inset), bottom: px(inset),
      width: px(width - right - inset), height: px(height - top - inset),
      borderRadius: px(radius), opacity: .9 + .1 * Math.max(p, q),
    },
    menu: { opacity: rows, transform: `translateY(${px(12 * (1 - rows))})` },
    tone: { opacity: 1 - toneMix, transform: transform((1 - .18 * toneMix) * scale) },
    close: { opacity: closeMix, transform: transform((.84 + .16 * closeMix) * scale) },
    closeSurface: { opacity: closeMix, transform: transform(1) },
  };
}
export function createThemePanelMotion(elements, { onRest = () => {}, now = () => performance.now() } = {}) {
  let active = null, progress = 0, pressure = 0, destroyed = false;
  let width = 240, height = 288, openRadius = 32;
  const entries = Object.entries(elements).filter(([, element]) => element);
  function paint(p, q) {
    const frame = panelFrame(p, q, width, height, openRadius);
    for (const [key, element] of entries) Object.assign(element.style, frame[key]);
  }
  function cancel() {
    const previous = active;
    active = null;
    previous?.jobs.forEach(job => job.cancel());
  }
  function settle() {
    cancel(); paint(progress, pressure);
    if (!destroyed) onRest({ open: !!progress, pressed: !!pressure });
  }
  function state(record) {
    const elapsed = typeof record.jobs[0].currentTime === 'number'
      ? record.jobs[0].currentTime : now() - record.started;
    if (elapsed >= duration) return { p: { value: progress, velocity: 0 }, q: { value: pressure, velocity: 0 } };
    // Match the position actually presented by the native linear segments,
    // including their velocity, rather than jumping back to the ideal curve.
    const index = Math.max(0, elapsed) / duration * steps;
    const lower = Math.min(steps - 1, Math.floor(index)), blend = index - lower;
    const sample = key => {
      const from = record.samples[lower][key], to = record.samples[lower + 1][key];
      return { value: from + (to - from) * blend, velocity: (to - from) * steps * 1000 / duration };
    };
    return { p: sample('p'), q: sample('q') };
  }
  function measure() {
    width = elements.glass.offsetWidth || 240;
    height = elements.glass.offsetHeight || 288;
    const style = elements.glass.ownerDocument?.defaultView?.getComputedStyle(elements.glass);
    openRadius = parseFloat(style?.getPropertyValue('--theme-panel-radius')) || 32;
  }
  measure(); paint(0, 0);
  return {
    set({ open = !!progress, pressed = !!pressure, animate = true } = {}) {
      if (destroyed) return;
      const p = Number(open), q = Number(pressed);
      if (animate && p === progress && q === pressure) return;
      const initial = active ? state(active)
        : { p: { value: progress, velocity: 0 }, q: { value: pressure, velocity: 0 } };
      cancel(); progress = p; pressure = q;
      // Endpoints underneath the animation prevent flashes on finish/cancel.
      paint(p, q);
      if (!animate || entries.some(([, element]) => typeof element.animate !== 'function')) { settle(); return; }
      if (Math.abs(initial.p.value-p)+Math.abs(initial.q.value-q)
        +Math.abs(initial.p.velocity)+Math.abs(initial.q.velocity) < .0001) { settle(); return; }
      const record = {
        p: { from: initial.p.value, velocity: initial.p.velocity, to: p },
        q: { from: initial.q.value, velocity: initial.q.velocity, to: q },
        started: now(), jobs: [],
      };
      record.samples = Array.from({ length: steps + 1 }, (_, i) => {
        const t = i * duration / steps / 1000;
        return { p: clamp(i === steps ? p : panelSpring(record.p, t).value),
          q: clamp(i === steps ? q : panelSpring(record.q, t).value) };
      });
      const frames = record.samples.map(sample => panelFrame(sample.p, sample.q, width, height, openRadius));
      try {
        const startTime = elements.glass.ownerDocument?.timeline?.currentTime;
        for (const [key, element] of entries) {
          const job = element.animate(frames.map((frame, i) => ({ offset: i / steps, ...frame[key] })),
            { duration, easing: 'linear', fill: 'none' });
          record.jobs.push(job);
          // All effects share an explicit document-timeline start, even if
          // construction crosses a frame boundary on a slower device.
          if (typeof startTime === 'number') job.startTime = startTime;
          job.finished.catch(() => {});
        }
        active = record;
        record.jobs[0].finished.then(() => { if (active === record) settle(); },
          () => { if (active === record) settle(); });
      } catch {
        record.jobs.forEach(job => job.cancel()); settle();
      }
    },
    settle,
    resize() { cancel(); measure(); settle(); },
    destroy() { destroyed = true; cancel(); progress = pressure = 0; paint(0, 0); },
  };
}
