import assert from 'node:assert/strict';
import { engravePortrait, portraitCrop, portraitSize, portraitPatternFrames, portraitPatternPosition } from '../src/portrait-image.js';
import { initFigure } from '../src/figure.js';

const passed = [];
function check(name, verify) {
  verify();
  passed.push(name);
}

function pixels(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(colorAt(x, y), (y * width + x) * 4);
  }
  return data;
}

check('the original crop stays inside the image at the portrait aspect ratio', () => {
  for (const [w, h] of [[736, 1119], [500, 400], [400, 650]]) {
    const crop = portraitCrop(w, h);
    assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= w && crop.y + crop.height <= h);
    assert.ok(Math.abs(crop.width / crop.height - portraitSize.width / portraitSize.height) < 1e-12);
  }
});

const width = 160, height = 200;
const tonalFixture = pixels(width, height, (x, y) => {
  const tone = x < 80 ? 40 : 170;
  const alpha = y < 15 ? 0 : y < 30 ? 120 : 255;
  return [tone, tone, tone, alpha];
});
const print = engravePortrait(tonalFixture, width, height);
check('every hatching phase stays inside the original photo alpha', () => {
  assert.equal(print.length, portraitPatternFrames);
  for (const mask of print) {
    assert.equal(mask.length, width * height);
    for (let i = 0; i < mask.length; i++) assert.ok(mask[i] <= tonalFixture[i * 4 + 3]);
  }
});
check('engraving phases move only the hatched field and retain the source tonal contrast', () => {
  assert.deepEqual(engravePortrait(tonalFixture, width, height), print);
  assert.notDeepEqual(print[0], print[1]);
  for (const mask of print) {
    const dark = [], light = [];
    for (let y = 60; y < 140; y++) {
      dark.push(mask[y * width + 45]);
      light.push(mask[y * width + 115]);
    }
    assert.ok(Math.max(...dark) - Math.min(...dark) > 50);
    assert.ok(dark.reduce((a, b) => a + b) > light.reduce((a, b) => a + b) * 3);
  }
});
check('the hatch phase advances smoothly and wraps to the same registration', () => {
  assert.equal(portraitPatternPosition(0), 0);
  assert.ok(portraitPatternPosition(700) > portraitPatternPosition(350));
  assert.ok(portraitPatternFrames - portraitPatternPosition(4199) < .01);
  assert.equal(portraitPatternPosition(4200), 0);
});

function setup({ loading = false, reduced = false, context = true, gate, badSamples = false } = {}) {
  const abort = new AbortController(), frames = new Map(), surfaces = [], queries = new Map(), observers = [];
  let id = 0, images = 0;
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  document.hidden = false;
  document.documentElement = { dataset: { entry: loading ? 'loading' : 'ready', theme: 'dark' } };
  const dialog = { open: false };
  document.querySelector = () => dialog;
  globalThis.devicePixelRatio = 3;
  let ink = 'rgb(41, 40, 36)';
  globalThis.getComputedStyle = () => ({ color: ink });
  globalThis.matchMedia = query => {
    const media = new EventTarget();
    media.matches = query.includes('reduced-motion') && reduced;
    queries.set(query, media);
    return media;
  };

  function surface() {
    const log = { draws: [], samples: 0, masks: [], fills: [] };
    const ctx = {
      clearRect() {},
      setTransform() {},
      drawImage(...args) { log.draws.push({ args, alpha: this.globalAlpha, mode: this.globalCompositeOperation }); },
      createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
      putImageData(image, x, y) { log.masks.push({ x, y, size: image.data.length }); },
      fillRect() { log.fills.push([this.globalCompositeOperation, this.fillStyle]); },
      getImageData(x, y, w, h) {
        if (badSamples) throw Error('sample read failed');
        log.samples++;
        return { data: pixels(w, h, (x, y) => [80, 50, 40, y < 12 ? 0 : 255]) };
      },
    };
    const canvas = { width: 0, height: 0, log, getContext: () => ctx };
    surfaces.push(canvas);
    return canvas;
  }
  const canvas = surface();
  canvas.clientWidth = 200;
  canvas.clientHeight = 250;
  if (!context) canvas.getContext = () => null;
  document.createElement = surface;
  globalThis.Image = class {
    naturalWidth = 736;
    naturalHeight = 1119;
    constructor() { images++; }
    decode() { return gate || Promise.resolve(); }
  };
  globalThis.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = key => frames.delete(key);
  class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  globalThis.IntersectionObserver = globalThis.ResizeObserver = globalThis.MutationObserver = Observer;
  return {
    abort, canvas, surfaces, queries, observers, frames, dialog,
    get images() { return images; },
    recolor(nextInk) {
      ink = nextInk;
      observers[2].callback([{ attributeName: 'data-theme' }]);
    },
    emit(target, type) { target.dispatchEvent(new Event(type)); },
    step(now) {
      const jobs = [...frames.values()];
      frames.clear();
      for (const job of jobs) job(now);
    },
  };
}

{
  const fixture = setup({ loading: true });
  const { abort, canvas, surfaces, observers, frames, queries, dialog } = fixture;
  const cleanup = await initFigure(canvas, abort.signal);
  const [, sample, atlas] = surfaces;
  check('entry receives a rendered engraving and one source read before animation starts', () => {
    assert.equal(fixture.images, 1);
    assert.equal(sample.log.samples, 1);
    assert.equal(sample.width, 1);
    assert.deepEqual([canvas.width, canvas.height], [400, 500]);
    assert.deepEqual(canvas.log.draws.map(draw => draw.args[0]), [atlas]);
    assert.equal(frames.size, 0);
  });

  document.documentElement.dataset.entry = 'ready';
  fixture.emit(document, 'portfolio:entryready');
  fixture.step(0);
  const before = canvas.log.draws.length;
  const firstDraw = canvas.log.draws.at(-1);
  fixture.step(16);
  fixture.step(32);
  check('desktop respects the drawing interval with one queued frame', () => {
    assert.equal(canvas.log.draws.length, before);
    assert.equal(frames.size, 1);
  });
  fixture.step(48);
  check('two adjacent hatching phases share the same fixed portrait bounds', () => {
    const [a, b] = canvas.log.draws.slice(-2);
    assert.deepEqual(a.args, firstDraw.args);
    assert.notEqual(a.args[1], b.args[1]);
    assert.deepEqual(a.args.slice(-4), [0, 0, 200, 250]);
    assert.deepEqual(b.args.slice(-4), a.args.slice(-4));
    assert.equal(a.alpha + b.alpha, 1);
    assert.equal(b.mode, 'lighter');
    assert.equal(sample.log.samples, 1);
    assert.equal(atlas.log.masks.length, portraitPatternFrames);
    assert.ok(atlas.width <= 2048 && atlas.height <= 2048);
  });

  const pending = [...frames.keys()];
  fixture.emit(document, 'portfolio:themecontrol');
  fixture.recolor('rgb(43, 31, 49)');
  check('theme changes tint the active phase without rebuilding the atlas or resetting motion', () => {
    assert.equal(sample.log.samples, 1);
    assert.equal(atlas.log.masks.length, portraitPatternFrames);
    assert.deepEqual(canvas.log.fills.at(-1), ['source-in', 'rgb(43, 31, 49)']);
    assert.deepEqual([...frames.keys()], pending);
  });

  document.documentElement.dataset.galleryMoving = 'true';
  fixture.emit(document, 'portfolio:gallerymotion');
  check('gallery motion suspends the portrait', () => assert.equal(frames.size, 0));
  document.documentElement.dataset.galleryMoving = 'false';
  fixture.emit(document, 'portfolio:sectionstart');
  check('section transitions suspend the portrait', () => assert.equal(frames.size, 0));
  fixture.emit(document, 'portfolio:sectionsettled');
  check('a settled section resumes a single owner', () => assert.equal(frames.size, 1));

  dialog.open = true;
  observers[2].callback([{ attributeName: 'open' }]);
  check('project dialogs suspend the portrait', () => assert.equal(frames.size, 0));
  dialog.open = false;
  observers[2].callback([{ attributeName: 'open' }]);
  fixture.step(100);
  const lastDraw = canvas.log.draws.at(-1);
  document.hidden = true;
  fixture.emit(document, 'visibilitychange');
  check('hidden documents cancel queued work', () => assert.equal(frames.size, 0));
  document.hidden = false;
  fixture.emit(document, 'visibilitychange');
  fixture.step(100000);
  check('restoring visibility preserves the phase without a jump', () => {
    assert.deepEqual(canvas.log.draws.at(-1), lastDraw);
  });

  observers[0].callback([{ isIntersecting: false }]);
  fixture.emit(window, 'pagehide');
  fixture.emit(window, 'pageshow');
  check('offscreen restoration keeps the portrait suspended', () => assert.equal(frames.size, 0));
  observers[0].callback([{ isIntersecting: true }]);
  fixture.emit(window, 'blur');
  check('window blur alone keeps a visible portrait moving', () => assert.equal(frames.size, 1));

  const reduced = queries.get('(prefers-reduced-motion: reduce)');
  const forced = queries.get('(forced-colors: active)');
  reduced.matches = true;
  fixture.emit(reduced, 'change');
  check('reduced motion paints the first hatching phase at full opacity', () => {
    assert.equal(frames.size, 0);
    assert.deepEqual(canvas.log.draws.at(-1).args, firstDraw.args);
    assert.equal(canvas.log.draws.at(-1).alpha, 1);
  });
  reduced.matches = false;
  fixture.emit(reduced, 'change');
  forced.matches = true;
  fixture.emit(forced, 'change');
  check('forced colors retain the fixed print', () => {
    assert.equal(frames.size, 0);
    assert.deepEqual(canvas.log.draws.at(-1).args, firstDraw.args);
    assert.equal(canvas.log.draws.at(-1).alpha, 1);
  });
  forced.matches = false;
  fixture.emit(forced, 'change');

  canvas.clientWidth = 56;
  canvas.clientHeight = 70;
  observers[1].callback();
  check('mobile uses a smaller visible raster while reusing the source masks', () => {
    assert.deepEqual([canvas.width, canvas.height], [112, 140]);
    assert.equal(sample.log.samples, 1);
    assert.equal(atlas.log.masks.length, portraitPatternFrames);
    assert.equal(canvas.getContext().imageSmoothingEnabled, true);
  });
  fixture.step(100100);
  const mobile = canvas.log.draws.length;
  fixture.step(100148);
  check('mobile skips short intervals with one owner', () => {
    assert.equal(canvas.log.draws.length, mobile);
    assert.equal(frames.size, 1);
  });
  fixture.step(100160);
  assert.ok(canvas.log.draws.length > mobile);
  cleanup();
  cleanup();
  abort.abort();
  const total = canvas.log.draws.length;
  fixture.emit(window, 'resize');
  check('cleanup releases frame, observers, listeners and all canvas caches', () => {
    assert.equal(frames.size, 0);
    assert.ok(observers.every(observer => observer.disconnected));
    assert.ok(surfaces.slice(1).every(layer => layer.width === 1 && layer.height === 1));
    assert.equal(canvas.log.draws.length, total);
  });
}

{
  let release;
  const fixture = setup({ gate: new Promise(resolve => { release = resolve; }) });
  const pending = initFigure(fixture.canvas, fixture.abort.signal);
  fixture.abort.abort();
  release();
  await pending;
  check('abort during decode installs no stale observers or frames', () => {
    assert.equal(fixture.frames.size, 0);
    assert.equal(fixture.observers.length, 0);
  });
}

{
  const fixture = setup({ context: false });
  await initFigure(fixture.canvas, fixture.abort.signal);
  check('missing canvas context resolves readiness immediately', () => {
    assert.equal(fixture.images, 0);
    assert.equal(fixture.frames.size, 0);
  });
}

{
  const fixture = setup({ badSamples: true });
  await initFigure(fixture.canvas, fixture.abort.signal);
  check('unreadable source pixels leave the studio ground and no animation', () => {
    assert.equal(fixture.canvas.log.draws.length, 0);
    assert.equal(fixture.frames.size, 0);
  });
}

console.log(`${passed.length} portrait engraving checks passed`);
