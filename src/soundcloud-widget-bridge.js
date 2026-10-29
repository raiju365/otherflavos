// Original, local parent-side controller for SoundCloud's iframe message API.
// The official player still owns audio, rights checks and media requests.
const ORIGIN = 'https://w.soundcloud.com';
const Events = Object.freeze({ READY: 'ready', PLAY: 'play', PAUSE: 'pause', FINISH: 'finish', ERROR: 'error', PLAY_PROGRESS: 'playProgress', SEEK: 'seek' });
const eventNames = new Set(Object.values(Events));
const getterNames = new Set(['getSounds', 'getCurrentSoundIndex']);

export function createSoundCloudWidget(frame) {
  if (new URL(frame.src).origin !== ORIGIN) throw new Error('Unexpected SoundCloud player origin');
  const handlers = new Map(), getters = new Map();
  let ready = false, disposed = false;
  function send(method, value) {
    if (disposed) return;
    const message = { method };
    if (value !== undefined) message.value = value;
    frame.contentWindow?.postMessage(JSON.stringify(message), ORIGIN);
  }
  function emit(name, value) {
    for (const callback of [...(handlers.get(name) || [])]) {
      if (disposed) break;
      callback(value);
    }
  }
  function receive(event) {
    if (disposed || event.origin !== ORIGIN || !frame.contentWindow || event.source !== frame.contentWindow) return;
    let message;
    try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
    if (!message || typeof message.method !== 'string') return;
    const { method, value } = message;
    if (method === Events.READY) {
      if (ready) return;
      ready = true;
      // Subscribe before invoking READY callbacks which may request playback.
      for (const [name, callbacks] of handlers) if (name !== Events.READY && callbacks.size) send('addEventListener', name);
      emit(Events.READY, value);
      return;
    }
    if (getterNames.has(method)) {
      const callbacks = getters.get(method) || [];
      getters.delete(method);
      for (const callback of callbacks) { if (!disposed) callback(value); }
    } else if (eventNames.has(method)) emit(method, value);
  }
  window.addEventListener('message', receive);
  function get(method, callback) {
    if (disposed || !ready || typeof callback !== 'function') return;
    const pending = getters.get(method);
    if (pending) pending.push(callback);
    else { getters.set(method, [callback]); send(method, null); }
  }
  return {
    bind(name, callback) {
      if (disposed || !eventNames.has(name) || typeof callback !== 'function') return;
      if (name === Events.READY && ready) {
        queueMicrotask(() => { if (!disposed) callback(); });
        return;
      }
      const callbacks = handlers.get(name) || new Set(), first = callbacks.size === 0;
      callbacks.add(callback); handlers.set(name, callbacks);
      if (ready && name !== Events.READY && first) send('addEventListener', name);
    },
    unbind(name) {
      if (disposed || !handlers.has(name)) return;
      handlers.delete(name);
      if (ready && name !== Events.READY) send('removeEventListener', name);
    },
    play() { if (ready) send('play'); },
    pause() { if (ready) send('pause'); },
    skip(index) { if (ready && Number.isInteger(index) && index >= 0) send('skip', index); },
    seekTo(time) { if (ready && Number.isFinite(time) && time >= 0) send('seekTo', time); },
    setVolume(volume) { if (ready && Number.isFinite(volume)) send('setVolume', Math.max(0, Math.min(100, volume))); },
    getSounds(callback) { get('getSounds', callback); },
    getCurrentSoundIndex(callback) { get('getCurrentSoundIndex', callback); },
    destroy() {
      if (disposed) return;
      for (const name of handlers.keys()) if (ready && name !== Events.READY) send('removeEventListener', name);
      disposed = true; handlers.clear(); getters.clear(); window.removeEventListener('message', receive);
    }
  };
}
createSoundCloudWidget.Events = Events;
