import { waveformURL, normalizeWaveform, waveformRange, createParticleField, particleGeometry, morphParticlePoses, paintParticlePose } from './spectrum-field.js';

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
  const field = { width: 0, height: 0, samples: [], image: null, progress: 0, duration: 0, range: { floor: 0, span: 1 } };
  let frame = 0, disposed = false, visible = true, page = true, focused = true, playing = false, trackRevision = 0, load = null;
  let swarm = null, seed = 'quiet', palette = null, ratio = 1, lastPaint = 0, providerTime = null, displayedProgress = 0;
  let lastPose = null, trackMorph = null, morphTick = null;
  const allowed = () => !disposed && !signal.aborted && ctx && !root.hidden && visible && page && focused
    && !document.hidden && !dialog?.open && document.documentElement.dataset.entry !== 'loading';
  function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; lastPaint = 0; morphTick = null; root.dataset.active = 'false'; }
  function readPalette() {
    const css = getComputedStyle(root);
    palette = { ink: css.color, accent: css.getPropertyValue('--accent').trim() || css.color };
  }
  function measure(force = false) {
    if (!ctx || root.hidden) return;
    const box = board.getBoundingClientRect(), nextRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    if (!force && field.width === box.width && field.height === box.height && ratio === nextRatio) return;
    ratio = nextRatio;
    field.width = box.width; field.height = box.height;
    if (!box.width || !box.height) return;
    const w = Math.round(box.width * ratio), h = Math.round(box.height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    swarm = createParticleField(box.width, box.height, seed);
    root.dataset.particles = String(swarm.particles.length);
  }
  function running(time) {
    return playing && !reduced.matches && field.samples.length > 1 && field.duration > 0
      && providerTime !== null && time - providerTime < 800;
  }
  function paint(time = performance.now()) {
    frame = 0;
    if (!allowed() || forced.matches || !swarm) { stop(); return; }
    if (lastPaint && time - lastPaint < 1000 / 30 - .2 && running(time)) { schedule(); return; }
    lastPaint = time;
    // Only bridge short gaps between provider positions. No independent beat clock,
    // and no hidden-time catch-up when playback messages stop.
    if (playing && providerTime !== null) displayedProgress = Math.min(1,
      field.progress + Math.max(0, Math.min(350, time - providerTime)) / Math.max(1, field.duration));
    let pose;
    if (!playing && lastPose) {
      pose = { ...lastPose, width: swarm.width, height: swarm.height, points: lastPose.points.map(p => ({ ...p,
        x: p.x / lastPose.width * swarm.width, y: p.y / lastPose.height * swarm.height })) };
    } else {
      pose = particleGeometry(swarm, field.samples, displayedProgress, field.duration, field.range);
      if (reduced.matches) trackMorph = null;
      if (trackMorph) {
        if (running(time)) trackMorph.elapsed += morphTick === null ? 0 : Math.min(50, time - morphTick);
        const amount = Math.min(1, trackMorph.elapsed / 2400);
        pose = morphParticlePoses(trackMorph.from, pose, amount);
        root.dataset.trackMorph = amount.toFixed(3);
        if (amount === 1) trackMorph = null;
      }
    }
    morphTick = running(time) ? time : null; lastPose = pose;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); paintParticlePose(pose, palette, ctx);
    root.dataset.energy = pose.level.toFixed(3); root.dataset.formation = pose.formation;
    root.dataset.formationMorph = pose.morph.toFixed(3);
    if ((pose.level > 0 || trackMorph) && running(time)) schedule();
    else root.dataset.active = 'false';
  }
  function schedule() {
    if (!allowed() || forced.matches || frame) return;
    frame = requestAnimationFrame(paint); root.dataset.active = 'true';
  }
  function reconcile() {
    if (disposed || signal.aborted) return;
    root.hidden = !desktop.matches;
    stop(); measure(); schedule();
  }
  function cleanup() {
    if (disposed) return; disposed = true; trackRevision++; load?.abort(); stop();
    lastPose = trackMorph = null;
    resize?.disconnect(); intersection?.disconnect(); modal?.disconnect(); theme?.disconnect(); root.hidden = true;
  }
  cleanup.setPlaying = value => {
    if (disposed) return;
    playing = value === true; root.dataset.playing = String(playing);
    if (playing) schedule(); else { providerTime = null; stop(); }
  };
  cleanup.setProgress = value => {
    if (disposed || !Number.isFinite(value)) return;
    field.progress = Math.max(0, Math.min(1, value)); root.dataset.progress = field.progress.toFixed(5);
    providerTime = performance.now();
    if (!playing) displayedProgress = field.progress;
    // Reduced motion keeps the particle composition still.
    if (!reduced.matches) schedule();
  };
  cleanup.setTrack = async track => {
    if (disposed || signal.aborted) return;
    const revision = ++trackRevision; load?.abort(); load = new AbortController();
    trackMorph = lastPose ? { from: lastPose, elapsed: 0 } : null;
    stop(); seed = track.url || track.waveform || 'quiet'; providerTime = null; displayedProgress = 0;
    field.samples = []; field.image = null; field.progress = 0; field.duration = track.duration || 0;
    field.range = { floor: 0, span: 1 }; measure(true);
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
        field.range = waveformRange(field.samples);
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
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); schedule(); }) : null;
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); reconcile(); }) : null;
  const modal = dialog && typeof MutationObserver === 'function' ? new MutationObserver(reconcile) : null;
  const theme = typeof MutationObserver === 'function' ? new MutationObserver(() => { readPalette(); schedule(); }) : null;
  resize?.observe(board); intersection?.observe(root); modal?.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  theme?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  signal.addEventListener('abort', cleanup, { once: true }); readPalette(); reconcile();
  return cleanup;
}
