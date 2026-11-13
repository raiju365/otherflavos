import { createWaveformPulse, sampleWaveformPulse } from './audio-pulse.js';
import { waveformURL, normalizeWaveform, waveformRange, particleEnergy } from './spectrum-field.js';
import { createPointillistField, createPointillistRenderer, pointillistMotion, POINTILLIST_FORMS } from './pointillist-flow.js';

export function initSpectrumPlay(signal) {
  const root = document.querySelector('[data-spectrum-play]');
  if (!root || signal.aborted) return () => {};
  const board = root.querySelector('[data-spectrum-board]'), canvas = root.querySelector('canvas');
  if (!board || !canvas) return () => {};
  const panel = root.closest('.panel');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), forced = matchMedia('(forced-colors: active)');
  const dialog = document.querySelector('#project-detail');
  const on = (target, type, fn) => target?.addEventListener(type, fn, { signal });
  const renderer = createPointillistRenderer(canvas);
  let graphicsLost = false;
  root.dataset.fallback = String(!renderer);
  root.dataset.renderer = renderer?.kind || 'css';
  const field = { width: 0, height: 0, samples: [], image: null, progress: 0, duration: 0, range: { floor: 0, span: 1 }, pulse: null };
  let frame = 0, disposed = false, visible = true, page = true, playing = false, trackRevision = 0, load = null;
  let screen = null, palette = null, ratio = 1, lastPaint = null, providerTime = null, renderPositionMs = 0;
  let morphTick = null, choreographyTime = 0;
  let providerPositionMs = 0;
  let providerCadenceMs = 750;
  let clockLeadMs = 0;
  let awaitingPlayback = false;
  const predictionLimit = () => Math.min(1000, Math.max(250, providerCadenceMs * 1.2));
  const playbackPosition = elapsed => {
    const predictedTime = Math.min(predictionLimit(), elapsed);
    const correction = Math.max(0, clockLeadMs - predictedTime * .2);
    return providerPositionMs + Math.min(predictionLimit(), predictedTime + correction);
  };
  const allowed = () => !disposed && !signal.aborted && renderer && !graphicsLost && !root.hidden && !panel?.hidden && visible && page
    && !document.hidden && !dialog?.open && document.documentElement.dataset.entry !== 'loading';
  function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; lastPaint = null; morphTick = null; root.dataset.active = 'false'; }
  function readPalette() {
    const css = getComputedStyle(root);
    palette = css.color;
  }
  function measure(force = false) {
    if (!renderer || root.hidden || panel?.hidden) return;
    const box = board.getBoundingClientRect(), nextRatio = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
    if (!force && field.width === box.width && field.height === box.height && ratio === nextRatio) return;
    ratio = nextRatio;
    field.width = box.width; field.height = box.height;
    if (!box.width || !box.height) return;
    const w = Math.round(box.width * ratio), h = Math.round(box.height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    screen = createPointillistField(box.width, box.height, renderer.kind === 'canvas2d');
    root.dataset.particles = String(screen.count);
  }
  function freshPlayback(time) {
    return playing && field.samples.length > 1 && field.duration > 0
      && providerTime !== null && time - providerTime < Math.min(1800, Math.max(800, providerCadenceMs * 1.75));
  }
  function paint(timestamp) {
    // Read execution time, not a potentially stale RAF timestamp after a
    // delayed frame. Analytic motifs need no legacy spring timestep clamp.
    const time = performance.now();
    frame = 0;
    if (!allowed() || forced.matches || !screen) { stop(); return; }
    const interval = 1000 / 60;
    // A delayed callback can carry a timestamp older than the last paint.
    const paintTime = Math.max(timestamp, time - interval);
    const sincePaint = lastPaint === null ? interval : paintTime - lastPaint;
    if (sincePaint < interval - .5 && !reduced.matches) { schedule(); return; }
    lastPaint = paintTime - Math.max(0, sincePaint - interval) % interval;
    const fresh = freshPlayback(time);
    const age = fresh ? Math.max(0, time - providerTime) : 0;
    if (fresh) renderPositionMs = Math.min(field.duration, Math.max(renderPositionMs, playbackPosition(age)));
    const displayedProgress = renderPositionMs / Math.max(1, field.duration);
    const elapsed = reduced.matches || morphTick === null ? 0 : Math.max(0, time - morphTick);
    choreographyTime += elapsed / 1000;
    const reaction = fresh && age < predictionLimit() && !reduced.matches
      ? sampleWaveformPulse(field.pulse, displayedProgress) : { impact: 0, body: 0, detail: 0 };
    const motion = pointillistMotion(choreographyTime);
    renderer.paint(screen, { ...motion, ...reaction }, palette, ratio);
    morphTick = reduced.matches ? null : time;
    root.dataset.impact = reaction.impact.toFixed(3); root.dataset.body = reaction.body.toFixed(3); root.dataset.detail = reaction.detail.toFixed(3);
    root.dataset.energy = (fresh && age < predictionLimit()
      ? particleEnergy(field.samples, displayedProgress, field.duration, field.range).level : 0).toFixed(3);
    root.dataset.formation = POINTILLIST_FORMS[motion.from];
    root.dataset.formationMorph = motion.morph.toFixed(3);
    root.dataset.flowTime = motion.flow.toFixed(3);
    root.dataset.renderPositionMs = renderPositionMs.toFixed(1);
    root.dataset.motionTime = choreographyTime.toFixed(3);
    if (!reduced.matches) schedule();
    else root.dataset.active = 'false';
  }
  function schedule() {
    if (!allowed() || forced.matches || frame) return;
    frame = requestAnimationFrame(paint);
    if (root.dataset.active !== 'true') root.dataset.active = 'true';
  }
  function reconcile() {
    if (disposed || signal.aborted) return;
    root.hidden = false;
    readPalette();
    stop(); measure(); schedule();
  }
  function cleanup() {
    if (disposed) return; disposed = true; trackRevision++; load?.abort(); stop();
    renderer?.dispose(); screen = null;
    resize?.disconnect(); intersection?.disconnect(); modal?.disconnect(); theme?.disconnect(); root.hidden = true;
  }
  cleanup.setPlaying = value => {
    if (disposed) return;
    playing = value === true; root.dataset.playing = String(playing);
    if (!playing) { providerTime = null; clockLeadMs = 0; awaitingPlayback = false; }
    schedule();
  };
  cleanup.setProgress = (value, timing = {}) => {
    if (disposed || !Number.isFinite(value)) return;
    const received = performance.now();
    if (Number.isFinite(timing.durationMs) && timing.durationMs > 0 && Math.abs(timing.durationMs - field.duration) > 1) {
      field.duration = timing.durationMs;
      field.pulse = createWaveformPulse(field.samples, field.duration);
    }
    const absolute = Number.isFinite(timing.positionMs) && timing.positionMs >= 0;
    const position = absolute ? Math.min(field.duration, timing.positionMs)
      : Math.max(0, Math.min(1, value)) * field.duration;
    let seek = timing.seek === true;
    if (awaitingPlayback && !seek && position === providerPositionMs) return;
    if (providerTime !== null) {
      const gap = received - providerTime, travel = position - providerPositionMs;
      seek ||= travel < -120 || travel - gap > 500;
      // Duplicate or slightly reordered positions do not keep a stalled clock alive.
      if (!seek && travel <= 0) return;
      if (!seek && gap >= 10 && gap <= 1500 && Math.abs(travel - gap) < Math.max(24, gap * .35))
        providerCadenceMs = providerCadenceMs * .5 + gap * .5;
      // Absorb small backward corrections by temporarily slowing the prediction.
      // Rendering the preceding samples again can double-trigger a visible pulse.
      clockLeadMs = !seek && gap < predictionLimit() ? Math.max(0, renderPositionMs - position) : 0;
    }
    providerPositionMs = position;
    field.progress = field.duration > 0 ? providerPositionMs / field.duration : Math.max(0, Math.min(1, value));
    root.dataset.progress = field.progress.toFixed(5);
    root.dataset.clockSource = absolute ? 'milliseconds' : 'relative';
    root.dataset.positionMs = providerPositionMs.toFixed(1);
    root.dataset.durationMs = String(field.duration);
    root.dataset.clockCadenceMs = providerCadenceMs.toFixed(1);
    root.dataset.predictionLimitMs = predictionLimit().toFixed(1);
    if (!playing || seek || providerTime === null) renderPositionMs = providerPositionMs;
    // A seek or initial zero can arrive while the embed is still buffering.
    // Hold at the reported position until an advancing playback update arrives.
    awaitingPlayback = seek || (providerTime === null && position === 0);
    providerTime = awaitingPlayback ? null : received;
    // Reduced motion keeps the particle composition still.
    if (!reduced.matches) schedule();
  };
  cleanup.setTrack = async track => {
    if (disposed || signal.aborted) return;
    const revision = ++trackRevision; load?.abort(); load = new AbortController();
    // Keep the visible flow and rhythm phase intact across songs and loading.
    providerTime = null; renderPositionMs = 0; providerPositionMs = 0; providerCadenceMs = 750; clockLeadMs = 0;
    awaitingPlayback = false;
    field.samples = []; field.image = null; field.pulse = null; field.progress = 0; field.duration = track.duration || 0;
    field.range = { floor: 0, span: 1 };
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
        field.pulse = createWaveformPulse(field.samples, field.duration);
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
  on(canvas, 'webglcontextlost', event => {
    event.preventDefault(); graphicsLost = true; stop(); root.dataset.fallback = 'true';
  });
  on(canvas, 'webglcontextrestored', () => {
    if (disposed || !renderer) return;
    try { renderer.restore(); graphicsLost = false; root.dataset.fallback = 'false'; measure(true); reconcile(); }
    catch { graphicsLost = true; root.dataset.fallback = 'true'; stop(); }
  });
  on(reduced, 'change', reconcile); on(forced, 'change', reconcile);
  on(document, 'portfolio:sectionstart', reconcile); on(document, 'portfolio:sectionsettled', reconcile);
  on(document, 'portfolio:entryready', reconcile); on(document, 'visibilitychange', reconcile);
  on(window, 'resize', reconcile);
  // Visible embedded previews keep moving when the visitor focuses chat or
  // another control. Actual visibility/offscreen/page-cache gates still stop.
  on(window, 'focus', reconcile);
  on(window, 'pagehide', () => { page = false; reconcile(); }); on(window, 'pageshow', () => { page = true; reconcile(); });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); schedule(); }) : null;
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); reconcile(); }) : null;
  const modal = dialog && typeof MutationObserver === 'function' ? new MutationObserver(reconcile) : null;
  const theme = typeof MutationObserver === 'function' ? new MutationObserver(() => { readPalette(); schedule(); }) : null;
  resize?.observe(board); intersection?.observe(root); modal?.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  theme?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  signal.addEventListener('abort', cleanup, { once: true }); reconcile();
  return cleanup;
}
