// Uses the official public SDK in a sandboxed protocol fixture, not a browser.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createSoundCloudWidget } from '../src/soundcloud-widget-bridge.js';
import { SOUNDCLOUD_ARTIST, SOUNDCLOUD_RESOURCE } from '../src/soundcloud-player.js';
const metadata = await fetch('https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(SOUNDCLOUD_ARTIST), { signal: AbortSignal.timeout(15000) });
assert.equal(metadata.status, 200);
const source = await metadata.json();
assert.equal(source.author_url, SOUNDCLOUD_ARTIST);
const embed = source.html.match(/src="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
assert.equal(new URL(embed).searchParams.get('url'), SOUNDCLOUD_RESOURCE);
const response = await fetch('https://w.soundcloud.com/player/api.js', { signal: AbortSignal.timeout(15000) });
assert.equal(response.status, 200);
const sdk = await response.text();
function checkOrder(readyBeforeSDK) {
  const listeners = {}, timers = [];
  const iframe = { nodeType: 1, nodeName: 'IFRAME', getAttribute: () => 'https://w.soundcloud.com/player/',
    contentWindow: { postMessage() {} } };
  const sandbox = { window: { location: { protocol: 'https:' }, addEventListener: (type, callback) => { listeners[type] = callback; } },
    document: { getElementById: () => iframe }, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} };
  const ready = () => listeners.message?.({ source: iframe.contentWindow, origin: 'https://w.soundcloud.com', data: '{"method":"ready"}' });
  if (readyBeforeSDK) ready();
  vm.runInNewContext(sdk, sandbox, { timeout: 2000 });
  const player = sandbox.SC.Widget(iframe); let received = 0;
  player.bind(sandbox.SC.Widget.Events.READY, () => received++);
  if (!readyBeforeSDK) ready();
  while (timers.length) timers.shift()();
  return received;
}
assert.equal(checkOrder(true), 0, 'the original iframe-first order loses READY');
assert.equal(checkOrder(false), 1, 'loading the SDK first receives READY exactly once');
function exercise(widget, ready) {
  for (const event of ['ready', 'play', 'pause', 'finish', 'error', 'playProgress', 'seek']) widget.bind(event, () => {});
  ready(); widget.getSounds(() => {}); widget.getCurrentSoundIndex(() => {});
  widget.play(); widget.pause(); widget.skip(2); widget.seekTo(0); widget.setVolume(0); widget.setVolume(100); widget.unbind('play');
}
const officialMessages = [], listeners = {}, timers = [];
const officialFrame = { nodeType: 1, nodeName: 'IFRAME', getAttribute: () => 'https://w.soundcloud.com/player/',
  contentWindow: { postMessage: (data, origin) => officialMessages.push({ data: JSON.parse(data), origin: new URL(origin).origin }) } };
const sandbox = { window: { location: { protocol: 'https:' }, addEventListener: (type, callback) => { listeners[type] = callback; } },
  document: { getElementById: () => officialFrame }, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} };
vm.runInNewContext(sdk, sandbox, { timeout: 2000 });
exercise(sandbox.SC.Widget(officialFrame), () => {
  listeners.message({ source: officialFrame.contentWindow, origin: 'https://w.soundcloud.com', data: '{"method":"ready"}' });
  while (timers.length) timers.shift()();
});
globalThis.window = new EventTarget(); const localMessages = [];
const localFrame = { src: 'https://w.soundcloud.com/player/', contentWindow: {
  postMessage: (data, origin) => localMessages.push({ data: JSON.parse(data), origin })
} };
const local = createSoundCloudWidget(localFrame);
exercise(local, () => {
  const ready = new Event('message');
  Object.defineProperties(ready, { source: { value: localFrame.contentWindow }, origin: { value: 'https://w.soundcloud.com' }, data: { value: '{"method":"ready"}' } });
  window.dispatchEvent(ready);
});
assert.deepEqual(localMessages, officialMessages, 'local subscriptions, queries and controls must match the official SDK wire format');
local.destroy();
console.log('3 live oEmbed source checks, 2 official SDK ordering checks and 1 local/official protocol comparison passed; not browser playback');
