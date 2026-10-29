// Widget protocol/lifecycle fixtures. No network, real tracks or audible playback.
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import { artistTracks, soundCloudEmbedURL, loadSoundCloudAPI, initSoundCloudPlayer } from '../src/soundcloud-player.js';
const checks = [], check = (name, test) => { test(); checks.push(name); };
const fixtureSounds = [
  { title: 'Fixture A', permalink_url: 'https://soundcloud.com/blockcoreonline/fixture-a', streamable: true },
  { title: 'Another artist', permalink_url: 'https://soundcloud.com/another-artist/fixture' },
  { title: 'Blocked fixture', permalink_url: 'https://soundcloud.com/blockcoreonline/blocked', access: 'blocked' },
  { title: 'Fixture B', permalink_url: 'https://soundcloud.com/blockcoreonline/fixture-b', streamable: true },
  { title: 'Blocked API fixture', permalink_url: 'https://soundcloud.com/blockcoreonline/not-streamable', streamable: false, access: 'blocked' }
];
check('queue accepts only this artist, preserves widget indices and rejects blocked tracks', () => {
  assert.deepEqual(artistTracks(fixtureSounds).map(t => t.widgetIndex), [0, 3]);
  assert.deepEqual(artistTracks([{ permalink_url: 'javascript:alert(1)' }, { permalink_url: 'https://soundcloud.com.attacker.test/blockcoreonline/track' }]), []);
  assert.deepEqual(artistTracks(null), []);
});
check('legacy HTTP permalinks and widget-playable API-disabled tracks do not empty the queue', () => {
  const sounds = artistTracks([
    { title: 'Legacy fixture', permalink_url: 'http://soundcloud.com/blockcoreonline/legacy', streamable: false },
    { title: 'Renamed fixture', permalink_url: 'https://soundcloud.com/renamed-profile/track', user: { id: 1167960067 } }
  ]);
  assert.equal(sounds.length, 2);
  assert.equal(sounds[0].url, 'https://soundcloud.com/blockcoreonline/legacy');
});
check('canonical oEmbed user resource disables unsolicited autoplay and uses no client secret', () => {
  const url = new URL(soundCloudEmbedURL());
  assert.equal(url.origin, 'https://w.soundcloud.com');
  assert.equal(url.searchParams.get('url'), 'https://api.soundcloud.com/users/1167960067');
  assert.equal(url.searchParams.get('auto_play'), 'false');
  assert.ok(!url.searchParams.has('client_id') && !url.searchParams.has('client_secret'));
});
class Element extends EventTarget {
  dataset = {}; attributes = {}; children = []; textContent = ''; disabled = false; title = ''; href = '';
  setAttribute(k, v) { this.attributes[k] = v; }
  focus() { document.activeElement = this; }
  append(child) { this.children.push(child); child.parent = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
}
const root = new Element(), toggle = new Element(), next = new Element(), host = new Element();
const title = new Element(), credit = new Element(), status = new Element(), head = new Element();
root.querySelector = selector => ({ '[data-music-toggle]': toggle, '[data-music-next]': next,
  '[data-music-host]': host, '[data-music-track]': title, '[data-music-credit]': credit, '[data-music-status]': status })[selector];
globalThis.document = new EventTarget(); document.head = head;
document.querySelector = selector => selector === '[data-music-player]' ? root : head.children.find(c => c.dataset.soundcloudApi);
document.createElement = tag => { const e = new Element(); e.tagName = tag; return e; };
globalThis.window = new EventTarget();
let timerID = 0; const timers = new Map();
globalThis.setTimeout = (fn, ms) => { timers.set(++timerID, { fn, ms }); return timerID; };
globalThis.clearTimeout = id => timers.delete(id);
function fireTimer(ms) { const item = [...timers].find(([, t]) => t.ms === ms); assert.ok(item, `timer ${ms} exists`); timers.delete(item[0]); item[1].fn(); }
const emit = (target, type) => target.dispatchEvent(new Event(type));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const players = [];
function Widget(frame) {
  const handlers = new Map();
  const player = { frame, handlers, index: 0, playCalls: 0, pauseCalls: 0, skips: [], sounds: fixtureSounds,
    bind(name, fn) { handlers.set(name, fn); }, unbind(name) { handlers.delete(name); },
    play() { this.playCalls++; }, pause() { this.pauseCalls++; handlers.get('pause')?.(); },
    skip(index) { this.index = index; this.skips.push(index); handlers.get('pause')?.(); }, seekTo() {},
    getSounds(fn) { if (this.deferSounds) this.soundsCallback = fn; else fn(this.sounds); },
    getCurrentSoundIndex(fn) { if (this.deferIndex) this.indexCallback = fn; else fn(this.index); },
    fire(name) { handlers.get(name)?.(); }
  };
  players.push(player); return player;
}
Widget.Events = { READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish', ERROR: 'error' };
const loadAPI = async () => Widget;
const changes = [];
const abort = new AbortController(); setMaxListeners(0, abort.signal);
initSoundCloudPlayer({ signal: abort.signal, onPlaybackChange: active => changes.push(active), loadAPI });
check('initial page has two idle controls, no iframe/script and a stopped spectrum', () => {
  assert.equal(host.children.length, 0); assert.equal(head.children.length, 0);
  assert.equal(root.dataset.state, 'idle'); assert.equal(next.disabled, true); assert.equal(changes.at(-1), false);
});
emit(toggle, 'click'); await flush(); let player = players.at(-1);
check('first Play loads one official iframe without pretending audio is already playing', () => {
  assert.equal(host.children.length, 1); assert.equal(root.dataset.state, 'loading');
  assert.equal(changes.at(-1), false); assert.equal(player.playCalls, 0);
  assert.equal(host.children[0].attributes.allow, 'autoplay; encrypted-media');
});
emit(toggle, 'click'); player.fire('pause'); player.fire('ready');
check('cancel during loading never starts sound when provider readiness arrives', () => {
  assert.equal(player.playCalls, 0); assert.equal(root.dataset.state, 'paused'); assert.equal(next.disabled, false);
});
emit(toggle, 'click'); player.fire('play');
check('confirmed PLAY updates track attribution, button and spectrum together', () => {
  assert.equal(root.dataset.state, 'playing'); assert.equal(toggle.attributes['aria-pressed'], 'true');
  assert.equal(changes.at(-1), true); assert.equal(title.textContent, 'Fixture A');
  assert.equal(credit.href, fixtureSounds[0].permalink_url);
});
emit(next, 'click');
check('Next skips disallowed tracks and remains ready through the transition PAUSE', () => {
  assert.equal(player.index, 3); assert.equal(root.dataset.state, 'loading'); assert.equal(changes.at(-1), false);
  assert.equal(toggle.attributes['aria-pressed'], 'true');
});
player.fire('play');
check('new track title is provider metadata rendered as text', () => {
  assert.equal(title.textContent, 'Fixture B'); assert.equal(credit.href, fixtureSounds[3].permalink_url);
});
player.fire('pause'); player.fire('finish'); player.fire('play');
check('track completion wraps the artist queue without advancing twice', () => {
  assert.equal(player.index, 0); assert.equal(player.skips.at(-1), 0); assert.equal(title.textContent, 'Fixture A');
});
player.fire('error');
check('a provider-rejected track advances to another artist track', () => {
  assert.equal(player.index, 3); assert.equal(root.dataset.state, 'loading');
});
player.fire('error');
check('a fully rejected queue stops after one bounded pass', () => {
  assert.equal(root.dataset.state, 'error'); assert.equal(host.children.length, 0);
});
emit(toggle, 'click'); await flush(); player = players.at(-1); player.fire('ready'); player.fire('play');
player.deferIndex = true; player.fire('play'); const staleIndex = player.indexCallback;
emit(next, 'click'); emit(next, 'click'); staleIndex(3); player.deferIndex = false; player.fire('play');
check('rapid Next keeps the latest target and obsolete metadata cannot roll it back', () => {
  assert.equal(player.index, 0); assert.equal(title.textContent, 'Fixture A'); assert.equal(root.dataset.state, 'playing');
});
emit(toggle, 'click');
check('Pause silences provider, freezes spectrum and updates accessible state', () => {
  assert.equal(root.dataset.state, 'paused'); assert.equal(changes.at(-1), false);
  assert.equal(toggle.attributes['aria-pressed'], 'false'); assert.ok(player.pauseCalls > 0);
});
const stoppedIndex = player.index; player.fire('finish');
check('a late finish after explicit Pause cannot restart playback', () => {
  assert.equal(root.dataset.state, 'paused'); assert.equal(player.index, stoppedIndex);
});
emit(toggle, 'click'); fireTimer(8000);
check('autoplay denial returns to a usable Play state instead of a phantom playing state', () => {
  assert.equal(root.dataset.state, 'paused'); assert.equal(changes.at(-1), false);
  assert.equal(toggle.attributes['aria-pressed'], 'false'); assert.match(status.textContent, /Tekan Play/);
  assert.equal(root.dataset.nativePlayer, 'true'); assert.equal(host.attributes['aria-hidden'], 'false');
});
emit(toggle, 'click'); player.fire('play'); emit(document, 'portfolio:musicpause');
check('spectrum Escape request pauses actual audio', () => assert.equal(root.dataset.state, 'paused'));
emit(toggle, 'click'); player.fire('play'); emit(document, 'portfolio:sectionstart');
check('tab navigation does not recreate the source or interrupt audio', () => {
  assert.equal(host.children.length, 1); assert.equal(root.dataset.state, 'playing');
});
emit(window, 'pagehide');
check('page-cache departure pauses audio and does not autoplay on restore', () => {
  assert.equal(root.dataset.state, 'paused'); emit(window, 'pageshow'); assert.equal(root.dataset.state, 'paused');
});
const obsoleteError = player.handlers.get('error'), obsoletePlay = player.handlers.get('play'); player.fire('error');
check('provider errors remove the broken iframe and allow explicit retry', () => {
  assert.equal(root.dataset.state, 'error'); assert.equal(host.children.length, 0); assert.equal(next.disabled, true);
});
emit(toggle, 'click'); await flush(); player = players.at(-1); player.fire('pause'); player.fire('ready'); player.fire('play');
obsoleteError(); obsoletePlay();
check('retry owns one new widget and callbacks from its predecessor are ignored', () => {
  assert.equal(root.dataset.state, 'playing'); assert.equal(host.children.length, 1); assert.ok(player.playCalls > 0);
});
const late = player.handlers.get('play'); abort.abort(); late(); emit(toggle, 'click');
check('abort releases the iframe, bindings and timers and ignores late playback', () => {
  assert.equal(host.children.length, 0); assert.equal(player.handlers.size, 0); assert.equal(timers.size, 0);
  assert.equal(changes.at(-1), false); assert.equal(root.dataset.state, 'idle');
});
const emptyAbort = new AbortController(); setMaxListeners(0, emptyAbort.signal);
initSoundCloudPlayer({ signal: emptyAbort.signal, loadAPI }); emit(toggle, 'click'); await flush();
player = players.at(-1); player.sounds = [fixtureSounds[1]]; player.fire('ready');
check('an empty or unavailable artist queue never fabricates songs', () => {
  assert.equal(root.dataset.state, 'error'); assert.equal(next.disabled, true); assert.equal(host.children.length, 0);
}); emptyAbort.abort();
const timeoutAbort = new AbortController(); setMaxListeners(0, timeoutAbort.signal);
initSoundCloudPlayer({ signal: timeoutAbort.signal, loadAPI }); emit(toggle, 'click'); await flush();
const firstFrame = host.children[0], beforeReconnect = players.length;
fireTimer(15000); await flush();
check('initial readiness failure retries exactly once while play is still requested', () => {
  assert.equal(players.length, beforeReconnect + 1); assert.equal(host.children.length, 1);
  assert.notEqual(host.children[0], firstFrame); assert.equal(root.dataset.connectionAttempt, '2');
  assert.equal(root.dataset.state, 'loading');
});
fireTimer(15000);
check('readiness timeout stops waiting UI without cancelling the iframe request', () => {
  assert.equal(root.dataset.state, 'error'); assert.equal(root.dataset.error, 'ready-timeout');
  assert.equal(host.children.length, 1); assert.equal(toggle.attributes['aria-pressed'], 'false');
  assert.equal(root.dataset.nativePlayer, 'true'); assert.equal(host.attributes['aria-hidden'], 'false');
  assert.equal(host.children[0].attributes['aria-hidden'], 'false');
  assert.equal([...timers.values()].filter(t => t.ms === 15000).length, 0);
});
player = players.at(-1); const playsBeforeLateReady = player.playCalls; player.fire('ready');
check('late provider readiness recovers to paused without surprise autoplay', () => {
  assert.equal(root.dataset.state, 'paused'); assert.equal(root.dataset.error, undefined);
  assert.equal(player.playCalls, playsBeforeLateReady); assert.equal(next.disabled, false);
});
player.fire('play');
check('a late PLAY without visitor interaction is still stopped after timeout', () => assert.equal(root.dataset.state, 'paused'));
document.activeElement = player.frame; player.fire('play');
check('native iframe Play can recover audio and hide the fallback after real interaction', () => {
  assert.equal(root.dataset.state, 'playing'); assert.equal(root.dataset.nativePlayer, 'false');
  assert.equal(host.attributes['aria-hidden'], 'true');
  assert.equal(document.activeElement, toggle);
}); timeoutAbort.abort();
const cancelledAbort = new AbortController(); setMaxListeners(0, cancelledAbort.signal);
initSoundCloudPlayer({ signal: cancelledAbort.signal, loadAPI }); emit(toggle, 'click'); await flush();
const countBeforeCancel = players.length; emit(toggle, 'click'); fireTimer(15000); await flush();
check('cancelling while loading prevents automatic reconnect and unsolicited audio', () => {
  assert.equal(players.length, countBeforeCancel); assert.equal(root.dataset.state, 'error');
  assert.equal(toggle.attributes['aria-pressed'], 'false');
}); cancelledAbort.abort();
let resolveAPI;
const delayed = new Promise(resolve => { resolveAPI = resolve; });
const delayedAbort = new AbortController(); setMaxListeners(0, delayedAbort.signal);
initSoundCloudPlayer({ signal: delayedAbort.signal, loadAPI: () => delayed }); emit(toggle, 'click'); await flush();
check('the iframe cannot emit a lost READY while the SDK is still loading', () => {
  assert.equal(host.children.length, 0); assert.equal(root.dataset.state, 'loading');
});
resolveAPI(Widget); await flush(); player = players.at(-1); player.fire('ready');
check('only SDK readiness permits iframe creation and immediate provider readiness is handled', () => {
  assert.equal(host.children.length, 1); assert.ok(player.playCalls > 0);
  assert.equal(new URL(player.frame.src).searchParams.get('url'), 'https://api.soundcloud.com/users/1167960067');
}); delayedAbort.abort();
let resolveObsolete;
const obsoleteAPI = new Promise(resolve => { resolveObsolete = resolve; });
const abandonedAbort = new AbortController(); setMaxListeners(0, abandonedAbort.signal);
initSoundCloudPlayer({ signal: abandonedAbort.signal, loadAPI: () => obsoleteAPI }); emit(toggle, 'click'); abandonedAbort.abort();
resolveObsolete(Widget); await flush();
check('an API response after teardown cannot create an orphan iframe', () => assert.equal(host.children.length, 0));
const unavailableExternalSDK = { Widget() { throw new Error('external SDK must never be used'); } };
window.SC = unavailableExternalSDK;
const localAbort = new AbortController(); const localFactory = await loadSoundCloudAPI(localAbort.signal);
check('the control API is local even when external SDK loading is unavailable', () => {
  assert.equal(typeof localFactory, 'function'); assert.equal(localFactory.Events.READY, 'ready');
  assert.equal(head.children.length, 0); assert.equal(timers.size, 0);
});
const stoppedAPI = new AbortController(); stoppedAPI.abort();
await assert.rejects(loadSoundCloudAPI(stoppedAPI.signal), /aborted/);
check('an aborted API request cannot create scripts or leave timers', () => { assert.equal(head.children.length, 0); assert.equal(timers.size, 0); });
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/soundcloud-player.css', import.meta.url), 'utf8');
check('player has exactly two controls plus linked attribution on desktop and mobile', () => {
  const surface = html.slice(html.indexOf('<section class="music-player"'), html.indexOf('<div class="theme-picker"'));
  assert.equal((surface.match(/<button/g) || []).length, 2);
  assert.match(surface, /soundcloud.com\/blockcoreonline/); assert.match(surface, /alt="SoundCloud"/);
  assert.match(css, /max-width: calc\(100vw - 104px\)/); assert.match(css, /forced-colors/);
  assert.doesNotMatch(html, /<iframe[^>]+w\.soundcloud/);
});
console.log(JSON.stringify({ mode: 'Widget fixtures and source checks; no live SoundCloud playback claim', passed: checks.length, checks }, null, 2));
