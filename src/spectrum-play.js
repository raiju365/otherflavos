import { waveformURL, normalizeWaveform, paintWaveform } from './spectrum-field.js';

export function initSpectrumPlay(signal) {
  const root = document.querySelector('[data-spectrum-play]');
  if (!root || signal.aborted) return () => {};
  const board = root.querySelector('[data-spectrum-board]'), canvas = root.querySelector('canvas');
  if (!board || !canvas) return () => {};
  const desktop = matchMedia('(min-width: 801px) and (min-height: 540px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), forced = matchMedia('(forced-colors: active)');
  const dialog = document.querySelector('#project-detail');
  const on = (target, type, fn) => target?.addEventListener(type, fn, { signal });
  let ctx; try { ctx = canvas.getContext('2d'); } catch { /* Quiet CSS baseline. */ }
  root.dataset.fallback = String(!ctx);
  const field = { width: 0, height: 0, samples: [], image: null, progress: 0, duration: 0 };
  let frame = 0, disposed = false, visible = true, page = true, focused = true, playing = false, trackRevision = 0, load = null;
  const allowed = () => !disposed && !signal.aborted && ctx && !root.hidden && visible && page && focused
    && !document.hidden && !dialog?.open && document.documentElement.dataset.entry !== 'loading';
  function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; root.dataset.active = 'false'; }
  function paint() {
    frame = 0; root.dataset.active = 'false';
    if (!allowed() || forced.matches) return;
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1)), box = board.getBoundingClientRect();
    field.width = box.width; field.height = box.height;
    if (!box.width || !box.height) return;
    const w = Math.round(box.width * ratio), h = Math.round(box.height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const css = getComputedStyle(root);
    paintWaveform(field, { ink: css.color, accent: css.getPropertyValue('--accent').trim() || css.color }, ctx);
  }
  function schedule() {
    if (!allowed() || forced.matches || frame) return;
    frame = requestAnimationFrame(paint); root.dataset.active = 'true';
  }
  function reconcile() {
    root.hidden = !desktop.matches;
    stop(); schedule();
  }
  function cleanup() {
    if (disposed) return; disposed = true; trackRevision++; load?.abort(); stop();
    resize?.disconnect(); intersection?.disconnect(); modal?.disconnect(); theme?.disconnect(); root.hidden = true;
  }
  cleanup.setPlaying = value => { if (!disposed) { playing = value === true; root.dataset.playing = String(playing); } };
  cleanup.setProgress = value => {
    if (disposed || !Number.isFinite(value)) return;
    field.progress = Math.max(0, Math.min(1, value)); root.dataset.progress = field.progress.toFixed(5);
    // Reduced motion keeps the recorded waveform still, rather than scrolling it.
    if (!reduced.matches) schedule();
  };
  cleanup.setTrack = async track => {
    if (disposed || signal.aborted) return;
    const revision = ++trackRevision; load?.abort(); load = new AbortController();
    field.samples = []; field.image = null; field.progress = 0; field.duration = track.duration || 0;
    root.dataset.waveform = 'loading'; schedule();
    const url = waveformURL(track.waveform);
    if (!url) { root.dataset.waveform = 'unavailable'; return; }
    try {
      const active = AbortSignal.any([signal, load.signal, AbortSignal.timeout(12000)]);
      if (new URL(url).pathname.endsWith('.json')) {
        const response = await fetch(url, { signal: active, credentials: 'omit' });
        if (!response.ok) throw new Error('waveform unavailable');
        const data = await response.json();
        if (disposed || revision !== trackRevision || active.aborted) return;
        field.samples = normalizeWaveform(data);
        root.dataset.waveform = field.samples.length ? 'ready' : 'unavailable';
      } else {
        const image = new Image(); image.crossOrigin = 'anonymous'; image.src = url;
        const cancel = () => { image.src = ''; };
        active.addEventListener('abort', cancel, { once: true });
        try { await image.decode(); } finally { active.removeEventListener('abort', cancel); }
        if (disposed || revision !== trackRevision || active.aborted) return;
        field.image = image; root.dataset.waveform = 'image';
      }
      schedule();
    } catch { if (!disposed && revision === trackRevision) { root.dataset.waveform = 'unavailable'; schedule(); } }
  };
  on(desktop, 'change', reconcile); on(reduced, 'change', reconcile); on(forced, 'change', reconcile);
  on(document, 'portfolio:entryready', reconcile); on(document, 'visibilitychange', reconcile);
  on(window, 'resize', reconcile);
  on(window, 'blur', () => { focused = false; reconcile(); }); on(window, 'focus', () => { focused = true; reconcile(); });
  on(window, 'pagehide', () => { page = false; reconcile(); }); on(window, 'pageshow', () => { page = true; reconcile(); });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); reconcile(); }) : null;
  const modal = dialog && typeof MutationObserver === 'function' ? new MutationObserver(reconcile) : null;
  const theme = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
  resize?.observe(board); intersection?.observe(root); modal?.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  theme?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  signal.addEventListener('abort', cleanup, { once: true }); reconcile();
  return cleanup;
}
