import { boardLayout, cameraProjection, createKnot, distance, findContacts, frameView, maxPoints, movePoint, stageCount } from './untangle-model.js';

const pulseDuration = 880;
const arrows = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};
const unit = value => Math.max(0, Math.min(1, value));

export function initUntangle(root, signal, random = Math.random) {
  if (!root || signal.aborted) return;
  const panel = root.closest('.panel');
  const field = root.querySelector('[data-play-field]');
  const canvas = root.querySelector('canvas');
  const nodes = root.querySelector('[data-play-nodes]');
  const label = root.querySelector('[data-play-knot]');
  const status = root.querySelector('[data-play-status]');
  const live = root.querySelector('[data-play-live]');
  const reset = root.querySelector('[data-play-reset]');
  const newKnot = root.querySelector('[data-play-new]');
  const front = root.querySelector('[data-play-front]');
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
  let level = 0, knot, view;
  let yaw = .23, pitch = -.24, orbit = null, orbitMoved = false;
  const vibrations = new Map();
  let points = [], contacts = [];
  let solved = false, selected = -1, drag = null;
  let layout = null, frame = 0, pulse = null;
  let ratio = 1, ink = '', accent = '';
  const buttons = Array.from({ length: maxPoints }, (_, index) => {
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

  function contactLabel() {
    return `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'} left`;
  }

  function syncSelection() {
    buttons.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(!solved && index === selected));
    });
  }

  function syncCrossings() {
    contacts = findContacts(points, knot.edges);
    const label = contactLabel();
    if (status.textContent !== label) status.textContent = label;
  }

  function place(index, target) {
    const previous = points[index];
    if (!movePoint(points, index, target)) return false;
    if (!reduced.matches && !forced.matches) {
      const point = points[index];
      const dx = previous.x - point.x, dy = previous.y - point.y, dz = previous.z - point.z;
      const amplitude = Math.min(.12, Math.hypot(dx, dy, dz) * 2.3);
      const length = Math.hypot(dx, dy, dz);
      vibrations.set(index, { x: dx / length * amplitude, y: dy / length * amplitude, z: dz / length * amplitude, start: null });
    }
    syncCrossings();
    schedule();
    return true;
  }

  function finishMove(index) {
    const projection = camera();
    if (points.some(point => {
      const { x, y } = projection.project(point);
      return distance(point, view.center) > view.radius ||
        x < 21 || x > layout.width - 21 || y < 21 || y > layout.height - 21;
    })) view = frameView(points);
    schedule();
    if (contacts.length) {
      announce(contactLabel());
      return;
    }
    solved = true;
    selected = -1;
    field.dataset.solved = 'true';
    status.textContent = level === stageCount - 1 ? 'All knots untangled' : 'Knot untangled';
    next.textContent = level === stageCount - 1 ? 'Play again' : 'Next knot';
    next.hidden = false;
    newKnot.hidden = level === stageCount - 1;
    const restoreFocus = nodes.contains(document.activeElement);
    for (const button of buttons) button.disabled = true;
    syncSelection();
    if (restoreFocus) next.focus({ preventScroll: true });
    announce(status.textContent + '. ' + next.textContent + ' available.');
    if (!reduced.matches && !forced.matches) pulse = { origin: points[index], start: null };
    schedule();
  }

  function restoreKnot(focus = false) {
    releaseDrag();
    releaseOrbit();
    orbitMoved = false;
    yaw = .23;
    pitch = -.24;
    points = knot.points.slice();
    view = frameView(points);
    field.dataset.dense = String(points.length > 16);
    vibrations.clear();
    contacts = findContacts(points, knot.edges);
    pulse = null;
    solved = false;
    selected = -1;
    field.dataset.solved = 'false';
    label.textContent = `Stage ${level + 1} / ${stageCount}`;
    status.textContent = contactLabel();
    newKnot.hidden = false;
    next.hidden = true;
    buttons.forEach((button, i) => {
      button.hidden = i >= points.length;
      button.disabled = false;
    });
    syncSelection();
    if (focus) {
      announce(`Stage ${level + 1}. ${contactLabel()}.`);
      buttons[0].focus({ preventScroll: true });
    }
    schedule();
  }

  function loadKnot(index, focus = false) {
    level = index;
    knot = createKnot(level, random);
    restoreKnot(focus);
  }

  const camera = draggedPoint => cameraProjection(layout, yaw, pitch, view, draggedPoint);

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

  function paintPulse(now, vertices, projection) {
    pulse.start ??= now;
    const phase = (now - pulse.start) / pulseDuration;
    if (phase >= 1) {
      pulse = null;
      return;
    }

    const origin = pulse.origin;
    const distances = points.map(point => distance(point, origin));
    knot.edges.forEach(([a, b]) => {
      if (distances[b] < distances[a]) [a, b] = [b, a];
      const local = (phase - distances[a] * .34) / .48;
      const head = unit(local), tail = unit(local - .30);
      if (head <= tail) return;
      const from = vertices[a], to = vertices[b];
      const along = t => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      stroke(along(tail), along(head), accent, .88 * (1 - phase), 2.3);
    });
    ring(projection.project(origin), 11 + phase * 54, .7 * (1 - phase) ** 2);
    schedule();
  }

  function paint(now) {
    frame = 0;
    if (!visible() || !layout) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);
    ctx.lineCap = 'round';

    const projection = drag?.moved ? camera(points[drag.index]) : camera();
    const vertices = points.map(point => projection.project(point));
    const marked = new Set(contacts.flatMap(crossing => crossing.edges));
    const active = drag?.index ?? selected;
    const sway = new Map();
    for (const [index, vibration] of vibrations) {
      vibration.start ??= now;
      const time = (now - vibration.start) / 1000;
      if (time >= .82) { vibrations.delete(index); continue; }
      const decay = Math.exp(-time * 6);
      const wave = Math.cos(time * 32) * decay;
      sway.set(index, { x: vibration.x * wave, y: vibration.y * wave,
        z: vibration.z * wave + Math.hypot(vibration.x, vibration.y) * Math.sin(time * 30) * decay * .65 });
    }

    const wires = knot.edges.map(([a, b], index) => ({ a, b, index, z: vertices[a].z + vertices[b].z }));
    wires.sort((a, b) => a.z - b.z);
    for (const { a, b, index, z } of wires) {
      const crossing = marked.has(index);
      const activeWire = a === active || b === active;
      const opacity = activeWire ? .95 : crossing ? (points.length > 16 ? (active < 0 ? .48 : .22) : .82)
        : solved || forced.matches ? .76 : .35 + unit((z + 1) / 2) * .24;
      const color = crossing ? accent : ink;
      const width = crossing ? 1.6 : 1.25;
      if (!sway.has(a) && !sway.has(b)) {
        stroke(vertices[a], vertices[b], color, opacity, width);
        continue;
      }
      const first = points[a], second = points[b];
      const left = sway.get(a), right = sway.get(b);
      ctx.strokeStyle = color;
      ctx.globalAlpha = opacity;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(vertices[a].x, vertices[a].y);
      for (let i = 1; i <= 12; i++) {
        const t = i / 12, u = 1 - t, bend = Math.sin(Math.PI * t);
        const x = first.x * u + second.x * t + bend * ((left?.x ?? 0) * u + (right?.x ?? 0) * t);
        const y = first.y * u + second.y * t + bend * ((left?.y ?? 0) * u + (right?.y ?? 0) * t);
        const z = first.z * u + second.z * t + bend * ((left?.z ?? 0) * u + (right?.z ?? 0) * t);
        const point = projection.project({ x, y, z });
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
    }
    const markerStep = active < 0 ? Math.max(1, Math.ceil(contacts.length / 38)) : 1;
    contacts.forEach((crossing, index) => {
      if (active >= 0 && !crossing.edges.some(edge => knot.edges[edge].includes(active))) return;
      if (index % markerStep === 0) ring(projection.project(crossing), 3.8, .84);
    });

    vertices.forEach(({ x, y, z, scale }, index) => {
      const style = buttons[index].style;
      style.left = `${x}px`;
      style.top = `${y}px`;
      style.zIndex = String(index === active ? 100 : Math.round(z * 20 + 30));
      style.setProperty('--node-depth', scale);
    });

    if (pulse) paintPulse(now, vertices, projection);
    if (vibrations.size) schedule();
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
      x: event.clientX - rect.left - field.clientLeft,
      y: event.clientY - rect.top - field.clientTop,
    };
  }

  function resetView() {
    if (!available() || drag) return;
    yaw = pitch = 0;
    view = frameView(points);
    schedule();
  }

  on(front, 'click', resetView);
  on(front, 'keydown', event => {
    if (!available() || drag || !Object.hasOwn(arrows, event.key)) return;
    event.preventDefault();
    const [x, y] = arrows[event.key];
    yaw += x * .18;
    pitch += y * .18;
    schedule();
  });

  on(field, 'pointerdown', event => {
    if (!available() || !layout || drag || orbit || event.button !== 0 || event.isPrimary === false) return;
    orbitMoved = false;
    if (event.target.closest?.('[data-play-node]')) return;
    orbit = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch };
  });

  on(window, 'pointermove', event => {
    if (orbit?.id !== event.pointerId || !available()) return;
    const x = event.clientX - orbit.x, y = event.clientY - orbit.y;
    if (!orbitMoved && Math.hypot(x, y) < 5) return;
    orbitMoved = true;
    field.dataset.orbiting = 'true';
    yaw = (orbit.yaw + x * .013) % (Math.PI * 2);
    pitch = (orbit.pitch - y * .013) % (Math.PI * 2);
    schedule();
  });

  function releaseOrbit() {
    orbit = null;
    delete field.dataset.orbiting;
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
      vibrations.delete(current.index);
      syncCrossings();
    }
    schedule();
  }

  function togglePoint(index) {
    selected = selected === index ? -1 : index;
    syncSelection();
    if (selected >= 0) {
      const { x, y, z } = points[index];
      announce(`Point ${index + 1} selected. ${Math.round(x * 100)} on X, ${Math.round(y * 100)} on Y, ${Math.round(z * 100)} on Z.`);
    } else announce('Point deselected.');
    schedule();
  }

  buttons.forEach((button, index) => {
    on(button, 'pointerdown', event => {
      if (!playable() || drag || orbit || event.button !== 0 || event.isPrimary === false) return;
      const projection = camera();
      const origin = points[index];
      drag = {
        button, index, id: event.pointerId, origin, moved: false,
        x: event.clientX, y: event.clientY, projection,
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
      const target = camera().move(points[index], dx * step * layout.size, dy * step * layout.size);
      if (place(index, target)) finishMove(index);
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
    const target = drag.projection.move(drag.origin, event.clientX - drag.x, event.clientY - drag.y);
    place(drag.index, target);
  }

  on(window, 'pointermove', trackDrag);
  on(window, 'pointerup', event => {
    if (orbit?.id === event.pointerId) releaseOrbit();
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
    if (orbit?.id === event.pointerId) releaseOrbit();
    if (drag?.id === event.pointerId) cancelDrag();
  });
  on(field, 'click', event => {
    if (!playable() || orbitMoved || selected < 0 || event.target.closest?.('[data-play-node]')) return;
    const pointer = pointerPosition(event);
    const projection = camera(), origin = points[selected], position = projection.project(origin);
    if (!place(selected, projection.move(origin, pointer.x - position.x, pointer.y - position.y))) return;
    const index = selected;
    selected = -1;
    syncSelection();
    finishMove(index);
  });
  on(reset, 'click', () => { if (available()) restoreKnot(true); });
  on(newKnot, 'click', () => { if (available()) loadKnot(level, true); });
  on(next, 'click', () => {
    if (available() && solved) loadKnot((level + 1) % stageCount, true);
  });

  function pause() {
    cancelDrag();
    releaseOrbit();
    vibrations.clear();
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
  on(window, 'blur', pause);
  on(window, 'resize', resume);
  on(reduced, 'change', () => { pulse = null; vibrations.clear(); schedule(); });
  on(forced, 'change', () => { pulse = null; vibrations.clear(); readPalette(); });

  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  resize?.observe(field);
  const theme = typeof MutationObserver === 'function' ? new MutationObserver(readPalette) : null;
  theme?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  signal.addEventListener('abort', () => { pause(); resize?.disconnect(); theme?.disconnect(); }, { once: true });

  loadKnot(0);
  readPalette();
  measure();
}
