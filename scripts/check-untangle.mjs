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

check('all three world axes can move independently outside the original bounds', () => {
  const layout = boardLayout(344, 332);
  const camera = cameraProjection(layout, 0, 0);
  const points = [{ x: .5, y: .5, z: .5 }, { x: .8, y: .8, z: .8 }];
  for (const [axis, dx, dy] of [['x', 500, 0], ['y', 0, 500], ['z', 0, -500]]) {
    const from = points[0];
    const target = camera.move(from, dx, dy, axis);
    assert.ok(target[axis] > 1);
    for (const other of ['x', 'y', 'z'].filter(key => key !== axis)) assert.equal(target[other], from[other]);
    assert.equal(movePoint(points, 0, target), true);
  }
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
    '[data-play-live]', '[data-play-front]', '[data-play-axis]', '[data-play-reset]', '[data-play-next]', '.play-toolbar', '[data-play-fallback]',
  ].map(name => [name, new Element()]));
  const field = elements['[data-play-field]'], canvas = elements.canvas;
  const nodes = elements['[data-play-nodes]'], status = elements['[data-play-status]'];
  const reset = elements['[data-play-reset]'], next = elements['[data-play-next]'];
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
  const axis = elements['[data-play-axis]'];
  axis.value = 'free';
  initUntangle(root, abort.signal, source);
  const front = elements['[data-play-front]'];
  emit(front, 'click');
  const layout = boardLayout(rect.width, rect.height);
  let view;
  function nextExpected(level) {
    const knot = createKnot(level, expected);
    view = frameView(knot.points);
    return knot;
  }
  function fit(points) {
    view = frameView(points);
    emit(front, 'click');
  }
  function pointAt(x, y) {
    const point = cameraProjection(layout, 0, 0, view).project({ x, y, z: 0 });
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
    abort, panel, field, canvas, nodes, status, front, reset, next, label, live, frames, observers, strokes, rect, nextExpected, fit, axis,
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

  const i = knot.order[0], at = point => [point.x, point.y];
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

  emit(f.reset, 'click');
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
      f.axis.value = 'free';
      f.drag(index, at(origin), at(target));
      knot.points[index] = { ...target, z: origin.z };
      if (!f.next.hidden) break;
      f.fit(knot.points);
      f.axis.value = 'z';
      f.drag(index, at(target), [target.x, target.y - (target.z - origin.z)]);
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
  const f = fixture({ reduced: true });
  const knot = f.nextExpected(0);
  const origin = knot.points[0];
  f.step();
  f.axis.value = 'x';
  f.drag(0, [origin.x, origin.y], [origin.x + 3, origin.y]);
  f.step(40);
  knot.points[0] = { ...origin, x: origin.x + 3 };
  const fit = cameraProjection(boardLayout(f.rect.width, f.rect.height), 0, 0, frameView(knot.points));
  check('dragging far past the field moves the node and reframes the full network after release', () => {
    for (const [index, point] of knot.points.entries()) {
      const projected = fit.project(point);
      assert.ok(Math.abs(parseFloat(f.nodes.children[index].style.left) - projected.x) < .001);
      assert.ok(projected.x >= 20 && projected.x <= f.rect.width - 20);
    }
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
