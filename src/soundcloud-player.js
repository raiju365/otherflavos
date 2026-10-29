import { createSoundCloudWidget } from './soundcloud-widget-bridge.js';

export const SOUNDCLOUD_ARTIST = 'https://soundcloud.com/blockcoreonline';
export const SOUNDCLOUD_NAME = 'Blockcore';
// Verified from SoundCloud's public oEmbed response for the supplied profile.
export const SOUNDCLOUD_RESOURCE = 'https://api.soundcloud.com/users/1167960067';

export function artistTracks(sounds) {
  if (!Array.isArray(sounds)) return [];
  return sounds.flatMap((sound, widgetIndex) => {
    try {
      const url = new URL(sound?.permalink_url);
      if (url.protocol === 'http:') url.protocol = 'https:';
      const belongs = url.pathname.startsWith('/blockcoreonline/') || String(sound?.user?.id) === '1167960067';
      // The widget enforces streaming availability itself; its API streamable flag
      // is not a reason to discard every otherwise valid embedded track.
      if (url.origin !== 'https://soundcloud.com' || !belongs
        || sound.access === 'blocked' || sound.policy === 'BLOCK') return [];
      return [{ widgetIndex, url: url.href, title: typeof sound.title === 'string' ? sound.title : SOUNDCLOUD_NAME,
        waveform: sound.waveform_url, duration: Number(sound.duration) || 0 }];
    } catch { return []; }
  });
}

export function soundCloudEmbedURL() {
  const url = new URL('https://w.soundcloud.com/player/');
  const options = { url: SOUNDCLOUD_RESOURCE, auto_play: 'false', buying: 'false', sharing: 'false',
    download: 'false', show_artwork: 'false', show_playcount: 'false', show_user: 'true',
    hide_related: 'true', show_reposts: 'false', visual: 'false', single_active: 'true' };
  Object.entries(options).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}

export function loadSoundCloudAPI(signal) {
  if (signal.aborted) return Promise.reject(new Error('aborted'));
  // Bundled with the app: no remote script request, global SC or SDK timeout.
  return Promise.resolve(createSoundCloudWidget);
}

export function initSoundCloudPlayer({ signal, onPlaybackChange = () => {}, onTrackChange = () => {}, onProgress = () => {}, loadAPI = loadSoundCloudAPI } = {}) {
  const root = document.querySelector('[data-music-player]');
  if (!root || !signal || signal.aborted) return () => {};
  const toggle = root.querySelector('[data-music-toggle]'), next = root.querySelector('[data-music-next]');
  const previous = root.querySelector('[data-music-previous]'), mute = root.querySelector('[data-music-mute]');
  const host = root.querySelector('[data-music-host]'), title = root.querySelector('[data-music-track]');
  const credit = root.querySelector('[data-music-credit]'), status = root.querySelector('[data-music-status]');
  if (!toggle || !next || !host) return () => {};
  let widget = null, frame = null, events = null, queue = [], current = 0;
  let ready = false, wanted = false, playing = false, advancing = false, finishEligible = false, disposed = false, revision = 0, retargets = 0, consecutiveErrors = 0;
  let readyTimer = 0, playTimer = 0;
  let nativeRecovery = false, warmed = false, muted = false, trackURL = '';
  const alive = () => !disposed && !signal.aborted;
  const on = (target, event, handler) => target?.addEventListener(event, handler, { signal });
  const announce = text => { if (alive() && status) status.textContent = text; };
  function visual(value) { playing = value; onPlaybackChange(value); }
  function publishTrack() {
    const track = queue[current];
    if (!track || track.url === trackURL) return;
    trackURL = track.url; onTrackChange(track); onProgress(0);
  }
  function renderMute() {
    root.dataset.muted = String(muted);
    mute?.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
    mute?.setAttribute('aria-pressed', String(muted));
  }
  function warmConnection() {
    if (!alive() || warmed) return;
    warmed = true;
    if (document.querySelector('link[data-music-preconnect]')) return;
    const link = document.createElement('link');
    link.rel = 'preconnect'; link.href = 'https://w.soundcloud.com'; link.dataset.musicPreconnect = 'true';
    document.head.append(link);
  }
  function showNative(value) {
    nativeRecovery = value; root.dataset.nativePlayer = String(value);
    host.setAttribute('aria-hidden', String(!value));
    if (frame) { frame.setAttribute('aria-hidden', String(!value)); frame.tabIndex = value ? 0 : -1; }
  }
  function render(state) {
    root.dataset.state = state;
    toggle.setAttribute('aria-label', wanted ? 'Pause music' : state === 'error' ? 'Retry music' : 'Play music');
    toggle.setAttribute('aria-pressed', String(wanted));
    toggle.setAttribute('aria-busy', String(state === 'loading'));
    next.disabled = !ready || queue.length < 1;
    if (previous) previous.disabled = next.disabled;
  }
  function releaseWidget() {
    showNative(false);
    clearTimeout(readyTimer); clearTimeout(playTimer);
    if (widget && events) for (const name of Object.values(events)) widget.unbind(name);
    try { widget?.pause(); } catch { /* Detached provider. */ }
    widget?.destroy?.();
    frame?.remove(); frame = widget = events = null; ready = false; queue = []; advancing = false;
  }
  function fail(reason = 'provider-error') {
    if (!alive()) return;
    root.dataset.error = reason;
    delete root.dataset.waiting;
    revision++; wanted = finishEligible = false; visual(false); releaseWidget(); render('error');
    if (title) title.textContent = reason === 'empty-queue' ? 'Antrean belum tersedia'
      : reason === 'provider-error' ? 'Lagu belum tersedia' : 'Pemutar belum siap';
    if (credit) credit.href = SOUNDCLOUD_ARTIST;
    announce('SoundCloud belum bisa diputar. Tekan Play untuk mencoba lagi, atau buka tautan Blockcore.');
  }
  function readinessSlow() {
    if (!alive() || ready) return;
    // Slow provider loading is not an error. Preserve this exact request and
    // the visitor's current intent instead of restarting or cancelling it.
    root.dataset.waiting = 'provider';
    if (!wanted) { render('paused'); return; }
    visual(false); render('loading');
    if (title) title.textContent = 'Memuat musik…';
    announce('Musik masih dimuat dari SoundCloud. Tombol Pause dapat membatalkan pemutaran.');
  }
  function requestPlay() {
    if (!alive() || !ready || !wanted) return;
    clearTimeout(playTimer);
    // Buffering can be slow without failing. Keep Play intent and offer a
    // direct provider gesture if the browser requires it after async loading.
    playTimer = setTimeout(() => {
      if (!alive() || playing || !wanted) return;
      root.dataset.waiting = 'audio';
      showNative(true);
      visual(false); render('loading');
      if (title) title.textContent = 'Memuat audio…';
      announce('Audio masih dimuat. Tunggu atau gunakan tombol Play di player SoundCloud.');
    }, 8000);
    try { widget.play(); } catch { fail(); }
  }
  function refreshCurrent() {
    const token = revision;
    widget.getCurrentSoundIndex(index => {
      if (!alive() || token !== revision || !ready) return;
      const position = queue.findIndex(track => track.widgetIndex === index);
      if (position < 0 || (advancing && position !== current)) {
        if (retargets++ >= 1) { fail(); return; }
        try { widget.skip(queue[current].widgetIndex); if (wanted) requestPlay(); } catch { fail(); }
        return;
      }
      if (advancing) widget.seekTo(0);
      current = position; advancing = false;
      publishTrack();
      if (title) { title.textContent = queue[current].title; title.title = queue[current].title; }
      if (credit) credit.href = queue[current].url;
    });
  }
  function pause() {
    if (!alive()) return;
    wanted = advancing = finishEligible = false; clearTimeout(playTimer); visual(false);
    delete root.dataset.waiting;
    try { widget?.pause(); } catch { fail(); return; }
    render(ready || frame || root.dataset.state === 'loading' ? 'paused' : 'idle');
    if (title) title.textContent = ready ? queue[current].title : 'Musik dijeda';
    announce('Musik dijeda.');
  }
  function advance(direction = 1) {
    if (!alive() || !ready || !queue.length) return;
    current = (current + direction + queue.length) % queue.length; revision++; retargets = 0; advancing = wanted = finishEligible = true;
    publishTrack(); onProgress(0);
    visual(false); render('loading'); announce('Memuat lagu berikutnya.');
    try { widget.skip(queue[current].widgetIndex); if (queue.length === 1) widget.seekTo(0); requestPlay(); } catch { fail(); }
  }
  async function start() {
    const token = ++revision; releaseWidget(); render('loading');
    root.dataset.connectionAttempt = '1';
    consecutiveErrors = 0;
    delete root.dataset.error;
    delete root.dataset.waiting;
    if (title) title.textContent = 'Memuat musik…';
    announce('Memuat lagu Blockcore dari SoundCloud.');
    try {
      // The parent-side bridge is part of our own bundle, so no third-party
      // script has to load before the iframe can be controlled.
      const Widget = await loadAPI(signal);
      if (!alive() || token !== revision) return;
      frame = document.createElement('iframe'); frame.title = 'SoundCloud audio source';
      frame.setAttribute('allow', 'autoplay; encrypted-media'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
      frame.width = '300'; frame.height = '166'; frame.src = soundCloudEmbedURL(); host.append(frame);
      on(frame, 'load', () => { if (alive() && token === revision) root.dataset.frameLoad = 'loaded'; });
      widget = Widget(frame); events = Widget.Events;
      const instance = widget, currentSession = () => alive() && widget === instance;
      readyTimer = setTimeout(readinessSlow, 15000);
      widget.bind(events.READY, () => {
        if (!alive() || token !== revision) return;
        widget.getSounds(sounds => {
          if (!alive() || token !== revision) return;
          queue = artistTracks(sounds);
          if (!queue.length) { fail('empty-queue'); return; }
          clearTimeout(readyTimer); ready = true; current = 0;
          widget.setVolume?.(muted ? 0 : 100); publishTrack();
          delete root.dataset.error;
          delete root.dataset.waiting;
          if (title) title.textContent = queue[0].title;
          if (credit) credit.href = queue[0].url;
          if (queue[0].widgetIndex !== 0) { advancing = wanted; widget.skip(queue[0].widgetIndex); }
          render(wanted ? 'loading' : 'paused');
          announce(`${queue.length} lagu Blockcore tersedia di pemutar.`);
          if (wanted) requestPlay();
        });
      });
      widget.bind(events.PLAY, () => {
        if (!currentSession()) return;
        // A native Play click inside the exposed iframe is a fresh user action.
        if (nativeRecovery && ready && document.activeElement === frame) wanted = true;
        if (!wanted || !ready) { widget.pause(); return; }
        const restoreFocus = nativeRecovery && document.activeElement === frame;
        showNative(false);
        delete root.dataset.waiting;
        if (restoreFocus) toggle.focus?.({ preventScroll: true });
        clearTimeout(playTimer); consecutiveErrors = 0; finishEligible = true; visual(true); render('playing'); refreshCurrent();
      });
      widget.bind(events.PAUSE, () => {
        if (!currentSession()) return;
        visual(false);
        if (!ready) return;
        if (!advancing) { wanted = false; clearTimeout(playTimer); render(ready ? 'paused' : 'loading'); }
      });
      const progress = data => {
        if (!currentSession() || !ready || advancing || !playing) return;
        const value = data?.relativePosition;
        if (Number.isFinite(value) && value >= 0 && value <= 1) onProgress(value);
      };
      if (events.PLAY_PROGRESS) widget.bind(events.PLAY_PROGRESS, progress);
      if (events.SEEK) widget.bind(events.SEEK, progress);
      widget.bind(events.FINISH, () => { if (currentSession() && !advancing && (wanted || finishEligible)) advance(); });
      widget.bind(events.ERROR, () => {
        if (!currentSession()) return;
        if (ready && wanted && consecutiveErrors < queue.length - 1) {
          consecutiveErrors++; advance();
        } else fail('provider-error');
      });
    } catch { if (alive() && token === revision) fail('api-load'); }
  }
  on(toggle, 'click', () => {
    if (wanted) { pause(); return; }
    wanted = true;
    if (ready) { render('loading'); requestPlay(); }
    else if (frame && widget) {
      render('loading');
      if (title) title.textContent = 'Memuat musik…';
      announce('Melanjutkan pemuatan SoundCloud yang sedang berjalan.');
    } else if (root.dataset.state !== 'loading') start();
  });
  on(toggle, 'pointerenter', warmConnection); on(toggle, 'focusin', warmConnection);
  on(next, 'click', () => advance(1));
  on(previous, 'click', () => advance(-1));
  on(mute, 'click', () => {
    muted = !muted; renderMute();
    try { widget?.setVolume?.(muted ? 0 : 100); } catch { fail(); }
    announce(muted ? 'Suara dimatikan.' : 'Suara dinyalakan.');
  });
  on(document, 'portfolio:musicpause', pause);
  on(window, 'pagehide', pause);
  function cleanup() {
    if (disposed) return; disposed = true; revision++; wanted = finishEligible = false; visual(false); releaseWidget();
    delete root.dataset.waiting;
    root.dataset.state = 'idle'; toggle.setAttribute('aria-pressed', 'false'); next.disabled = true;
    if (previous) previous.disabled = true;
  }
  signal.addEventListener('abort', cleanup, { once: true });
  visual(false); renderMute(); render('idle');
  return cleanup;
}
