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
const root = new Element(), toggle = new Element(), next = new Element(), host = new Element(), previous = new Element(), mute = new Element();
const title = new Element(), credit = new Element(), status = new Element(), head = new Element();
root.querySelector = selector => ({ '[data-music-toggle]': toggle, '[data-music-next]': next, '[data-music-previous]': previous, '[data-music-mute]': mute,
  '[data-music-host]': host, '[data-music-track]': title, '[data-music-credit]': credit, '[data-music-status]': status })[selector];
globalThis.document = new EventTarget(); document.head = head;
document.querySelector = selector => selector === '[data-music-player]' ? root
  : selector === 'link[data-music-preconnect]' ? head.children.find(c => c.dataset.musicPreconnect) : null;
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
    play() { this.playCalls++; }, pause() { this.pauseCalls++; handlers.get('pause')?.(); }, setVolume(value) { this.volume = value; },
    skip(index) { this.index = index; this.skips.push(index); handlers.get('pause')?.(); }, seekTo(value) { this.seek = value; },
    getSounds(fn) { if (this.deferSounds) this.soundsCallback = fn; else fn(this.sounds); },
    getCurrentSoundIndex(fn) { if (this.deferIndex) this.indexCallback = fn; else fn(this.index); },
    getDuration(fn) { this.durationCalls = (this.durationCalls || 0) + 1; if (this.deferDuration) this.durationCallback = fn; else fn(this.duration || 180000); },
    fire(name, value) { handlers.get(name)?.(value); }
  };
  players.push(player); return player;
}
Widget.Events = { READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish', ERROR: 'error', PLAY_PROGRESS: 'playProgress', SEEK: 'seek' };
const loadAPI = async () => Widget;

const changes = [], progress = [], timings = [], published = [];
const manual = signal => initSoundCloudPlayer({ autoplay: false, signal, onPlaybackChange: active => changes.push(active), onProgress: (value, timing) => { progress.push(value); timings.push(timing); }, onTrackChange: track => published.push(track), loadAPI });
const abort = new AbortController(); setMaxListeners(0, abort.signal); manual(abort.signal);
check('manual initialization supports two controls without an iframe before Play', () => {
  assert.equal(host.children.length, 0); assert.equal(root.dataset.state, 'idle'); assert.equal(changes.at(-1), false);
});
emit(toggle, 'pointerenter'); emit(toggle, 'focusin');
check('hover and focus warm only one provider connection', () => { assert.equal(head.children.length, 1); assert.equal(host.children.length, 0); });
emit(toggle, 'click'); await flush(); let player = players.at(-1);
check('Play creates one official iframe without claiming confirmed playback', () => {
  assert.equal(host.children.length, 1); assert.equal(root.dataset.state, 'loading'); assert.equal(player.playCalls, 0);
  assert.equal(player.frame.attributes.allow, 'autoplay; encrypted-media'); assert.equal(player.frame.tabIndex, -1);
});
emit(toggle, 'click'); player.fire('ready'); player.fire('play');
check('Pause during loading rejects late readiness and PLAY', () => { assert.equal(player.playCalls, 0); assert.equal(root.dataset.state, 'paused'); });
emit(toggle, 'click'); player.fire('play');
check('confirmed playback publishes track metadata and audio state', () => {
  assert.equal(root.dataset.state, 'playing'); assert.equal(changes.at(-1), true); assert.equal(credit.href, fixtureSounds[0].permalink_url);
});
emit(mute, 'click');
check('Mute sets volume zero without pausing playback', () => {
  assert.equal(player.volume, 0); assert.equal(root.dataset.state, 'playing'); assert.equal(mute.attributes['aria-label'], 'Unmute music');
});
emit(previous, 'click'); emit(next, 'click');
check('detached legacy Next and Previous have no transport handlers', () => { assert.equal(player.index, 0); assert.equal(player.skips.length, 0); });
player.fire('playProgress', {relativePosition:.25}); player.fire('playProgress', {relativePosition:Infinity});
check('only valid genuine audio progress reaches the visualizer', () => assert.equal(progress.at(-1), .25));
player.fire('playProgress', {relativePosition:.9,currentPosition:45000});
check('exact provider milliseconds override a conflicting relative position', () => {
  assert.equal(progress.at(-1),.25); assert.deepEqual(timings.at(-1),{positionMs:45000,durationMs:180000});
  assert.equal(player.durationCalls,1);
});
player.fire('seek', { currentPosition: 44960 });
check('provider seeks explicitly reset the visual clock', () => {
  assert.deepEqual(timings.at(-1), { positionMs: 44960, durationMs: 180000, seek: true });
});
player.fire('pause'); player.fire('finish'); player.fire('play');
check('track completion automatically advances the allowed queue and retains mute', () => {
  assert.equal(player.index, 3); assert.equal(title.textContent, 'Fixture B'); assert.equal(player.volume, 0); assert.equal(player.seek, 0);
});
emit(mute, 'click');
check('Unmute restores volume without changing the track', () => { assert.equal(player.volume, 100); assert.equal(player.index, 3); assert.equal(mute.attributes['aria-label'], 'Mute music'); });
emit(toggle, 'click'); const index = player.index; player.fire('finish'); player.fire('play');
check('Pause cancels audio intent and rejects late finish and PLAY', () => { assert.equal(root.dataset.state, 'paused'); assert.equal(player.index, index); assert.equal(changes.at(-1), false); });
emit(toggle, 'click'); fireTimer(8000);
check('blocked or slow autoplay offers our Play button without exposing provider navigation', () => {
  assert.equal(root.dataset.state, 'paused'); assert.equal(root.dataset.waiting, 'gesture'); assert.equal(toggle.attributes['aria-label'], 'Play music');
  assert.equal(player.frame.tabIndex, -1); assert.equal(player.frame.attributes['aria-hidden'], 'true'); assert.equal(host.children.length, 1);
});
player.fire('play');
check('a slow provider may still complete the original request after the gesture hint', () => assert.equal(root.dataset.state, 'playing'));
emit(toggle, 'click'); emit(toggle, 'click'); fireTimer(8000);
const sameFrame = player.frame; emit(toggle, 'click'); player.fire('play');
check('a direct Play gesture resumes the same connection', () => { assert.equal(root.dataset.state, 'playing'); assert.equal(root.dataset.waiting, undefined); assert.equal(player.frame, sameFrame); });
player.fire('error'); player.fire('error');
check('provider errors try a bounded queue pass then stop', () => { assert.equal(root.dataset.state, 'error'); assert.equal(host.children.length, 0); });
const obsoletePlay = player.handlers.get('play');
emit(toggle, 'click'); await flush(); player = players.at(-1); player.fire('ready'); player.fire('play'); obsoletePlay?.();
check('Retry creates one widget and ignores callbacks from the predecessor', () => { assert.equal(root.dataset.state, 'playing'); assert.equal(host.children.length, 1); });
emit(window, 'pagehide'); emit(window, 'pageshow');
check('page-cache departure pauses and restore does not restart cancelled audio', () => assert.equal(root.dataset.state, 'paused'));
abort.abort();
check('abort releases the iframe, bindings and timers', () => { assert.equal(host.children.length, 0); assert.equal(player.handlers.size, 0); assert.equal(timers.size, 0); });

// Default app behavior: automatic request after entry, once only, cancellable.
document.documentElement = {dataset:{entry:'loading'}}; document.hidden = false;
const autoAbort = new AbortController(); setMaxListeners(0, autoAbort.signal);
initSoundCloudPlayer({signal:autoAbort.signal, loadAPI}); await flush();
check('default autoplay waits until entry has finished', () => assert.equal(host.children.length, 0));
document.documentElement.dataset.entry = 'ready'; emit(document, 'portfolio:entryready'); await flush(); player = players.at(-1);
check('entry completion starts loading music automatically without any visitor click', () => { assert.equal(host.children.length, 1); assert.equal(toggle.attributes['aria-label'], 'Pause music'); });
const initialAutoFrame = player.frame; emit(document, 'portfolio:entryready'); emit(document, 'visibilitychange'); await flush();
check('entry and visibility notifications never duplicate the autoplay connection', () => { assert.equal(host.children.length, 1); assert.equal(player.frame, initialAutoFrame); });
fireTimer(15000);
check('slow provider readiness preserves the exact autoplay request and Pause intent', () => {
  assert.equal(root.dataset.waiting, 'provider'); assert.equal(host.children[0], initialAutoFrame); assert.equal(toggle.attributes['aria-pressed'], 'true');
});
player.fire('ready');
check('late readiness attempts audible autoplay on the retained widget', () => { assert.equal(player.playCalls, 1); assert.equal(player.volume, 100); });
player.fire('play');
check('only a provider PLAY marks autoplay as playing', () => assert.equal(root.dataset.state, 'playing'));
emit(toggle, 'click'); emit(document, 'visibilitychange'); emit(document, 'portfolio:entryready'); player.fire('play');
check('explicit Pause is never undone by repeated lifecycle or late playback events', () => { assert.equal(root.dataset.state, 'paused'); assert.equal(player.playCalls, 1); });
autoAbort.abort();
const backgroundAbort = new AbortController(); setMaxListeners(0, backgroundAbort.signal); document.hidden = true;
initSoundCloudPlayer({signal:backgroundAbort.signal, loadAPI}); await flush();
check('a page initially hidden postpones its initial autoplay attempt', () => assert.equal(host.children.length, 0));
document.hidden = false; emit(document, 'visibilitychange'); await flush(); player = players.at(-1);
check('the initial autoplay attempt starts once the page becomes visible', () => assert.equal(host.children.length, 1));
emit(toggle, 'click'); player.fire('ready'); player.fire('play');
check('Pause cancels an initial autoplay request while the provider is loading', () => { assert.equal(root.dataset.state, 'paused'); assert.equal(player.playCalls, 0); });
backgroundAbort.abort();

const emptyAbort = new AbortController(); setMaxListeners(0, emptyAbort.signal); manual(emptyAbort.signal); emit(toggle, 'click'); await flush();
player = players.at(-1); player.sounds = [fixtureSounds[1]]; player.fire('ready');
check('an empty artist queue fails without inventing songs', () => { assert.equal(root.dataset.state, 'error'); assert.equal(host.children.length, 0); }); emptyAbort.abort();
const cancelAbort = new AbortController(); setMaxListeners(0, cancelAbort.signal); manual(cancelAbort.signal); emit(toggle, 'click'); await flush(); player = players.at(-1);
const pendingFrame = player.frame; emit(toggle, 'click'); fireTimer(15000); emit(toggle, 'click');
check('cancel and resume before readiness reuse the pending connection', () => { assert.equal(host.children[0], pendingFrame); assert.equal(root.dataset.state, 'loading'); });
player.fire('ready'); player.fire('play'); cancelAbort.abort();
let resolveAPI; const delayed = new Promise(resolve => {resolveAPI = resolve;});
const delayedAbort = new AbortController(); setMaxListeners(0, delayedAbort.signal);
initSoundCloudPlayer({autoplay:false, signal:delayedAbort.signal, loadAPI:()=>delayed}); emit(toggle, 'click'); await flush();
check('the iframe is not appended before its local controller is ready', () => assert.equal(host.children.length, 0));
delayedAbort.abort(); resolveAPI(Widget); await flush();
check('an aborted controller load cannot create an orphan iframe', () => assert.equal(host.children.length, 0));
const localAbort = new AbortController(); window.SC = {Widget(){throw Error('external SDK forbidden');}};
check('the default control factory is bundled locally', () => assert.equal(typeof loadSoundCloudAPI, 'function'));
assert.equal(typeof await loadSoundCloudAPI(localAbort.signal), 'function'); localAbort.abort(); await assert.rejects(loadSoundCloudAPI(localAbort.signal), /aborted/);
// Exercise the real exclusion policy across multiple complete queue rounds.
const rotationAbort = new AbortController(); setMaxListeners(0, rotationAbort.signal);
manual(rotationAbort.signal); emit(toggle, 'click'); await flush(); player = players.at(-1);
player.sounds = [
  {title:'04:59AM',permalink_url:'https://soundcloud.com/blockcoreonline/04-59am'},
  {title:'Former second track',permalink_url:'https://soundcloud.com/blockcoreonline/second'},
  {title:'Third track',permalink_url:'https://soundcloud.com/blockcoreonline/third'},
  {title:'Fourth track',permalink_url:'https://soundcloud.com/blockcoreonline/fourth'}
];
player.fire('ready'); player.fire('play');
check('the removed first song is absent and startup selects the former second track', () => {
  assert.equal(player.index, 1); assert.equal(title.textContent, 'Former second track');
  assert.deepEqual(artistTracks(player.sounds).map(t=>t.widgetIndex), [1,2,3]);
  assert.equal(artistTracks([{permalink_url:'http://soundcloud.com/blockcoreonline/04-59am/'}]).length, 0);
});
const rotation = [player.index];
for (let i=0;i<8;i++) {
  player.fire('pause'); player.fire('finish');
  // Duplicate completion while the next source is loading must be ignored.
  player.fire('finish'); player.fire('play'); rotation.push(player.index);
}
check('completion rotates every remaining song across multiple rounds without replaying the excluded song', () => {
  assert.deepEqual(rotation, [1,2,3,1,2,3,1,2,3]); assert.equal(player.seek,0);
  assert.equal(root.dataset.state,'playing'); assert.ok(!player.skips.includes(0));
});
// Some provider players already move their native index before FINISH arrives.
player.index = 1; player.fire('pause'); player.fire('finish'); player.fire('play');
check('native provider advancement and FINISH converge on one next track', () => {
  assert.equal(player.index,1); assert.equal(title.textContent,'Former second track');
});
emit(toggle,'click'); player.fire('finish');
check('Pause cancels continuous queue progression until explicitly resumed', () => assert.equal(root.dataset.state,'paused'));
rotationAbort.abort();
const clockAbort = new AbortController(); setMaxListeners(0,clockAbort.signal);
manual(clockAbort.signal); emit(toggle,'click'); await flush(); player=players.at(-1);
player.deferDuration=true; player.fire('ready'); player.fire('play'); const obsoleteDuration=player.durationCallback;
player.fire('finish'); player.fire('play'); const currentDuration=player.durationCallback;
obsoleteDuration(999999); currentDuration(200000);
player.fire('playProgress',{relativePosition:.9,currentPosition:40000}); player.fire('play');
check('runtime duration belongs to its current song and is queried only once per track',()=>{
  assert.equal(progress.at(-1),.2); assert.equal(timings.at(-1).durationMs,200000); assert.equal(player.durationCalls,2);
});
clockAbort.abort();
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/soundcloud-player.css', import.meta.url), 'utf8');
check('the music dock exposes exactly Play/Pause and Mute/Unmute with 44px targets', () => {
  const surface = html.match(/<section\b[^>]*\bdata-music-player\b[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.equal((surface.match(/<button/g)||[]).length, 2); assert.doesNotMatch(surface, /data-music-(next|previous)/);
  assert.match(surface, /data-music-mute/); assert.match(surface, /music-meta sr-only/); assert.match(css, /width: 44px; height: 44px/);
  assert.doesNotMatch(css, /data-native-player/); assert.equal(timers.size, 0);
});
console.log(JSON.stringify({mode:'Widget lifecycle and automatic playback fixtures; no audible browser claim',passed:checks.length,checks},null,2));
