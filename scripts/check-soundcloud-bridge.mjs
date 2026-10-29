// Native message events and the real application controller, without audio/network.
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { createSoundCloudWidget } from '../src/soundcloud-widget-bridge.js';
import { initSoundCloudPlayer } from '../src/soundcloud-player.js';
const checks = [], check = (name, test) => { test(); checks.push(name); };
const ORIGIN = 'https://w.soundcloud.com';
globalThis.window = new EventTarget();
let sent = [], playEvents = 0, readyEvents = 0;
const frame = { src: `${ORIGIN}/player/`, contentWindow: { postMessage: (data, origin) => { sent.push({ data: JSON.parse(data), origin }); } } };
function message(target, method, value, { origin = ORIGIN, source = target.contentWindow, raw } = {}) {
  const event = new Event('message');
  Object.defineProperties(event, { origin: { value: origin }, source: { value: source }, data: { value: raw === undefined ? JSON.stringify({ method, value }) : raw } });
  window.dispatchEvent(event);
}
const widget = createSoundCloudWidget(frame);
widget.bind('ready', () => readyEvents++); widget.bind('play', () => playEvents++);
check('bridge performs no network or commands before iframe readiness', () => assert.equal(sent.length, 0));
message(frame, 'ready', undefined, { origin: 'https://attacker.test' });
message(frame, 'ready', undefined, { source: {} });
message(frame, 'ready', undefined, { raw: 'invalid JSON' });
check('messages from other origins/windows and malformed payloads are ignored', () => { assert.equal(readyEvents, 0); assert.equal(sent.length, 0); });
message(frame, 'ready'); message(frame, 'ready');
check('READY is delivered once and event subscriptions use an exact target origin', () => {
  assert.equal(readyEvents, 1); assert.deepEqual(sent, [{ data: { method: 'addEventListener', value: 'play' }, origin: ORIGIN }]);
});
sent = []; widget.play(); widget.pause(); widget.skip(2); widget.seekTo(0); widget.setVolume(0); widget.setVolume(100);
check('play/pause/next-index/seek commands match the official message format', () => {
  assert.deepEqual(sent.map(x => x.data), [{ method: 'play' }, { method: 'pause' }, { method: 'skip', value: 2 }, { method: 'seekTo', value: 0 }, { method: 'setVolume', value: 0 }, { method: 'setVolume', value: 100 }]);
});
sent = []; let sounds = null, second = null;
widget.getSounds(value => { sounds = value; }); widget.getSounds(value => { second = value; });
message(frame, 'getSounds', [{ title: 'Protocol fixture' }]);
check('concurrent getters share one request and resolve once from the iframe response', () => {
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].data, { method: 'getSounds', value: null });
  assert.deepEqual(sounds, [{ title: 'Protocol fixture' }]); assert.deepEqual(second, sounds);
});
message(frame, 'play'); widget.unbind('play'); message(frame, 'play');
check('event unbinding stops application callbacks and removes the remote subscription', () => {
  assert.equal(playEvents, 1); assert.deepEqual(sent.at(-1).data, { method: 'removeEventListener', value: 'play' });
});
let lateReady = 0; widget.bind('ready', () => lateReady++); await Promise.resolve();
check('late READY binding works without a polling loop', () => assert.equal(lateReady, 1));
widget.getCurrentSoundIndex(() => { throw new Error('must not resolve after destroy'); }); widget.destroy();
const count = sent.length; message(frame, 'getCurrentSoundIndex', 0); widget.play(); message(frame, 'ready');
check('destroy removes message handling, pending getters and late commands', () => assert.equal(sent.length, count));
assert.throws(() => createSoundCloudWidget({ src: 'https://attacker.test/player' }), /origin/);

// Exercise the actual default controller and local bridge together. The mock
// child only speaks the same JSON postMessage protocol as the real iframe.
class Element extends EventTarget {
  dataset = {}; children = []; attributes = {}; textContent = ''; disabled = false;
  setAttribute(key, value) { this.attributes[key] = value; }
  append(child) { child.parent = this; this.children.push(child); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
}
const root = new Element(), toggle = new Element(), next = new Element(), host = new Element();
const title = new Element(), credit = new Element(), status = new Element();
root.querySelector = selector => ({ '[data-music-toggle]': toggle, '[data-music-next]': next,
  '[data-music-host]': host, '[data-music-track]': title, '[data-music-credit]': credit, '[data-music-status]': status })[selector];
globalThis.document = new EventTarget(); document.querySelector = () => root;
let remoteFrame, index = 0, scriptRequests = 0;
const tracks = [
  { title: 'Protocol track A', permalink_url: 'https://soundcloud.com/blockcoreonline/protocol-a' },
  { title: 'Protocol track B', permalink_url: 'https://soundcloud.com/blockcoreonline/protocol-b' }
];
const providerSubscriptions = new Set();
const providerEvent = (method, value) => queueMicrotask(() => { if (providerSubscriptions.has(method)) message(remoteFrame, method, value); });
document.createElement = tag => {
  if (tag === 'script') { scriptRequests++; throw new Error('External SDK intentionally blocked'); }
  const element = new Element(); remoteFrame = element;
  element.contentWindow = { postMessage(data, origin) {
    assert.equal(origin, ORIGIN); const { method, value } = JSON.parse(data);
    if (method === 'addEventListener') providerSubscriptions.add(value);
    else if (method === 'removeEventListener') providerSubscriptions.delete(value);
    else if (method === 'getSounds') queueMicrotask(() => message(element, method, tracks));
    else if (method === 'getCurrentSoundIndex') queueMicrotask(() => message(element, method, index));
    else if (method === 'play') providerEvent('play');
    else if (method === 'pause') providerEvent('pause');
    else if (method === 'skip') { index = value; providerEvent('pause'); }
  } };
  return element;
};
host.append = child => { Element.prototype.append.call(host, child); queueMicrotask(() => message(child, 'ready')); };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const abort = new AbortController(); setMaxListeners(0, abort.signal);
let animation = false;
initSoundCloudPlayer({ signal: abort.signal, onPlaybackChange: value => { animation = value; } });
toggle.dispatchEvent(new Event('click')); await flush();
check('actual player reaches playing through the local bridge while external script creation is blocked', () => {
  assert.equal(scriptRequests, 0); assert.equal(root.dataset.state, 'playing'); assert.equal(animation, true);
  assert.equal(title.textContent, 'Protocol track A'); assert.equal(host.children.length, 1);
});
next.dispatchEvent(new Event('click')); await flush();
check('actual Next changes the provider index, title and playback through postMessage', () => {
  assert.equal(index, 1); assert.equal(title.textContent, 'Protocol track B'); assert.equal(root.dataset.state, 'playing');
});
toggle.dispatchEvent(new Event('click')); await flush();
check('actual Pause stops both audio intent and spectrum through postMessage', () => {
  assert.equal(root.dataset.state, 'paused'); assert.equal(animation, false);
});
abort.abort(); await flush();
check('controller teardown destroys the real bridge and removes the iframe', () => {
  assert.equal(host.children.length, 0); assert.equal(providerSubscriptions.size, 0); assert.equal(animation, false);
});
console.log(JSON.stringify({ mode: 'Local bridge and controller protocol integration; no audible browser playback claim', passed: checks.length, checks }, null, 2));
