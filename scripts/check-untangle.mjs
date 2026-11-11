import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { boardLayout, cameraProjection, createKnot, findContacts, frameView, movePoint, stageCount } from '../src/untangle-model.js';
import { initUntangle } from '../src/untangle.js';

const passed = [];
function check(name, verify) {
  verify();
  passed.push(name);
}

function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

check('five stages generate distinct solvable layouts with increasing complexity', () => {
  const minima = [1, 3, 8, 18, 45];
  for (let level = 0; level < stageCount; level++) {
    const arrangements = new Set(), connections = new Set();
    for (let seed = 1; seed <= 100; seed++) {
      const knot = createKnot(level, rng(seed));
      arrangements.add(JSON.stringify(knot.points));
      const depths = knot.points.map(point => point.z);
      assert.ok(Math.max(...depths) - Math.min(...depths) > .45);
      connections.add(JSON.stringify(knot.edges));
      assert.ok(findContacts(knot.points, knot.edges).length >= minima[level]);
      assert.equal(findContacts(knot.solution, knot.edges).length, 0);
      for (const index of knot.order) {
        const target = knot.solution[index];
        assert.equal(movePoint(knot.points, index, target), true);
      }
      assert.equal(findContacts(knot.points, knot.edges).length, 0);
      if (level === 4) assert.deepEqual([knot.points.length, knot.edges.length], [25, 56]);
    }
    assert.equal(arrangements.size, 100);
    assert.ok(connections.size > 1);
  }
});

check('contacts are measured in 3D, so crossing in the projection alone is allowed', () => {
  const points = [[0, 0, 0], [1, 1, 0], [0, 1, 0], [1, 0, 0]].map(([x, y, z]) => ({ x, y, z }));
  const edges = [[0, 1], [2, 3]];
  assert.deepEqual(findContacts(points, edges), [{ x: .5, y: .5, z: 0, edges: [0, 1] }]);
  points[2].z = points[3].z = .16;
  assert.equal(findContacts(points, edges).length, 0);
  assert.equal(findContacts(points, [[0, 1], [0, 2]]).length, 0);
});

check('full side view spreads by Z and screen drag remains reversible at every angle', () => {
  const layout = boardLayout(344, 332);
  const point = { x: .23, y: .67, z: .18 };
  for (let angle = 0; angle <= 360; angle += 5) {
    const camera = cameraProjection(layout, angle * Math.PI / 180, angle * Math.PI / 270);
    const from = camera.project(point);
    const next = camera.project(camera.move(point, 62, -31));
    assert.ok(Math.abs(next.x - from.x - 62) < 1e-10);
    assert.ok(Math.abs(next.y - from.y + 31) < 1e-10);
  }
  const side = cameraProjection(layout, Math.PI / 2, 0);
  assert.ok(Math.abs(side.project(point).x - side.project({ ...point, z: .84 }).x) > 100);
});

check('wide and compact frames preserve camera scale and pivot throughout a full orbit', () => {
  for (const layout of [boardLayout(1096, 720), boardLayout(336, 410)]) {
    for (let seed = 1; seed <= 16; seed++) {
      const { points } = createKnot(4, rng(seed));
      const view = frameView(points);
      const front = cameraProjection(layout, 0, 0, view);
      for (let angle = 0; angle <= 360; angle += 15) {
        const radians = angle * Math.PI / 180;
        const camera = cameraProjection(layout, radians, radians / 2, view);
        const pivot = camera.project(view.center);
        assert.equal(pivot.x, layout.width / 2);
        assert.equal(pivot.y, layout.height / 2);
        const offset = camera.move(view.center, 80, 55);
        const reference = front.move(view.center, 80, 55);
        const length = point => Math.hypot(point.x - view.center.x, point.y - view.center.y, point.z - view.center.z);
        assert.ok(Math.abs(length(offset) - length(reference)) < 1e-10);
        assert.ok(points.map(camera.project).every(p => p.x >= 22 && p.x <= layout.width - 22 &&
          p.y >= 22 && p.y <= layout.height - 22));
      }
    }
  }
});

check('free drag moves beyond the original bounds and reaches depth from the side', () => {
  const layout = boardLayout(344, 332);
  const front = cameraProjection(layout, 0, 0);
  const side = cameraProjection(layout, Math.PI / 2, 0);
  const points = [{ x: .5, y: .5, z: .5 }, { x: .8, y: .8, z: .8 }];
  const outside = front.move(points[0], 500, -500);
  assert.ok(outside.x > 1 && outside.y < 0);
  assert.equal(outside.z, .5);
  const deeper = side.move(outside, 500, 0);
  assert.ok(deeper.z > 1);
  assert.ok(Math.abs(deeper.x - outside.x) < 1e-10);
  assert.equal(movePoint(points, 0, deeper), true);
  assert.equal(movePoint(points, 0, { ...points[1] }), true);
});
class Element extends EventTarget {
  dataset = {};
  style = { setProperty(name, value) { this[name] = value; } };
  attributes = new Map();
  children = [];
  capture = new Set();
  textContent = '';
  hidden = false;
  inert = false;
  disabled = false;
  setAttribute(key, value) { this.attributes.set(key, value); }
  append(...children) { this.children.push(...children); }
  contains(element) { return this === element || this.children.some(child => child.contains(element)); }
  closest(selector) { return selector === '[data-play-node]' && 'playNode' in this.dataset ? this : null; }
  setPointerCapture(id) { this.capture.add(id); }
  hasPointerCapture(id) { return this.capture.has(id); }
  releasePointerCapture(id) { this.capture.delete(id); }
  focus() { document.activeElement = this; }
}
function emit(target, type, properties = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [name, value] of Object.entries(properties)) Object.defineProperty(event, name, { value });
  target.dispatchEvent(event);
  return event;
}

function fixture({ reduced = false, canvasSupport = true } = {}) {
  const abort = new AbortController();
  setMaxListeners(0, abort.signal);
  const panel = new Element(), root = new Element();
  const elements = Object.fromEntries([
    '[data-play-field]', 'canvas', '[data-play-nodes]', '[data-play-knot]', '[data-play-status]',
    '[data-play-live]', '[data-play-front]', '[data-play-reset]', '[data-play-new]', '[data-play-next]',
    '.play-toolbar', '[data-play-highlight]', '[data-play-fallback]',
  ].map(name => [name, new Element()]));
  const field = elements['[data-play-field]'], canvas = elements.canvas;
  const nodes = elements['[data-play-nodes]'], status = elements['[data-play-status]'];
  const reset = elements['[data-play-reset]'], next = elements['[data-play-next]'];
  const newKnot = elements['[data-play-new]'];
  const label = elements['[data-play-knot]'], live = elements['[data-play-live]'];
  const frames = new Map(), observers = [], strokes = [];
  let id = 0, ink = '#efeaf7', accent = '#ff784f';
  const rect = { left: 21, top: 130, width: 344, height: 332 };
  const context = {
    setTransform() {}, clearRect() { strokes.length = 0; },
    beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
    stroke() { strokes.push(this.strokeStyle); },
  };
  canvas.getContext = () => canvasSupport ? context : null;
  field.getBoundingClientRect = () => rect;
  field.clientWidth = rect.width;
  field.clientHeight = rect.height;
  field.clientLeft = field.clientTop = 0;
  root.querySelector = name => elements[name];
  root.closest = () => panel;
  globalThis.document = new EventTarget();
  document.hidden = false;
  document.documentElement = { dataset: { entry: 'ready' } };
  document.createElement = () => new Element();
  document.querySelector = () => null;
  globalThis.window = new EventTarget();
  window.devicePixelRatio = 3;
  globalThis.getComputedStyle = () => ({ color: ink, getPropertyValue: () => accent });
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = number => frames.delete(number);
  const motion = new EventTarget(), forced = new EventTarget();
  motion.matches = reduced; forced.matches = false;
  globalThis.matchMedia = query => query.includes('reduced-motion') ? motion : forced;
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  globalThis.ResizeObserver = globalThis.MutationObserver = Observer;
  const source = rng(12345), expected = rng(12345);
  initUntangle(root, abort.signal, source);
  const front = elements['[data-play-front]'];
  emit(front, 'click');
  const layout = boardLayout(rect.width, rect.height);
  let view, yaw = 0;
  function nextExpected(level) {
    const knot = createKnot(level, expected);
    view = frameView(knot.points);
    yaw = 0;
    return knot;
  }
  function fit(points) {
    view = frameView(points);
    yaw = 0;
    emit(front, 'click');
  }
  function sideView() {
    const pointer = { clientX: rect.left + 12, clientY: rect.top + 12, pointerId: 8 };
    emit(field, 'pointerdown', { ...pointer, button: 0 });
    emit(window, 'pointermove', { ...pointer, clientX: pointer.clientX + Math.PI / 2 / .013 });
    emit(window, 'pointerup', pointer);
    yaw = Math.PI / 2;
  }
  function pointAt(x, y, z = 0) {
    const point = cameraProjection(layout, yaw, 0, view).project({ x, y, z });
    return { clientX: rect.left + point.x, clientY: rect.top + point.y };
  }
  function grab(index, point, pointerId = 7) {
    emit(nodes.children[index], 'pointerdown', { ...pointAt(...point), pointerId, button: 0, isPrimary: true, pointerType: 'touch' });
  }
  function send(type, point, pointerId = 7) {
    emit(window, type, { ...pointAt(...point), pointerId, button: 0, pointerType: 'touch' });
  }
  function drag(index, from, to) {
    grab(index, from);
    send('pointermove', to);
    send('pointerup', to);
  }
  return {
    abort, panel, field, canvas, nodes, status, front, reset, newKnot, next, label, live, frames, observers, strokes, rect, nextExpected, fit, sideView,
    fallback: elements['[data-play-fallback]'], toolbar: elements['.play-toolbar'],
    pointAt, grab, send, drag,
    step(now = 0) {
      const jobs = [...frames.values()];
      frames.clear();
      jobs.forEach(job => job(now));
    },
    recolor() {
      ink = '#27202f'; accent = '#8c340d';
      observers[1].callback();
    },
  };
}

{
  const f = fixture();
  let knot = f.nextExpected(0);
  f.step();
  check('stage one shows the generated crossing count and no idle frames', () => {
    assert.equal(f.label.textContent, 'Stage 1 / 5');
    assert.equal(parseInt(f.status.textContent, 10), findContacts(knot.points, knot.edges).length);
    assert.equal(f.frames.size, 0);
  });

  const before = f.nodes.children[0].style.left, count = f.status.textContent;
  const point = f.pointAt(.5, .5);
  emit(f.field, 'pointerdown', { ...point, pointerId: 8, button: 0 });
  emit(window, 'pointermove', { ...point, clientX: point.clientX + 40, pointerId: 8 });
  f.step(20);
  check('orbit changes the projection without changing the knot or requiring a loop', () => {
    assert.notEqual(f.nodes.children[0].style.left, before);
    assert.equal(f.status.textContent, count);
    assert.equal(f.frames.size, 0);
  });
  emit(window, 'pointerup', { pointerId: 8 });
  emit(f.front, 'click');
  f.step(40);
  assert.equal(f.nodes.children[0].style.left, before);

  const i = knot.order[0], at = point => [point.x, point.y, point.z];
  f.grab(i, at(knot.points[i]));
  f.send('pointermove', at(knot.solution[i]));
  f.step(60);
  check('a drag starts a finite string vibration and waits for release to complete', () => {
    assert.equal(f.frames.size, 1);
    assert.equal(f.next.hidden, true);
  });
  f.send('pointercancel', at(knot.solution[i]));
  f.step(900);
  check('cancelling the drag restores the original crossing count', () => assert.equal(f.status.textContent, count));

  emit(f.newKnot, 'click');
  knot = f.nextExpected(0);
  emit(f.front, 'click');
  f.step(920);
  check('New knot rebuilds stage one and keeps its progression position', () => {
    assert.equal(f.label.textContent, 'Stage 1 / 5');
    assert.notEqual(f.nodes.children[0].style.left, before);
  });

  for (let level = 0; level < stageCount; level++) {
    for (const index of knot.order) {
      if (!f.next.hidden) break;
      const origin = knot.points[index], target = knot.solution[index];

      f.drag(index, at(origin), at(target));
      knot.points[index] = { ...target, z: origin.z };
      if (!f.next.hidden) break;
      f.fit(knot.points);
      f.sideView();
      f.drag(index, at(knot.points[index]), at(target));
      knot.points[index] = target;
      f.fit(knot.points);
    }
    assert.equal(f.field.dataset.solved, 'true');
    assert.equal(f.next.textContent, level === 4 ? 'Play again' : 'Next knot');
    emit(f.next, 'click');
    knot = f.nextExpected((level + 1) % stageCount);
    emit(f.front, 'click');
    f.step(950 + level * 30);
  }
  check('all five stages complete and Play again draws a fresh first stage', () => {
    assert.equal(f.label.textContent, 'Stage 1 / 5');
    assert.equal(f.next.hidden, true);
    assert.equal(f.frames.size, 0);
  });
  f.abort.abort();
  assert.ok(f.observers.every(observer => observer.disconnected));
}

{
  const f = fixture({ reduced: true });
  const knot = f.nextExpected(0);
  f.step();
  const index = knot.order[0], point = knot.points[index], to = knot.solution[index];
  emit(f.nodes.children[index], 'click', { detail: 0 });
  emit(f.field, 'click', { target: f.field, ...f.pointAt(to.x, to.y) });
  f.step(40);
  check('tap to place updates spatial contacts without any reduced motion frames', () => {
    const projected = { ...to, z: point.z };
    knot.points[index] = projected;
    const count = findContacts(knot.points, knot.edges).length;
    assert.equal(f.status.textContent, count ? `${count} ${count === 1 ? 'contact' : 'contacts'} left` : 'Knot untangled');
    assert.equal(f.frames.size, 0);
  });
  f.abort.abort();
}

{
  const f = fixture();
  const first = f.nextExpected(0);
  const index = first.order[0], from = first.points[index], to = first.solution[index];
  f.drag(index, [from.x, from.y], [to.x, to.y]);
  assert.equal(f.next.hidden, false);
  emit(f.next, 'click');
  const knot = f.nextExpected(1);
  emit(f.front, 'click');
  const origin = knot.points[0];
  const raised = { ...origin, x: origin.x - 300, y: origin.y - 300 };
  const startView = frameView(knot.points);
  const layout = boardLayout(f.rect.width, f.rect.height);
  f.step();
  f.grab(0, [origin.x, origin.y]);
  f.send('pointermove', [raised.x, raised.y]);
  f.step(20);
  const visibleNodes = f.nodes.children.filter(button => !button.hidden);
  const insideField = ({ style }) => {
    const x = parseFloat(style.left), y = parseFloat(style.top);
    return x >= 22 && x <= layout.width - 22 && y >= 22 && y <= layout.height - 22;
  };
  check('all nodes stay inside the arena even before an extreme drag is released', () => {
    assert.equal(f.nodes.children[0].hasPointerCapture(7), true);
    assert.ok(visibleNodes.every(insideField));
  });
  f.send('pointermove', [origin.x, origin.y]);
  f.step(30);
  const front = cameraProjection(layout, 0, 0, startView);
  assert.equal(f.nodes.children[0].style.top, `${front.project(origin).y}px`);
  f.send('pointerup', [raised.x, raised.y]);
  f.step(40);
  const stretched = [raised, ...knot.points.slice(1)];
  const fit = cameraProjection(layout, 0, 0, frameView(stretched));
  check('dragging far above the field reframes the full network after release', () => {
    for (const [index, point] of stretched.entries()) {
      const projected = fit.project(point);
      assert.ok(Math.abs(parseFloat(f.nodes.children[index].style.top) - projected.y) < .001);
      assert.ok(insideField(f.nodes.children[index]));
    }
  });
  f.fit(stretched);
  f.sideView();
  f.step(60);
  emit(f.reset, 'click');
  f.step(80);
  const startingCamera = cameraProjection(layout, .23, -.24, startView);
  check('Reset restores the original points, contacts and camera at the same stage', () => {
    assert.equal(f.label.textContent, 'Stage 2 / 5');
    assert.equal(parseInt(f.status.textContent, 10), findContacts(knot.points, knot.edges).length);
    assert.equal(f.field.dataset.solved, 'false');
    assert.equal(f.next.hidden, true);
    for (const [index, point] of knot.points.entries()) {
      const projected = startingCamera.project(point);
      const { style } = f.nodes.children[index];
      assert.ok(Math.abs(parseFloat(style.left) - projected.x) < .001);
      assert.ok(Math.abs(parseFloat(style.top) - projected.y) < .001);
    }
    assert.equal(f.frames.size, 0);
  });

  f.fit(knot.points);
  f.grab(0, [origin.x, origin.y]);
  f.send('pointermove', [raised.x, raised.y]);
  assert.equal(f.nodes.children[0].hasPointerCapture(7), true);
  emit(f.reset, 'click');
  f.send('pointerup', [raised.x, raised.y]);
  f.step(100);
  check('Reset releases the active drag and ignores its stale pointer release', () => {
    assert.equal(f.nodes.children[0].hasPointerCapture(7), false);
    assert.equal(f.nodes.children[0].dataset.grabbed, undefined);
    assert.equal(f.nodes.children[0].style.top, `${startingCamera.project(origin).y}px`);
    assert.equal(document.activeElement, f.nodes.children[0]);
    assert.equal(f.frames.size, 0);
  });
  f.abort.abort();
}

{
  const f = fixture({ canvasSupport: false });
  check('missing Canvas leaves a readable fallback', () => {
    assert.equal(f.fallback.hidden, false);
    assert.equal(f.field.hidden, true);
    assert.equal(f.frames.size, 0);
  });
  f.abort.abort();
}

console.log(`${passed.length} Untangle checks passed`);
