import { boardLayout, findCrossings, knots, movePoint, startingPoints } from './untangle-model.js';

const pulseDuration = 880;
const arrows = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};
const unit = value => Math.max(0, Math.min(1, value));

export function initUntangle(root, signal) {
  if (!root || signal.aborted) return;
  const panel = root.closest('.panel');
  const field = root.querySelector('[data-play-field]');
  const canvas = root.querySelector('canvas');
  const nodes = root.querySelector('[data-play-nodes]');
  const label = root.querySelector('[data-play-knot]');
  const status = root.querySelector('[data-play-status]');
  const live = root.querySelector('[data-play-live]');
  const reset = root.querySelector('[data-play-reset]');
  const next = root.querySelector('[data-play-next]');
  const toolbar = root.querySelector('.play-toolbar');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    field.hidden = toolbar.hidden = true;
    root.querySelector('[data-play-fallback]').hidden = false;
    return;
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const dialog = document.querySelector('#project-detail');
  const on = (target, type, handler) => target.addEventListener(type, handler, { signal });
  let level = 0;
  let points = [], crossings = [];
  let solved = false, selected = -1, drag = null;
  let layout = null, frame = 0, pulse = null;
  let ratio = 1, ink = '', accent = '';
  const buttons = Array.from({ length: Math.max(...knots.map(knot => knot.points.length)) }, (_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'play-node';
    button.dataset.playNode = String(index);
    button.setAttribute('aria-label', `Point ${index + 1}`);
    return button;
  });
  nodes.append(...buttons);

  const visible = () => !signal.aborted && !document.hidden && !panel?.hidden && !dialog?.open;
  const available = () => visible() && !panel?.inert && document.documentElement.dataset.entry !== 'loading';
  const playable = () => available() && !solved && layout;

  function announce(message) {
    live.textContent = message;
  }

  function crossingLabel() {
    return `${crossings.length} ${crossings.length === 1 ? 'crossing' : 'crossings'} left`;
  }

  function syncSelection() {
    buttons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(!solved && index === selected));
    });
  }

  function syncCrossings() {
    crossings = findCrossings(points, knots[level].edges);
    const label = crossingLabel();
    if (status.textContent !== label) status.textContent = label;
  }

  function place(index, x, y) {
    if (!movePoint(points, index, x, y)) return false;
    syncCrossings();
    schedule();
    return true;
  }

  function finishMove(index) {
    if (crossings.length) {
      announce(crossingLabel());
      return;
    }
    solved = true;
    selected = -1;
    field.dataset.solved = 'true';
    status.textContent = level === knots.length - 1 ? 'All knots untangled' : 'Knot untangled';
    next.textContent = level === knots.length - 1 ? 'Play again' : 'Next knot';
    next.hidden = false;
    reset.hidden = level === knots.length - 1;
    const restoreFocus = nodes.contains(document.activeElement);
    for (const button of buttons) button.disabled = true;
    syncSelection();
    if (restoreFocus) next.focus({ preventScroll: true });
    announce(status.textContent + '. ' + next.textContent + ' available.');
    if (!reduced.matches && !forced.matches) pulse = { origin: points[index], start: null };
    schedule();
  }

  function loadKnot(index, focus = false) {
    cancelDrag();
    level = index;
    const knot = knots[level];
    points = startingPoints(knot);
    crossings = findCrossings(points, knot.edges);
    pulse = null;
    solved = false;
    selected = -1;
    field.dataset.solved = 'false';
    label.textContent = `${knot.name} · ${level + 1} / ${knots.length}`;
    status.textContent = crossingLabel();
    reset.hidden = false;
    next.hidden = true;
    buttons.forEach((button, i) => {
      button.hidden = i >= points.length;
      button.disabled = false;
    });
    syncSelection();
    if (focus) {
      announce(`${knot.name}. ${crossingLabel()}.`);
      buttons[0].focus({ preventScroll: true });
    }
    schedule();
  }

  function pixel(point) {
    return { x: layout.left + point.x * layout.size, y: layout.top + point.y * layout.size };
  }

  function stroke(a, b, color, opacity, width) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = opacity;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function ring(point, radius, opacity) {
    ctx.strokeStyle = accent;
    ctx.globalAlpha = opacity;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  function paintPulse(now, vertices) {
    pulse.start ??= now;
    const phase = (now - pulse.start) / pulseDuration;
    if (phase >= 1) {
      pulse = null;
      return;
    }

    const origin = pulse.origin;
    const distances = points.map(point => Math.hypot(point.x - origin.x, point.y - origin.y));
    knots[level].edges.forEach(([a, b]) => {
      if (distances[b] < distances[a]) [a, b] = [b, a];
      const local = (phase - distances[a] * .34) / .48;
      const head = unit(local), tail = unit(local - .30);
      if (head <= tail) return;
      const from = vertices[a], to = vertices[b];
      const along = t => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      stroke(along(tail), along(head), accent, .88 * (1 - phase), 2.3);
    });
    ring(pixel(origin), 11 + phase * 54, .7 * (1 - phase) ** 2);
    schedule();
  }

  function paint(now) {
    frame = 0;
    if (!visible() || !layout) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);
    ctx.lineCap = 'round';

    const vertices = points.map(pixel);
    const marked = new Set(crossings.flatMap(crossing => crossing.edges));
    const active = drag?.index ?? selected;
    knots[level].edges.forEach(([a, b], index) => {
      const crossing = marked.has(index);
      const activeWire = a === active || b === active;
      const opacity = crossing || activeWire ? .9 : solved || forced.matches ? .75 : .40;
      stroke(vertices[a], vertices[b], crossing ? accent : ink, opacity, crossing ? 1.55 : 1.15);
    });
    for (const crossing of crossings) ring(pixel(crossing), 4.25, .86);

    vertices.forEach(({ x, y }, index) => {
      const style = buttons[index].style;
      style.left = `${x}px`;
      style.top = `${y}px`;
    });

    if (pulse) paintPulse(now, vertices);
    ctx.globalAlpha = 1;
  }

  function schedule() {
    if (!frame && visible() && layout) frame = requestAnimationFrame(paint);
  }

  function readPalette() {
    const style = getComputedStyle(field);
    ink = style.color;
    accent = forced.matches ? ink : style.getPropertyValue('--accent-copy').trim() || ink;
    schedule();
  }

  function measure() {
    const { clientWidth: width, clientHeight: height } = field;
    if (!width || !height) {
      layout = null;
      return;
    }
    if (layout && (layout.width !== width || layout.height !== height)) cancelDrag();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * ratio), h = Math.round(height * ratio);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    layout = boardLayout(width, height);
    schedule();
  }

  function pointerPosition(event) {
    const rect = field.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - field.clientLeft - layout.left) / layout.size,
      y: (event.clientY - rect.top - field.clientTop - layout.top) / layout.size,
    };
  }

  function releaseDrag() {
    const current = drag;
    drag = null;
    if (!current) return null;
    delete current.button.dataset.grabbed;
    if (current.button.hasPointerCapture?.(current.id)) current.button.releasePointerCapture(current.id);
    return current;
  }

  function cancelDrag() {
    const current = releaseDrag();
    if (!current) return;
    if (current.moved) {
      points[current.index] = current.origin;
      syncCrossings();
    }
    schedule();
  }

  function togglePoint(index) {
    selected = selected === index ? -1 : index;
    syncSelection();
    if (selected >= 0) {
      const { x, y } = points[index];
      announce(`Point ${index + 1} selected. ${Math.round(x * 100)} percent from left, ${Math.round(y * 100)} percent from top.`);
    } else announce('Point deselected.');
    schedule();
  }

  buttons.forEach((button, index) => {
    on(button, 'pointerdown', event => {
      if (!playable() || drag || event.button !== 0 || event.isPrimary === false) return;
      const pointer = pointerPosition(event);
      const origin = points[index];
      drag = {
        button, index, id: event.pointerId, origin, moved: false,
        x: event.clientX, y: event.clientY, offsetX: origin.x - pointer.x, offsetY: origin.y - pointer.y,
      };
      button.dataset.grabbed = 'true';
      try { button.setPointerCapture?.(event.pointerId); } catch { /* Window input still tracks the drag. */ }
      schedule();
    });
    on(button, 'lostpointercapture', event => {
      if (drag?.id === event.pointerId) cancelDrag();
    });
    on(button, 'click', event => {
      // Pointer selection is decided on release, after checking drag distance.
      if (event.detail === 0 && playable()) togglePoint(index);
    });
    on(button, 'keydown', event => {
      if (!playable() || drag || event.altKey || event.ctrlKey || event.metaKey || !Object.hasOwn(arrows, event.key)) return;
      event.preventDefault();
      const [dx, dy] = arrows[event.key];
      const step = event.shiftKey ? .016 : .055;
      const { x, y } = points[index];
      if (place(index, x + dx * step, y + dy * step)) finishMove(index);
    });
  });

  function trackDrag(event) {
    if (drag?.id !== event.pointerId || !playable()) return;
    if (!drag.moved) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      drag.moved = true;
      selected = -1;
      syncSelection();
    }
    const pointer = pointerPosition(event);
    place(drag.index, pointer.x + drag.offsetX, pointer.y + drag.offsetY);
  }

  on(window, 'pointermove', trackDrag);
  on(window, 'pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    if (!playable()) {
      cancelDrag();
      return;
    }
    trackDrag(event);
    const current = releaseDrag();
    if (current.moved) finishMove(current.index);
    else togglePoint(current.index);
    schedule();
  });
  on(window, 'pointercancel', event => {
    if (drag?.id === event.pointerId) cancelDrag();
  });
  on(field, 'click', event => {
    if (!playable() || selected < 0 || event.target.closest?.('[data-play-node]')) return;
    const { x, y } = pointerPosition(event);
    if (!place(selected, x, y)) return;
    const index = selected;
    selected = -1;
    syncSelection();
    finishMove(index);
  });
  on(reset, 'click', () => { if (available()) loadKnot(level, true); });
  on(next, 'click', () => {
    if (available() && solved) loadKnot((level + 1) % knots.length, true);
  });

  function pause() {
    cancelDrag();
    pulse = null;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function resume() {
    measure();
    schedule();
  }

  on(document, 'portfolio:sectionstart', () => { pause(); resume(); });
  on(document, 'portfolio:sectionsettled', resume);
  on(document, 'visibilitychange', () => { if (document.hidden) pause(); else resume(); });
  on(window, 'pagehide', pause);
  on(window, 'pageshow', resume);
  on(window, 'blur', cancelDrag);
  on(window, 'resize', resume);
  on(reduced, 'change', () => { pulse = null; schedule(); });
  on(forced, 'change', () => { pulse = null; readPalette(); });

  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  resize?.observe(field);
  const theme = typeof MutationObserver === 'function' ? new MutationObserver(readPalette) : null;
  theme?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  signal.addEventListener('abort', () => { pause(); resize?.disconnect(); theme?.disconnect(); }, { once: true });

  loadKnot(0);
  readPalette();
  measure();
}
