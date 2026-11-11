import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { boardLayout, findCrossings, knots, movePoint, startingPoints } from '../src/untangle-model.js';
import { initUntangle } from '../src/untangle.js';

const passed = [];
function check(name, verify) {
  verify();
  passed.push(name);
}

check('three knots start crossed and have a reachable planar arrangement', () => {
  const startCounts = [];
  for (const knot of knots) {
    const points = startingPoints(knot);
    startCounts.push(findCrossings(points, knot.edges).length);
    for (const index of Object.keys(knot.displaced).map(Number)) {
      assert.equal(movePoint(points, index, ...knot.points[index]), true);
    }
    assert.deepEqual(findCrossings(points, knot.edges), []);
    assert.notDeepEqual(points, startingPoints(knot));
  }
  assert.deepEqual(startCounts, [3, 5, 20]);
});
check('shared endpoints are allowed, unrelated touches and overlapping wires are not', () => {
  const points = [[0, 0], [1, 1], [0, 1], [1, 0], [.5, .5]].map(([x, y]) => ({ x, y }));
  assert.deepEqual(findCrossings(points, [[0, 1], [2, 3]]), [{ x: .5, y: .5, edges: [0, 1] }]);
  assert.equal(findCrossings(points, [[0, 1], [0, 2]]).length, 0);
  assert.equal(findCrossings(points, [[0, 1], [0, 4]]).length, 1);
  assert.equal(findCrossings(points, [[0, 1], [2, 4]]).length, 1);
  assert.equal(findCrossings(points, [[0, 3], [1, 2]]).length, 0);
});
check('coordinates clamp to the board and points cannot collapse onto each other', () => {
  const points = startingPoints(knots[0]);
  assert.equal(movePoint(points, 0, -.2, 1.2), true);
  assert.deepEqual(points[0], { x: 0, y: 1 });
  assert.equal(movePoint(points, 1, 0, .97), false);
  assert.equal(movePoint(points, 1, NaN, .5), false);
  assert.equal(movePoint(points, 9, .5, .5), false);
});
check('mobile and desktop layouts leave a full hit target at every board edge', () => {
  for (const [width, height] of [[260, 264], [344, 332], [520, 415], [840, 540]]) {
    const frame = boardLayout(width, height);
    assert.ok(frame.left >= 22 && frame.top >= 22);
    assert.equal(frame.left * 2 + frame.size, width);
    assert.equal(frame.top * 2 + frame.size, height);
  }
});

class Element extends EventTarget {
  dataset = {};
  style = {};
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
    '[data-play-live]', '[data-play-reset]', '[data-play-next]', '.play-toolbar', '[data-play-fallback]',
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
  initUntangle(root, abort.signal);
  function pointAt(x, y) {
    const layout = boardLayout(rect.width, rect.height);
    return { clientX: rect.left + layout.left + x * layout.size, clientY: rect.top + layout.top + y * layout.size };
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
    abort, panel, field, canvas, nodes, status, reset, next, label, live, frames, observers, strokes, rect,
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
  f.step();
  check('the first board is immediately playable, capped at 2× DPR and idle after painting', () => {
    assert.equal(f.label.textContent, 'Loop · 1 / 3');
    assert.equal(f.status.textContent, '3 crossings left');
    assert.equal(f.nodes.children.filter(node => !node.hidden).length, 6);
    assert.equal(f.canvas.width, 688);
    assert.equal(f.frames.size, 0);
    assert.ok(f.strokes.includes('#ff784f'));
  });
  f.recolor();
  f.step();
  check('changing theme repaints the same knot once in the new ink', () => {
    assert.ok(f.strokes.includes('#8c340d'));
    assert.equal(f.status.textContent, '3 crossings left');
    assert.equal(f.frames.size, 0);
  });

  emit(f.nodes.children[0], 'click', { detail: 0 });
  f.nodes.children[1].focus();
  f.grab(1, knots[0].displaced[1]);
  f.send('pointermove', knots[0].points[1], 8);
  check('a second finger cannot move or release the captured point', () => {
    assert.equal(f.status.textContent, '3 crossings left');
    assert.equal(f.nodes.children[1].hasPointerCapture(7), true);
  });
  f.send('pointermove', knots[0].points[1]);
  check('the crossings update while dragging and the knot clears only on release', () => {
    assert.equal(f.status.textContent, '0 crossings left');
    assert.equal(f.nodes.children[0].attributes.get('aria-pressed'), 'false');
    assert.equal(f.next.hidden, true);
  });
  f.send('pointerup', knots[0].points[1]);
  f.step(30);
  check('releasing the final move locks the knot, focuses Next and starts one pulse', () => {
    assert.equal(f.nodes.children[1].hasPointerCapture(7), false);
    assert.equal(f.field.dataset.solved, 'true');
    assert.equal(f.status.textContent, 'Knot untangled');
    assert.equal(f.next.textContent, 'Next knot');
    assert.equal(document.activeElement, f.next);
    assert.equal(f.frames.size, 1);
  });
  f.step(120);
  f.step(950);
  check('the success pulse ends without leaving an idle animation', () => {
    assert.equal(f.frames.size, 0);
    assert.ok(f.strokes.every(color => color === '#27202f'));
  });

  emit(f.next, 'click');
  f.step();
  check('Next prepares the next knot and focuses its first point', () => {
    assert.equal(f.label.textContent, 'Bridge · 2 / 3');
    assert.equal(f.status.textContent, '5 crossings left');
    assert.equal(f.next.hidden, true);
    assert.equal(document.activeElement, f.nodes.children[0]);
  });
  emit(f.nodes.children[1], 'click', { detail: 0 });
  emit(f.field, 'click', { target: f.field, ...f.pointAt(...knots[1].points[1]) });
  check('select and place moves a point without a drag', () => {
    assert.equal(f.status.textContent, '3 crossings left');
    assert.equal(f.nodes.children[1].attributes.get('aria-pressed'), 'false');
  });
  emit(f.reset, 'click');
  check('Reset restores the current knot instead of returning to the first', () => {
    assert.equal(f.label.textContent, 'Bridge · 2 / 3');
    assert.equal(f.status.textContent, '5 crossings left');
  });
  for (const index of [1, 7]) f.drag(index, knots[1].displaced[index], knots[1].points[index]);
  emit(f.next, 'click');
  for (const index of [0, 2, 5]) f.drag(index, knots[2].displaced[index], knots[2].points[index]);
  check('the last knot reaches the complete state and offers one replay action', () => {
    assert.equal(f.label.textContent, 'Rosette · 3 / 3');
    assert.equal(f.status.textContent, 'All knots untangled');
    assert.equal(f.reset.hidden, true);
    assert.equal(f.next.textContent, 'Play again');
  });
  emit(f.next, 'click');
  check('Play again resets the whole game', () => {
    assert.equal(f.label.textContent, 'Loop · 1 / 3');
    assert.equal(f.status.textContent, '3 crossings left');
    assert.equal(f.next.hidden, true);
  });
  f.abort.abort();
  check('abort releases the paint and observers', () => {
    assert.equal(f.frames.size, 0);
    assert.ok(f.observers.every(observer => observer.disconnected));
  });
}

{
  const f = fixture({ reduced: true });
  f.step();
  const key = emit(f.nodes.children[0], 'keydown', { key: 'ArrowRight', shiftKey: true });
  f.step();
  check('keyboard moves a focused point in fine steps with Shift', () => {
    assert.equal(key.defaultPrevented, true);
    assert.ok(Math.abs(parseFloat(f.nodes.children[0].style.left) - (f.pointAt(.306, .12).clientX - f.rect.left)) < .01);
  });
  emit(f.reset, 'click');
  f.grab(1, knots[0].displaced[1]);
  f.send('pointermove', knots[0].points[1]);
  f.send('pointercancel', knots[0].points[1]);
  check('cancelled touch restores the original position without completing the knot', () => {
    assert.equal(f.status.textContent, '3 crossings left');
    assert.equal(f.next.hidden, true);
    assert.equal(f.nodes.children[1].hasPointerCapture(7), false);
  });
  f.grab(1, knots[0].displaced[1]);
  f.send('pointermove', knots[0].points[1]);
  f.panel.inert = true;
  emit(document, 'portfolio:sectionstart');
  f.panel.hidden = true;
  f.step();
  check('leaving Play cancels a held drag and retains the puzzle', () => {
    assert.equal(f.status.textContent, '3 crossings left');
    assert.equal(f.frames.size, 0);
  });
  f.panel.hidden = f.panel.inert = false;
  emit(document, 'portfolio:sectionsettled');
  f.drag(1, knots[0].displaced[1], knots[0].points[1]);
  f.step(30);
  check('reduced motion preserves success and the next action without a pulse', () => {
    assert.equal(f.field.dataset.solved, 'true');
    assert.equal(f.frames.size, 0);
    assert.equal(f.next.hidden, false);
  });
  f.abort.abort();
}

{
  const f = fixture({ canvasSupport: false });
  check('missing Canvas shows a readable fallback without starting the controller', () => {
    assert.equal(f.fallback.hidden, false);
    assert.equal(f.field.hidden, true);
    assert.equal(f.toolbar.hidden, true);
    assert.equal(f.frames.size, 0);
  });
  f.abort.abort();
}

console.log(`${passed.length} Untangle checks passed`);
