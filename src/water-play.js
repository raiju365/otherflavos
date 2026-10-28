import { createWaterField, clearWater, disturbWater, stepWater, paintWater } from './water-field.js';

export function initWaterPlay(signal) {
  const root = document.querySelector('[data-water-play]');
  if (!root || signal.aborted) return () => {};
  const board = root.querySelector('[data-water-board]'), canvas = root.querySelector('canvas');
  if (!board || !canvas) return () => {};
  const status = root.querySelector('[data-water-status]'), dialog = document.querySelector('#project-detail');
  const desktop = matchMedia('(min-width: 801px) and (min-height: 540px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), forced = matchMedia('(forced-colors: active)');
  const on = (target, type, listener, options = {}) => target?.addEventListener(type, listener, { ...options, signal });
  let context = null, rasterContext = null, raster = null;
  try { context = canvas.getContext('2d', { alpha: false }); raster = document.createElement('canvas'); rasterContext = raster.getContext('2d', { alpha: false }); } catch { /* Static wave controls remain available. */ }
  const fallback = !context || !rasterContext;
  root.dataset.fallback = String(fallback);
  let field = null, image = null, frame = 0, previous = null, palette = null, rect = null, dpr = 1;
  let pointer = null, lastPoint = null, pending = [], turn = 0, suppressClick = false;
  let inView = true, pageActive = true, focused = true, disposed = false;
  let aim = { x: .5, y: .5 };
  const direct = () => reduced.matches || forced.matches || fallback;
  const allowed = () => !disposed && !signal.aborted && !root.hidden && desktop.matches && inView && pageActive && focused
    && !document.hidden && !dialog?.open && document.documentElement.dataset.entry !== 'loading';
  function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; previous = null; root.dataset.active = 'false'; if (field) field.accumulator = 0; }
  function release() {
    if (!pointer) return;
    const id = pointer.id; pointer = null;
    try { if (board.hasPointerCapture(id)) board.releasePointerCapture(id); } catch { /* Already released by the browser. */ }
  }
  function resetInput() { release(); pending = []; lastPoint = rect = null; suppressClick = false; }
  function readPalette() {
    const css = getComputedStyle(root);
    const rgb = value => {
      const hex = value.trim().match(/^#([\da-f]{6})$/i);
      if (hex) return [0, 2, 4].map(index => parseInt(hex[1].slice(index, index + 2), 16));
      const parts = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      return parts?.length === 3 ? parts : [40, 44, 38];
    };
    palette = { base: rgb(css.getPropertyValue('--surface')), ink: rgb(css.getPropertyValue('--fg')), shade: rgb(css.getPropertyValue('--bg')) };
  }
  function paint() {
    if (!field || fallback || forced.matches) return;
    paintWater(field, palette, image.data); rasterContext.putImageData(image, 0, 0);
    context.drawImage(raster, 0, 0, canvas.width, canvas.height);
  }
  function measure() {
    if (disposed || root.hidden || fallback) return;
    const box = board.getBoundingClientRect(), ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    if (box.width < 1 || box.height < 1) return;
    if (field && Math.abs(field.width - box.width) < .5 && Math.abs(field.height - box.height) < .5 && dpr === ratio) return;
    resetInput(); stop(); dpr = ratio;
    field = createWaterField(box.width, box.height);
    raster.width = field.columns; raster.height = field.rows;
    image = rasterContext.createImageData(field.columns, field.rows);
    canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
    context.imageSmoothingEnabled = true; paint();
  }
  function stamp(command) {
    if (!field) return;
    const from = command.from || command, distance = Math.hypot((command.x - from.x) * field.width, (command.y - from.y) * field.height);
    const count = Math.min(12, Math.max(1, Math.ceil(distance / 7)));
    for (let index = 1; index <= count; index++) {
      const t = index / count;
      disturbWater(field, from.x + (command.x - from.x) * t, from.y + (command.y - from.y) * t, command.strong ? 2.8 : .48, command.strong ? 3 : 1.8);
    }
  }
  function tick(time) {
    frame = 0;
    if (!allowed() || direct()) { stop(); return; }
    const commands = pending; pending = []; commands.forEach(stamp);
    const steps = field ? stepWater(field, previous === null ? 1 / 60 : (time - previous) / 1000) : 0;
    previous = time;
    if (steps || commands.length) paint();
    if (field?.active || pending.length) { root.dataset.active = 'true'; frame = requestAnimationFrame(tick); }
    else stop();
  }
  function wake() { if (allowed() && !direct() && !frame && (pending.length || field?.active)) frame = requestAnimationFrame(tick); }
  function disturb(x, y, strong = true, from = null) {
    if (!allowed()) return;
    aim = { x, y };
    board.style.setProperty('--wave-x', `${x * 100}%`); board.style.setProperty('--wave-y', `${y * 100}%`);
    board.dataset.disturbed = 'true';
    if (direct()) {
      if (field && !forced.matches && !fallback) {
        clearWater(field); stamp({ x, y, strong: true });
        for (let index = 0; index < 13; index++) stepWater(field, 1 / 60);
        paint();
      }
      return;
    }
    pending.push({ x, y, strong, from }); pending = pending.slice(-16); wake();
  }
  function calm() {
    if (!allowed()) return;
    resetInput(); stop(); if (field) clearWater(field); delete board.dataset.disturbed; paint();
    if (status) status.textContent = 'The water is still.';
  }
  function reconcile() {
    if (disposed || signal.aborted) return;
    const hidden = !desktop.matches;
    if (hidden && root.contains(document.activeElement)) document.querySelector('#theme-toggle')?.focus({ preventScroll: true });
    root.hidden = hidden;
    if (!hidden) measure();
    if (!allowed() || direct()) { resetInput(); stop(); }
    else wake();
  }
  const point = event => ({ x: Math.max(.025, Math.min(.975, (event.clientX - rect.left) / rect.width)), y: Math.max(.04, Math.min(.96, (event.clientY - rect.top) / rect.height)) });
  const valid = event => Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
  on(board, 'pointerenter', () => { rect = board.getBoundingClientRect(); lastPoint = null; });
  on(board, 'pointerdown', event => {
    if (!allowed() || pointer || event.button !== 0 || event.isPrimary === false || !valid(event)) return;
    rect = board.getBoundingClientRect(); const p = point(event); aim = p; lastPoint = p; suppressClick = false;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    try { board.setPointerCapture(event.pointerId); } catch { /* Board-local input still works. */ }
  });
  on(board, 'pointermove', event => {
    if (!allowed() || direct() || !valid(event) || (pointer && pointer.id !== event.pointerId) || (event.pointerType === 'touch' && !pointer)) return;
    rect ||= board.getBoundingClientRect(); const p = point(event);
    if (lastPoint && Math.hypot((p.x - lastPoint.x) * rect.width, (p.y - lastPoint.y) * rect.height) < 4) return;
    if (pointer) pointer.moved ||= Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4;
    disturb(p.x, p.y, false, lastPoint); lastPoint = p;
  }, { passive: true });
  on(window, 'pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    suppressClick = pointer.moved; release(); lastPoint = null;
  });
  on(window, 'pointercancel', event => { if (pointer?.id === event.pointerId) { release(); lastPoint = null; suppressClick = true; } });
  on(board, 'lostpointercapture', event => { if (pointer?.id === event.pointerId && event.target === board && !board.hasPointerCapture(event.pointerId)) { release(); lastPoint = null; suppressClick = true; } });
  on(board, 'pointerleave', () => { if (!pointer) { lastPoint = rect = null; } });
  on(board, 'click', event => {
    const suppressed = suppressClick; suppressClick = false;
    if (!allowed() || (suppressed && event.detail !== 0)) return;
    if (event.detail && valid(event)) { rect = board.getBoundingClientRect(); aim = point(event); }
    disturb(aim.x, aim.y); if (status) status.textContent = 'A stone dropped. Move to stir the water.';
  });
  on(board, 'keydown', event => {
    if (!allowed() || event.altKey || event.ctrlKey || event.metaKey) return;
    const arrows = { ArrowLeft: [-.12, 0], ArrowRight: [.12, 0], ArrowUp: [0, -.16], ArrowDown: [0, .16] };
    if (arrows[event.key]) {
      event.preventDefault(); const [x, y] = arrows[event.key];
      disturb(Math.max(.1, Math.min(.9, aim.x + x)), Math.max(.15, Math.min(.85, aim.y + y)));
    } else if (event.key === 'Escape' || event.key === 'Home') { event.preventDefault(); calm(); }
    // Enter/Space use the button's native click, exactly once.
  });
  on(root.querySelector('[data-water-drop]'), 'click', () => {
    if (!allowed()) return;
    const spots = [[.5, .5], [.3, .4], [.7, .6], [.4, .7], [.65, .3]], p = spots[turn++ % spots.length];
    disturb(...p); if (allowed() && status) status.textContent = 'A stone dropped.';
  });
  on(root.querySelector('[data-water-clear]'), 'click', calm);
  on(desktop, 'change', reconcile);
  const preference = () => { resetInput(); stop(); if (field) clearWater(field); delete board.dataset.disturbed; paint(); reconcile(); };
  on(reduced, 'change', preference); on(forced, 'change', preference);
  on(document, 'portfolio:entryready', reconcile); on(document, 'visibilitychange', reconcile);
  on(window, 'blur', () => { focused = false; reconcile(); }); on(window, 'focus', () => { focused = true; reconcile(); });
  on(window, 'pagehide', () => { pageActive = false; reconcile(); }); on(window, 'pageshow', () => { pageActive = true; reconcile(); });
  on(window, 'resize', () => { rect = null; reconcile(); });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); wake(); }) : null;
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { inView = entries.some(entry => entry.isIntersecting); reconcile(); }) : null;
  const modal = dialog && typeof MutationObserver === 'function' ? new MutationObserver(reconcile) : null;
  const theme = typeof MutationObserver === 'function' ? new MutationObserver(() => { if (!disposed) { readPalette(); paint(); } }) : null;
  resize?.observe(board); intersection?.observe(root); modal?.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  theme?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  function cleanup() {
    disposed = true; resetInput(); stop(); resize?.disconnect(); intersection?.disconnect(); modal?.disconnect(); theme?.disconnect(); root.hidden = true;
  }
  signal.addEventListener('abort', cleanup, { once: true });
  readPalette(); reconcile();
  return cleanup;
}
