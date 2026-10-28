// Actual navigation/reveal/header modules with controllable native animations.
// These fixtures verify interruption and scheduling, not rendered-device motion.
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { initSectionNavigation } from '../src/section-navigation.js';
const passed = [], check = (name, test) => { test(); passed.push(name); };
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
const emit = (target, type) => target.dispatchEvent(new Event(type));

function fixture({ width = 390, source = 'home', reduced = false, noWaapi = false } = {}) {
  const abort = new AbortController(); setMaxListeners(0, abort.signal);
  const jobs = [], events = [];
  class Element extends EventTarget {
    id = ''; className = ''; dataset = {}; attrs = new Map(); style = {}; hidden = false; inert = false; children = [];
    textContent = ''; offsetLeft = 0; offsetWidth = 60;
    ownerDocument = { timeline: { currentTime: 50 } };
    constructor(name) { super(); this.name = name; if (noWaapi) this.animate = undefined; }
    setAttribute(key, value) { this.attrs.set(key, value); }
    append(...nodes) { for (const child of nodes) if (typeof child !== 'string') { child.parent = this; this.children.push(child); } }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    querySelectorAll(selector) {
      const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
      if (selector === '*') return all;
      if (selector === '.section-word') return all.filter(node => node.className === 'section-word');
      if (selector === '.tab-letter') return all.filter(node => node.className === 'tab-letter');
      return [];
    }
    matches() { return this.id === 'about-statement'; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30, bottom: 30 }; }
    focus() { document.activeElement = this; }
    animate(frames, options) {
      let resolve, reject;
      const job = { element: this, frames, options, cancelled: false, resolved: false,
        finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
        finish() { if (!this.cancelled && !this.resolved) { this.resolved = true; resolve(); } },
        cancel() { if (!this.cancelled) { this.cancelled = true; reject(Error('cancelled')); } } };
      jobs.push(job); return job;
    }
  }
  const workspace = new Element('workspace'), marker = new Element('marker'), footer = new Element('footer');
  const header = new Element('header'), photo = new Element('photo'), name = new Element('name'), meta = new Element('meta');
  workspace.dataset.view = source; workspace.scrollTo = () => {};
  const panels = ['home', 'projects', 'more'].map(key => {
    const panel = new Element(key); panel.id = `panel-${key}`;
    const groups = key === 'projects' ? [] : Array.from({ length: key === 'more' ? 4 : 1 }, (_, index) => {
      const group = new Element(`${key}-group-${index}`); group.textContent = index ? 'A paragraph of actual About copy.' : 'Make things with care';
      if (key === 'more' && index === 0) group.id = 'about-statement';
      // About's final viewport is changing under the header FLIP. Deliberately
      // start its groups below the viewport to reproduce the old early filter.
      group.getBoundingClientRect = () => ({ left: 22, top: key === 'more' ? window.innerHeight + 24 : 300, bottom: key === 'more' ? window.innerHeight + 80 : 360, width: 300, height: 56 });
      panel.append(group); return group;
    });
    const gallery = key === 'projects' ? new Element('enhanced-gallery') : null;
    panel.groups = groups;
    panel.querySelectorAll = selector => selector === '.featured-preview, .project-image-button' ? [] : groups;
    panel.querySelector = selector => selector === '.loop-gallery[data-enhanced=true]' ? gallery : null;
    return panel;
  });
  const tabs = ['home', 'projects', 'more'].map((key, index) => {
    const tab = new Element(`tab-${key}`), label = new Element(`label-${key}`); tab.dataset.tab = key;
    label.textContent = key; tab.offsetLeft = index * 100; tab.offsetWidth = 100; tab.append(label);
    tab.querySelector = () => label; return tab;
  });
  const geometry = key => {
    const compact = workspace.dataset.view === 'more';
    const boxes = compact ? { header: [22, 12, 346, 134], photo: [22, 20, 84, 105], name: [126, 40, 190, 40], meta: [126, 86, 160, 20] }
      : { header: [22, 12, 346, 248], photo: [144, 20, 102, 127], name: [89, 167, 212, 48], meta: [110, 218, 170, 22] };
    const [left, top, width, height] = boxes[key]; return { left, top, width, height, bottom: top + height };
  };
  header.querySelector = selector => ({ '.figure-wrap': photo, '.identity h1': name, '.identity-meta': meta })[selector];
  for (const [key, element] of Object.entries({ header, photo, name, meta })) element.getBoundingClientRect = () => geometry(key);
  globalThis.window = new EventTarget(); window.innerWidth = width; window.innerHeight = 780; window.scrollY = 0;
  window.scrollTo = () => { window.scrollY = 0; };
  globalThis.document = new EventTarget(); document.hidden = false; document.documentElement = { dataset: { entry: 'ready' } };
  document.querySelector = selector => ({ '.workspace': workspace, '.colophon': footer, '.tab-art-marker': marker, '.profile-sticky': header })[selector] ?? null;
  document.querySelectorAll = selector => selector === '[data-tab]' ? tabs : panels;
  document.createElement = () => new Element('generated-span');
  document.createRange = () => ({ selectNodeContents() {}, getBoundingClientRect: () => geometry('name') });
  const media = { desktop: new EventTarget(), reduced: new EventTarget() }; media.desktop.matches = width > 800; media.reduced.matches = reduced;
  globalThis.matchMedia = query => query.includes('min-width') ? media.desktop : media.reduced;
  globalThis.getComputedStyle = () => ({ opacity: '1', transform: 'none', clipPath: 'none' });
  globalThis.location = { hash: `#${source}` }; globalThis.history = { pushState(_state, _title, hash) { location.hash = hash; } };
  document.addEventListener('portfolio:sectionstart', event => events.push({ type: 'start', detail: event.detail }));
  document.addEventListener('portfolio:sectionsettled', () => events.push({ type: 'settled' }));
  const navigation = initSectionNavigation(abort.signal);
  const finishPanel = panel => jobs.filter(job => panel.contains(job.element)).forEach(job => job.finish());
  const active = () => jobs.filter(job => !job.cancelled && !job.resolved);
  const finish = async () => { active().forEach(job => job.finish()); await flush(); };
  return { navigation, abort, jobs, events, panels, header, workspace, media, finish, finishPanel, active };
}

for (const width of [360, 390, 768]) {
  const f = fixture({ width }), [home, , about] = f.panels;
  const change = f.navigation.selectTab('more'); f.finishPanel(home); await flush(); await change;
  const incoming = f.active().filter(job => about.contains(job.element));
  const headerJobs = f.active().filter(job => ['header', 'photo', 'name', 'meta'].includes(job.element.name));
  check(`${width}px About prepares every late-visible paragraph before its first paint`, () => {
    assert.equal(about.hidden, false); assert.equal(home.hidden, true);
    assert.ok(about.groups.every(group => incoming.some(job => group.contains(job.element))));
    assert.ok(incoming.every(job => job.options.duration >= 520)); assert.equal(headerJobs.length, 4);
  });
  const settled = f.events.filter(event => event.type === 'settled').length;
  for (const delta of [-70, 18, 40, -5]) { window.innerHeight += delta; emit(window, 'resize'); await flush(); }
  check(`${width}px mobile height-only resizes retain the exact content and header effects`, () => {
    assert.ok(incoming.every(job => !job.cancelled)); assert.ok(headerJobs.every(job => !job.cancelled));
    assert.equal(f.workspace.attrs.get('aria-busy'), 'true');
    assert.equal(f.events.filter(event => event.type === 'settled').length, settled);
  });
  emit(window, 'resize'); await flush();
  check(`${width}px duplicate resize events do not settle the transition early`, () => assert.ok(incoming.every(job => !job.cancelled)));
  await f.finish();
  check(`${width}px the complete About reveal settles and restores interaction`, () => {
    assert.equal(f.workspace.attrs.get('aria-busy'), 'false'); assert.equal(about.inert, false);
    assert.ok(headerJobs.every(job => job.cancelled)); assert.equal(f.active().length, 0);
    assert.equal(f.events.filter(event => event.type === 'settled').length, settled + 1);
  });
  f.abort.abort();
}
{
  const f = fixture({ source: 'projects' }), [, projects, about] = f.panels;
  let release;
  const departure = new Promise(resolve => { release = resolve; });
  document.addEventListener('portfolio:sectionstart', event => {
    if (!event.detail.entering && event.detail.view === 'projects') event.detail.waitUntil(departure);
  });
  const change = f.navigation.selectTab('more'); await flush(); window.innerHeight -= 90; emit(window, 'resize'); await flush();
  check('a phone height resize cannot bypass the pending one-by-one Projects departure', () => {
    assert.equal(projects.hidden, false); assert.equal(about.hidden, true); assert.equal(f.workspace.attrs.get('aria-busy'), 'true');
  });
  release(); await flush(); await change;
  const incoming = f.active().filter(job => about.contains(job.element)); window.innerHeight += 60; emit(window, 'resize'); await flush();
  check('Projects to About retains the full reveal after the last project leaves', () => {
    assert.equal(projects.hidden, true); assert.equal(about.hidden, false); assert.ok(incoming.length > 3); assert.ok(incoming.every(job => !job.cancelled));
  });
  await f.finish(); f.abort.abort();
}
{
  const f = fixture(), [home, , about] = f.panels;
  const change = f.navigation.selectTab('more'); f.finishPanel(home); await flush(); await change;
  const incoming = f.active().filter(job => about.contains(job.element)); window.innerWidth += 24; emit(window, 'resize'); await flush();
  check('a real mobile width/orientation change still commits responsive geometry safely', () => {
    assert.equal(about.hidden, false); assert.equal(f.workspace.attrs.get('aria-busy'), 'false'); assert.ok(incoming.every(job => job.cancelled)); assert.equal(f.active().length, 0);
  }); f.abort.abort();
}
{
  const f = fixture({ width: 1280 }), [home, , about] = f.panels;
  const change = f.navigation.selectTab('more'); f.finishPanel(home); await flush(); await change;
  check('desktop retains viewport filtering for About instead of animating offscreen text', () => assert.ok(!f.active().some(job => about.groups.some(group => group.contains(job.element)))));
  window.innerHeight -= 80; emit(window, 'resize'); await flush();
  check('real desktop height resizing still settles the active section safely', () => assert.equal(f.workspace.attrs.get('aria-busy'), 'false'));
  f.abort.abort();
}
{
  const f = fixture(), [home, , about] = f.panels;
  const forward = f.navigation.selectTab('more'); f.finishPanel(home); await flush(); await forward;
  const obsolete = f.active().filter(job => about.contains(job.element));
  const reverse = f.navigation.selectTab('home'); f.finishPanel(about); await flush(); await reverse;
  check('a rapid reverse cancels the old About entry without settling the new entry', () => {
    assert.equal(about.hidden, true); assert.equal(home.hidden, false); assert.ok(obsolete.every(job => job.cancelled)); assert.equal(f.workspace.attrs.get('aria-busy'), 'true');
  });
  await f.finish();
  check('the latest reverse request alone restores interaction at its destination', () => { assert.equal(f.workspace.dataset.view, 'home'); assert.equal(f.workspace.attrs.get('aria-busy'), 'false'); });
  f.abort.abort();
}
for (const options of [{ reduced: true }, { noWaapi: true }]) {
  const f = fixture(options); await f.navigation.selectTab('more'); await flush();
  check(`${options.reduced ? 'reduced motion' : 'missing native animation'} keeps immediate accessible navigation`, () => {
    assert.equal(f.panels[2].hidden, false); assert.equal(f.panels[2].inert, false); assert.equal(f.workspace.attrs.get('aria-busy'), 'false'); assert.equal(f.jobs.length, 0);
  }); f.abort.abort();
}
{
  const f = fixture(), [home, , about] = f.panels;
  const change = f.navigation.selectTab('more'); f.finishPanel(home); await flush(); await change;
  document.hidden = true; emit(document, 'visibilitychange'); await flush();
  check('hidden documents settle the current panel and release all effects', () => { assert.equal(about.hidden, false); assert.equal(about.inert, false); assert.equal(f.active().length, 0); });
  document.hidden = false; await f.navigation.selectTab('home', { animate: false });
  const next = f.navigation.selectTab('more'); f.finishPanel(home); await flush(); await next; f.abort.abort(); await flush();
  check('abort releases every pending native effect without an obsolete transition callback', () => assert.equal(f.active().length, 0));
}
console.log(JSON.stringify({ mode: 'Actual navigation/header/reveal event fixtures; not browser-rendered motion', passed: passed.length, checks: passed }, null, 2));
