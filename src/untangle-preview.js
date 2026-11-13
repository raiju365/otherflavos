import { boardLayout, cameraProjection, findContacts, frameView } from './untangle-model.js';

const draggedIndex = 2;
const start = [
  [.09, .11, .58], [.49, .08, .84], [.15, .23, .266],
  [.08, .48, .46], [.53, .47, .10], [.90, .47, .78],
  [.11, .93, .22], [.53, .87, .73], [.88, .88, .33],
].map(([x, y, z]) => ({ x, y, z }));
const edges = [
  [0, 1], [0, 3], [0, 4], [1, 2], [1, 4], [2, 4], [2, 5], [3, 4],
  [3, 6], [3, 7], [4, 5], [4, 7], [4, 8], [5, 8], [6, 7], [7, 8],
];
const previewSize = 320;
const dragOffset = { x: 165, y: -26 };
const projection = cameraProjection(boardLayout(previewSize, previewSize), .10, .22, frameView(start));
const origin = start[draggedIndex];
// Move along the camera plane, exactly as the playable board does during a drag.
const destination = projection.move(origin, dragOffset.x, dragOffset.y);
const landing = projection.project(destination);
const duration = 2320;
const accent = '#fa9673';
const unit = value => Math.max(0, Math.min(1, value));
const ease = value => value * value * (3 - 2 * value);

function circle(ctx, { x, y }, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function line(ctx, from, to, offsetY = 0) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y + offsetY);
  ctx.lineTo(to.x, to.y + offsetY);
  ctx.stroke();
}

function draw(ctx, time) {
  const drag = ease(unit((time - 300) / 1530));
  const selected = ease(unit(time / 270)) * (1 - ease(unit((time - 1830) / 420)));
  const points = start.slice();
  points[draggedIndex] = projection.move(origin, drag * dragOffset.x, drag * dragOffset.y);
  const nodes = points.map(projection.project);
  const handle = nodes[draggedIndex];
  const contacts = findContacts(points, edges);
  const marked = new Set(contacts.flatMap(contact => contact.edges));

  if (selected > 0) {
    ctx.globalAlpha = selected * .65;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    line(ctx, handle, landing);
    ctx.setLineDash([]);
    circle(ctx, landing, 7);
    ctx.stroke();
  }

  const wires = edges.map(([a, b], index) => ({ a: nodes[a], b: nodes[b], crossed: marked.has(index) }));
  wires.sort((left, right) => left.a.z + left.b.z - right.a.z - right.b.z);
  for (const { a, b, crossed } of wires) {
    const depth = unit(.5 + (a.z + b.z) * .55);
    ctx.globalAlpha = .64 + depth * .36;
    ctx.strokeStyle = '#151611';
    ctx.lineWidth = 4.5;
    line(ctx, a, b, 1.6);
    ctx.strokeStyle = crossed ? accent : '#dfdfd0';
    ctx.globalAlpha = crossed ? .89 : .42 + depth * .41;
    ctx.lineWidth = crossed ? 2.5 : 1.7 + depth * .8;
    line(ctx, a, b);
  }

  ctx.globalAlpha = 1;
  for (const contact of contacts) {
    circle(ctx, projection.project(contact), 4.6);
    ctx.fillStyle = '#2c2720';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  for (const node of nodes.slice().sort((a, b) => a.z - b.z)) {
    const radius = 6.5 * node.scale;
    const active = node === handle;
    circle(ctx, { x: node.x, y: node.y + 1.6 }, radius + 1);
    ctx.fillStyle = '#141510';
    ctx.fill();
    circle(ctx, node, radius);
    ctx.fillStyle = '#292b25';
    ctx.fill();
    ctx.strokeStyle = active ? accent : '#e8e8d8';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    circle(ctx, node, active ? 2.5 : 1.65);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  }

  if (selected > 0) {
    ctx.globalAlpha = selected * .78;
    circle(ctx, handle, 10 + 4 * selected);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export function initUntanglePreview(canvas, panel, menu, signal) {
  const ctx = canvas.getContext('2d');
  if (!ctx || signal.aborted) return;
  const card = canvas.closest('button');
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)');
  const on = (target, event, handler) => target.addEventListener(event, handler, { signal });
  let frame = 0, previous = null, time = 0, scale = 0, hovering = false;

  function paint() {
    if (!scale) return;
    const { width, height } = canvas;
    ctx.resetTransform();
    ctx.clearRect(0, 0, width, height);
    const span = previewSize * scale;
    ctx.setTransform(scale, 0, 0, scale, (width - span) / 2, (height - span) / 2);
    ctx.lineCap = 'round';
    draw(ctx, time);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = null;
    time = 0;
    paint();
  }

  function tick(now) {
    frame = 0;
    if (document.hidden || panel.hidden || panel.inert || menu.hidden || reduced.matches) {
      if (menu.hidden || panel.hidden || panel.inert) hovering = false;
      stop();
      return;
    }
    const active = (pointer.matches && hovering) || card.matches(':focus-visible');
    const step = previous === null ? 0 : Math.min(now - previous, 50);
    time = active ? Math.min(duration, time + step) : Math.max(0, time - step * 2.8);
    paint();
    if (time !== (active ? duration : 0)) {
      previous = now;
      schedule();
    } else {
      previous = null;
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  const resize = new ResizeObserver(([{ contentRect: { width, height } }]) => {
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    scale = Math.min(canvas.width * 1.12, canvas.height * 1.03) / previewSize;
    paint();
  });
  resize.observe(canvas);
  const visibility = new MutationObserver(schedule);
  visibility.observe(panel, { attributeFilter: ['hidden', 'inert'] });
  visibility.observe(menu, { attributeFilter: ['hidden'] });

  on(card, 'pointerenter', event => {
    hovering = event.pointerType !== 'touch';
    schedule();
  });
  on(card, 'pointerleave', () => { hovering = false; schedule(); });
  on(card, 'pointercancel', () => { hovering = false; schedule(); });
  on(card, 'focus', schedule);
  on(card, 'blur', schedule);
  on(pointer, 'change', schedule);
  on(reduced, 'change', schedule);
  on(document, 'visibilitychange', () => { hovering = false; stop(); });
  on(window, 'blur', () => { hovering = false; stop(); });
  on(window, 'pagehide', () => { hovering = false; stop(); });
  signal.addEventListener('abort', () => {
    resize.disconnect();
    visibility.disconnect();
    stop();
  }, { once: true });
}
