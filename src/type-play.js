import { createTypePlay, placeTypeLetter, kickTypeLetter, mixTypePlay, resetTypePlay, resizeTypePlay, stepTypePlay } from './type-play-model.js';

export function initTypePlay(signal) {
  const root = document.querySelector('[data-type-play]');
  if (!root || signal.aborted) return () => {};
  const stage = root.querySelector('[data-type-stage]');
  const letters = [...root.querySelectorAll('[data-type-letter]')];
  if (!stage || letters.length !== 4) return () => {};
  const status = root.querySelector('[data-type-status]');
  const dialog = document.querySelector('#project-detail');
  const desktop = matchMedia('(min-width: 801px) and (min-height: 540px)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const on = (target, type, listener, options = {}) => target?.addEventListener(type, listener, { ...options, signal });
  const suppressed = new Set();
  let model = null, frame = 0, previous = null, drag = null, turn = 0;
  let inView = true, pageActive = true, pageFocused = true, disposed = false;
  const allowed = () => !disposed && !signal.aborted && !root.hidden && desktop.matches && model && inView && pageActive && pageFocused
    && !document.hidden && !dialog?.open && document.documentElement.dataset.entry !== 'loading';

  function paint() {
    if (!model) return;
    model.bodies.forEach((body, index) => {
      letters[index].style.transform = `translate3d(${(body.x - model.hitSize / 2).toFixed(2)}px, ${(body.y - model.hitSize / 2).toFixed(2)}px, 0) rotate(${body.angle.toFixed(2)}deg)`;
    });
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; previous = null; root.dataset.active = 'false';
  }
  function tick(time) {
    frame = 0;
    if (!allowed()) { stop(); return; }
    const elapsed = previous === null ? 1 / 60 : (time - previous) / 1000;
    previous = time;
    const moving = stepTypePlay(model, elapsed, drag?.index ?? -1);
    paint();
    if (moving) { root.dataset.active = 'true'; frame = requestAnimationFrame(tick); }
    else stop();
  }
  function wake() {
    if (!allowed()) return;
    if (reduced.matches) { paint(); return; }
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function release(throwing = false, suppressClick = false) {
    if (!drag) return;
    const held = drag; drag = null;
    delete letters[held.index].dataset.grabbed;
    if (held.moved && suppressClick) suppressed.add(letters[held.index]);
    const fresh = performance.now() - held.time < 100;
    kickTypeLetter(model, held.index, throwing && fresh ? held.vx : 0, throwing && fresh ? held.vy : 0);
    try { if (letters[held.index].hasPointerCapture(held.id)) letters[held.index].releasePointerCapture(held.id); } catch { /* Pointer may already have left the page. */ }
  }
  function measure() {
    if (disposed || root.hidden) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || (model && Math.abs(model.width - rect.width) < .5 && Math.abs(model.height - rect.height) < .5)) return;
    release();
    model = model ? resizeTypePlay(model, rect.width, rect.height) : createTypePlay(rect.width, rect.height);
    root.style.setProperty('--type-letter-size', `${model.size}px`);
    root.style.setProperty('--type-hit-size', `${model.hitSize}px`);
    paint();
  }
  function reconcile() {
    if (disposed || signal.aborted) return;
    const hidden = !desktop.matches;
    if (hidden && root.contains(document.activeElement)) document.querySelector('#theme-toggle')?.focus({ preventScroll: true });
    root.hidden = hidden;
    if (!hidden) measure();
    if (!allowed()) {
      release(); stop();
      if (model) {
        if (hidden) resetTypePlay(model, true);
        else model.bodies.forEach(body => { body.vx = body.vy = body.spin = 0; });
      }
    } else wake();
  }
  function announce(message) { if (status) status.textContent = message; }
  function reset() {
    if (!allowed()) return;
    release(); suppressed.clear(); resetTypePlay(model, reduced.matches);
    announce('Letters reset.'); wake();
  }
  function mix() {
    if (!allowed()) return;
    release(); suppressed.clear(); mixTypePlay(model, ++turn, reduced.matches);
    announce('Letters mixed. Drag a letter or choose Reset.'); wake();
  }

  letters.forEach((button, index) => {
    on(button, 'pointerdown', event => {
      if (!allowed() || drag || event.button !== 0 || event.isPrimary === false || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
      event.preventDefault(); suppressed.delete(button);
      const rect = stage.getBoundingClientRect(), body = model.bodies[index];
      drag = { index, id: event.pointerId, rect, offsetX: body.x - event.clientX + rect.left,
        offsetY: body.y - event.clientY + rect.top, startX: event.clientX, startY: event.clientY,
        x: body.x, y: body.y, vx: 0, vy: 0, time: performance.now(), moved: false };
      body.vx = body.vy = body.spin = 0;
      button.dataset.grabbed = 'true'; button.focus({ preventScroll: true });
      try { button.setPointerCapture(event.pointerId); } catch { /* Window listeners still handle an uncaptured pointer. */ }
      wake();
    });
    on(button, 'lostpointercapture', event => {
      if (drag?.id === event.pointerId && drag.index === index && event.target === button && !button.hasPointerCapture(event.pointerId)) { release(); wake(); }
    });
    on(button, 'click', event => {
      const wasDrag = suppressed.delete(button);
      if ((wasDrag && event.detail !== 0) || !allowed()) return;
      kickTypeLetter(model, index, (index % 2 ? -1 : 1) * 280, -300, reduced.matches); wake();
    });
    on(button, 'keydown', event => {
      if (!allowed() || event.altKey || event.ctrlKey || event.metaKey) return;
      const directions = { ArrowLeft: [-280, 0], ArrowRight: [280, 0], ArrowUp: [0, -280], ArrowDown: [0, 280] };
      if (directions[event.key]) {
        event.preventDefault(); release(); kickTypeLetter(model, index, ...directions[event.key], reduced.matches); wake();
      } else if (event.key === 'Home' || event.key === 'Escape') { event.preventDefault(); reset(); }
      // Enter and Space keep native button activation, so they toss exactly once.
    });
  });
  on(window, 'pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!allowed()) { release(); stop(); return; }
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    const now = performance.now(), dt = Math.max(.008, Math.min(.06, (now - drag.time) / 1000));
    const body = model.bodies[drag.index];
    placeTypeLetter(model, drag.index, event.clientX - drag.rect.left + drag.offsetX, event.clientY - drag.rect.top + drag.offsetY);
    drag.vx = drag.vx * .25 + (body.x - drag.x) / dt * .75;
    drag.vy = drag.vy * .25 + (body.y - drag.y) / dt * .75;
    const speed = Math.hypot(drag.vx, drag.vy);
    if (speed > 560) { drag.vx *= 560 / speed; drag.vy *= 560 / speed; }
    drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 3;
    drag.x = body.x; drag.y = body.y; drag.time = now;
    body.angle = Math.max(-22, Math.min(22, (body.x - body.homeX) * .2));
    wake();
  }, { passive: true });
  on(window, 'pointerup', event => { if (drag?.id === event.pointerId) { release(!reduced.matches, true); wake(); } });
  on(window, 'pointercancel', event => { if (drag?.id === event.pointerId) { release(); wake(); } });
  on(root.querySelector('[data-type-mix]'), 'click', mix);
  on(root.querySelector('[data-type-reset]'), 'click', reset);
  on(desktop, 'change', reconcile);
  on(reduced, 'change', () => {
    release(); stop(); if (model) { resetTypePlay(model, true); paint(); }
  });
  on(document, 'portfolio:entryready', reconcile);
  on(document, 'visibilitychange', reconcile);
  on(window, 'blur', () => { pageFocused = false; reconcile(); });
  on(window, 'focus', () => { pageFocused = true; reconcile(); });
  on(window, 'pagehide', () => { pageActive = false; reconcile(); });
  on(window, 'pageshow', () => { pageActive = true; reconcile(); });
  on(window, 'resize', () => { measure(); reconcile(); });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); wake(); }) : null;
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    inView = entries.some(entry => entry.isIntersecting); reconcile();
  }) : null;
  const modal = dialog && typeof MutationObserver === 'function' ? new MutationObserver(reconcile) : null;
  resize?.observe(stage); intersection?.observe(root);
  modal?.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  function cleanup() {
    disposed = true;
    release(); stop(); resize?.disconnect(); intersection?.disconnect(); modal?.disconnect();
    suppressed.clear(); root.hidden = true;
  }
  signal.addEventListener('abort', cleanup, { once: true });
  reconcile();
  return cleanup;
}
