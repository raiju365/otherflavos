// One event-driven surface response. Media/reveal/pan transforms belong elsewhere.
export function initProjectSurfaces(signal) {
  if (signal.aborted || typeof requestAnimationFrame !== 'function') return () => {};
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const workspace = document.querySelector('.workspace');
  const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal });
  const properties = ['--surface-cue-dx', '--surface-cue-dy'];
  let active = null, pending = null, frame = 0;

  const states = [...document.querySelectorAll('.featured-preview:not(.now-preview), .project-image-button')].map(button => {
    let cue = button.querySelector('.preview-open');
    const createdCue = !cue;
    if (!cue) {
      cue = document.createElement('span');
      cue.className = 'preview-open';
      cue.textContent = '↗';
      cue.setAttribute('aria-hidden', 'true');
      button.append(cue);
    }
    cue.classList.add('project-surface-cue');
    button.classList.add('project-surface');
    return { button, cue, createdCue, hasPlayback: Boolean(button.closest('.project-stage')?.querySelector('.project-preview-toggle')) };
  });

  function clear(state) {
    delete state.button.dataset.surfaceActive;
    properties.forEach(property => state.button.style.removeProperty(property));
  }
  function reset() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; pending = null;
    if (active) clear(active);
    active = null;
  }
  const available = state => !signal.aborted && fine.matches && !reduced.matches && !forced.matches
    && !document.hidden && document.documentElement.dataset.entry !== 'loading'
    && workspace?.getAttribute('aria-busy') !== 'true' && !document.querySelector('dialog[open]')
    && !state.button.closest('[hidden], [inert]');

  function paint() {
    frame = 0;
    const sample = pending;
    pending = null;
    if (!sample || !available(sample.state)) { reset(); return; }
    const { state, clientX, clientY } = sample;
    // One fresh viewport rect per event batch; also correct after nested scrolling.
    const rect = state.button.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    if (!rect.width || !rect.height || x < 0 || y < 0 || x > rect.width || y > rect.height) { reset(); return; }
    const size = state.cue.offsetWidth || 46;
    const inset = Math.min(12, Math.max(0, (Math.min(rect.width, rect.height) - size) / 2));
    const clamp = (value, max) => Math.max(inset, Math.min(value, Math.max(inset, max - size - inset)));
    // Sit beside the pointer; flip at the edges rather than running out of frame.
    let cx = x + 22, cy = y + 22;
    if (cx + size + inset > rect.width) cx = x - size - 22;
    if (cy + size + inset > rect.height) cy = y - size - 22;
    cx = clamp(cx, rect.width); cy = clamp(cy, rect.height);
    // The independent 44px playback button always keeps its own clear corner.
    if (state.hasPlayback && cx + size > rect.width - 66 && cy + size > rect.height - 66) {
      cy = clamp(rect.height - 74 - size, rect.height);
    }
    if (active && active !== state) clear(active);
    active = state;
    const homeX = state.button.classList.contains('featured-preview') ? rect.width - size - 20 : 20;
    const homeY = rect.height - size - 20;
    const values = [cx - homeX, cy - homeY];
    properties.forEach((property, index) => state.button.style.setProperty(property, `${values[index]}px`));
    state.button.dataset.surfaceActive = 'true';
  }
  function point(state, event) {
    if (event.pointerType === 'touch' || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) || !available(state)) { reset(); return; }
    pending = { state, clientX: event.clientX, clientY: event.clientY };
    if (!frame) frame = requestAnimationFrame(paint);
  }
  states.forEach(state => {
    on(state.button, 'pointerenter', event => point(state, event), { passive: true });
    on(state.button, 'pointermove', event => point(state, event), { passive: true });
    on(state.button, 'pointerleave', reset, { passive: true });
    on(state.button, 'pointercancel', reset, { passive: true });
    on(state.button, 'focus', reset);
    on(state.button, 'click', reset);
  });
  on(window, 'scroll', reset, { capture: true, passive: true });
  on(window, 'resize', reset, { passive: true });
  on(window, 'blur', reset);
  on(window, 'pointerdown', event => { if (event.pointerType === 'touch') reset(); }, { passive: true });
  on(document, 'visibilitychange', reset);
  on(document, 'keydown', reset);
  on(document, 'portfolio:sectionstart', reset);
  on(document, 'portfolio:entryready', reset);
  [fine, reduced, forced].forEach(query => on(query, 'change', reset));
  signal.addEventListener('abort', () => {
    reset();
    states.forEach(state => {
      state.button.classList.remove('project-surface');
      state.cue.classList.remove('project-surface-cue');
      if (state.createdCue) state.cue.remove();
    });
  }, { once: true });
  return reset;
}
