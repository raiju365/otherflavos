// Editorial registration guides. Tracking owns one finite frame chain and
// sleeps once it reaches the pointer; CSS owns only the small tick responses.
export function initPointerGuides(signal) {
  if (signal.aborted) return () => {};
  const finePointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const guides = document.createElement('div');
  guides.className = 'pointer-guides';
  guides.setAttribute('aria-hidden', 'true');
  guides.hidden = true;
  const horizontal = document.createElement('span');
  const vertical = document.createElement('span');
  const focusHorizontal = document.createElement('span');
  const focusVertical = document.createElement('span');
  horizontal.className = 'pointer-guide-horizontal';
  vertical.className = 'pointer-guide-vertical';
  focusHorizontal.className = focusVertical.className = 'pointer-guide-focus';
  // Each accent inherits the actual stroke's perpendicular position and
  // thickness, rather than following it in a separately translated layer.
  horizontal.append(focusHorizontal);
  vertical.append(focusVertical);
  guides.append(horizontal, vertical);
  document.body.append(guides);
  const on = (target, type, listener) => target.addEventListener(type, listener, { signal, passive: true });
  let frame = 0, previous = null, point = null, target = null;
  const number = value => Number(value.toFixed(3));
  const allowed = () => !signal.aborted && finePointer.matches && !forced.matches && !document.hidden
    && document.documentElement?.dataset.entry !== 'loading' && !document.querySelector('dialog[open]');
  function hide() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; previous = null; point = target = null;
    guides.hidden = true;
    guides.dataset.moving = guides.dataset.pressed = guides.dataset.interactive = guides.dataset.contact = 'false';
  }
  function paint(dx = 0, dy = 0) {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    // Snap the stroke edges to device pixels instead of splitting a thin
    // line across two pixels. Each child accent travels along its own axis.
    const x = Math.round((point.x - .5) * dpr) / dpr;
    const y = Math.round((point.y - .5) * dpr) / dpr;
    horizontal.style.transform = `translate3d(0, ${number(y)}px, 0)`;
    vertical.style.transform = `translate3d(${number(x)}px, 0, 0)`;
    focusHorizontal.style.transform = `translate3d(${number(x)}px, 0, 0)`;
    focusVertical.style.transform = `translate3d(0, ${number(y)}px, 0)`;
    focusHorizontal.style.setProperty('--guide-stretch', String(number(1 + Math.min(Math.abs(dx) / 150, .45))));
    focusVertical.style.setProperty('--guide-stretch', String(number(1 + Math.min(Math.abs(dy) / 150, .45))));
    guides.dataset.moving = String(Math.hypot(dx, dy) > .5);
  }
  function tick(time) {
    frame = 0;
    if (!allowed()) { hide(); return; }
    const dt = previous === null ? 16 : Math.max(1, Math.min(40, time - previous));
    previous = time;
    const amount = 1 - Math.exp(-dt / 38);
    point.x += (target.x - point.x) * amount;
    point.y += (target.y - point.y) * amount;
    const dx = target.x - point.x, dy = target.y - point.y;
    if (Math.hypot(dx, dy) <= .1 || reduced.matches) {
      point = { ...target }; previous = null; paint(); return;
    }
    paint(dx, dy);
    frame = requestAnimationFrame(tick);
  }
  on(window, 'pointermove', event => {
    if (event.pointerType === 'touch' || event.target?.closest?.('[data-water-play]') || !allowed() || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) { hide(); return; }
    target = { x: event.clientX, y: event.clientY };
    guides.dataset.interactive = String(Boolean(event.target?.closest?.('a[href],button,[role="tab"],[role="button"],.loop-viewport')));
    guides.dataset.contact = String(Boolean(event.target?.closest?.('.social-link')));
    if (!point || reduced.matches || typeof requestAnimationFrame !== 'function') {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; previous = null; point = { ...target }; paint();
    } else if (!frame && Math.hypot(target.x - point.x, target.y - point.y) > .1) frame = requestAnimationFrame(tick);
    guides.hidden = false;
  });
  on(document, 'pointerout', event => { if (!event.relatedTarget) hide(); });
  on(window, 'pointerdown', event => {
    if (event.pointerType === 'touch') { hide(); return; }
    if (!guides.hidden && event.button === 0) guides.dataset.pressed = 'true';
  });
  on(window, 'pointerup', () => { guides.dataset.pressed = 'false'; });
  on(document, 'pointercancel', hide);
  on(document, 'visibilitychange', hide);
  on(document, 'keydown', event => { if (event.key === 'Tab') hide(); });
  on(window, 'blur', hide);
  on(window, 'resize', hide);
  on(window, 'pagehide', hide);
  on(window, 'pageshow', hide);
  on(finePointer, 'change', hide);
  on(reduced, 'change', hide);
  on(forced, 'change', hide);
  signal.addEventListener('abort', () => { hide(); guides.remove(); }, { once: true });
  return hide;
}
