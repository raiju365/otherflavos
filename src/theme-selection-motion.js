// A non-bouncy spring, evaluated analytically and played by WAAPI. Retargeting
// carries position AND velocity; there is no timer, frame loop or input queue.
const duration = 300, frequency = 26;
export function selectionSpring({ from, velocity, to }, seconds) {
  const t = Math.max(0, seconds), error = from - to;
  const slope = velocity + frequency * error, decay = Math.exp(-frequency * t);
  return {
    y: to + (error + slope * t) * decay,
    velocity: (velocity - frequency * slope * t) * decay,
  };
}

export function createThemeSelectionMotion(element, { now = () => performance.now() } = {}) {
  let active = null, target = 0;
  const transform = y => `translateY(${Number(y.toFixed(3))}px)`;
  function settle() {
    const previous = active;
    active = null;
    previous?.animation.cancel();
  }
  function sample(record, maxY) {
    const elapsed = typeof record.animation.currentTime === 'number'
      ? record.animation.currentTime : now() - record.started;
    if (elapsed >= duration) return { y: record.to, velocity: 0 };
    const state = selectionSpring(record, elapsed / 1000);
    const y = Math.max(0, Math.min(maxY, state.y));
    return { y, velocity: y === state.y ? state.velocity : 0 };
  }
  return {
    move({ y, height, maxY = y, animate = true }) {
      element.style.height = `${height}px`;
      if (animate && active?.to === y) return;
      const state = active ? sample(active, maxY) : { y: target, velocity: 0 };
      settle();
      target = y;
      // The destination is the underlying style even while WAAPI presents
      // the spring. Cancelling/finishing always leaves the exact chosen row.
      element.style.transform = transform(y);
      if (!animate || typeof element.animate !== 'function'
        || (Math.abs(state.y - y) < .01 && Math.abs(state.velocity) < .1)) return;
      const record = { from: state.y, velocity: state.velocity, to: y, started: now(), animation: null };
      const frames = Array.from({ length: 19 }, (_, i) => {
        const offset = i / 18;
        const value = i === 18 ? y : selectionSpring(record, offset * duration / 1000).y;
        return { offset, transform: transform(Math.max(0, Math.min(maxY, value))) };
      });
      try {
        record.animation = element.animate(frames, { duration, easing: 'linear', fill: 'none' });
        active = record;
        record.animation.finished.then(() => {
          if (active === record) settle();
        }, () => {
          if (active === record) active = null;
        });
      } catch { /* The destination style is the static fallback. */ }
    },
    settle,
  };
}
