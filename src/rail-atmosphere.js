import { createRailFlow } from './rail-flow.js';

function startRailFlow(canvas) {
  if (typeof Worker !== 'function' || !canvas.transferControlToOffscreen) return createRailFlow(canvas);
  let worker, fallback, running = false;
  const restore = event => {
    event?.preventDefault();
    worker?.terminate();
    worker = null;
    const replacement = canvas.cloneNode();
    canvas.replaceWith(replacement);
    fallback = createRailFlow(replacement);
    fallback?.setRunning(running);
  };
  try {
    worker = new Worker(new URL('./rail-flow-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('error', restore, { once: true });
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({ canvas: offscreen, running }, [offscreen]);
  } catch {
    restore();
  }
  return {
    setRunning(value) {
      if (running === value) return;
      running = value;
      worker?.postMessage({ running });
      fallback?.setRunning(running);
    },
    destroy() {
      worker?.terminate();
      worker = null;
      fallback?.destroy();
    },
  };
}
// One owner gates the supplied flow field and its CSS grain together.
export function initRailAtmosphere(signal) {
  const rail = document.querySelector('.profile-sticky');
  const noop = { setDialogOpen() {} };
  if (!rail || signal.aborted) return noop;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const backdrop = document.createElement('div');
  backdrop.className = 'rail-atmosphere';
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.dataset.running = 'false';
  const canvas = document.createElement('canvas');
  canvas.className = 'rail-flow-canvas';
  backdrop.append(canvas);
  rail.prepend(backdrop);
  const flow = startRailFlow(canvas);
  let visible = false, dialogOpen = false, pageActive = true;
  const on = (target, type, listener) => target.addEventListener(type, listener, { signal, passive: true });
  function sync() {
    const running = visible && pageActive && !dialogOpen && !document.hidden && !reduced.matches && !forced.matches
      && document.documentElement.dataset.entry !== 'loading' && !signal.aborted;
    backdrop.dataset.running = String(running);
    flow?.setRunning(running);
  }
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    const entry = entries.find(item => item.target === rail);
    if (!entry) return;
    visible = entry.isIntersecting && entry.intersectionRatio >= .01;
    sync();
  }, { threshold: .01 }) : null;
  observer?.observe(rail);
  on(document, 'visibilitychange', sync);
  on(document, 'portfolio:entryready', sync);
  on(reduced, 'change', sync);
  on(forced, 'change', sync);
  on(window, 'pagehide', () => { pageActive = false; sync(); });
  on(window, 'pageshow', () => { pageActive = true; sync(); });
  signal.addEventListener('abort', () => {
    sync();
    observer?.disconnect();
    flow?.destroy();
    backdrop.remove();
  }, { once: true });
  return { setDialogOpen(open) { dialogOpen = Boolean(open); sync(); } };
}
