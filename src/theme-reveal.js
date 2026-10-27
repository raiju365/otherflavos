import { themeInkField, themeInkFrames } from './theme-ink.js';
export { themeInkFrames } from './theme-ink.js';
// A finite native snapshot reveal; the real document keeps its focus and scroll.
export function createThemeReveal({ signal, origin, apply }) {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  let revision = 0, active = null;
  const on = (target, type, listener) => target.addEventListener(type, listener, { signal });

  function clear(record = active) {
    if (!record || active !== record) return;
    active = null;
    record.animation?.cancel();
    delete root.dataset.themeRevealing;
    delete root.dataset.themeInk;
    for (let i = 0; i < 3; i++) for (const axis of ['x', 'y']) {
      root.style.removeProperty(`--theme-ink-${i}-${axis}`);
    }
  }
  function stop() {
    const record = active;
    if (!record) return;
    clear(record);
    try { record.transition?.skipTransition(); } catch { /* Already removed. */ }
  }
  function settle() {
    // Commit pending input before invalidating delayed snapshot callbacks.
    active?.commit();
    revision++;
    stop();
  }
  on(window, 'resize', settle);
  on(window, 'pagehide', settle);
  on(document, 'visibilitychange', () => { if (document.hidden) settle(); });
  on(document, 'portfolio:sectionstart', settle);
  on(reduced, 'change', () => { if (reduced.matches) settle(); });
  on(forced, 'change', () => { if (forced.matches) settle(); });
  signal.addEventListener('abort', () => { revision++; stop(); }, { once: true });

  return theme => {
    if (signal.aborted) return;
    // Reuse the live new view during a burst. Never queue another capture,
    // restart the diffusion, or wait for an earlier animation to finish.
    if (active) {
      if (active.theme === theme) return;
      active.theme = theme;
      if (active.committed) active.commit();
      return;
    }
    const current = ++revision;
    if (root.dataset.theme === theme) return;
    let record;
    const commit = () => {
      if (current !== revision || signal.aborted || (record && active !== record)) return;
      if (record) record.committed = true;
      const latest = record?.theme ?? theme;
      if (root.dataset.theme !== latest) apply(latest);
    };
    if (reduced.matches || forced.matches || document.hidden || root.dataset.entry === 'loading'
      || typeof document.startViewTransition !== 'function' || typeof root.animate !== 'function') {
      commit();
      return;
    }
    const rect = origin.getBoundingClientRect();
    const x = Math.max(0, Math.min(window.innerWidth, rect.left + rect.width / 2));
    const y = Math.max(0, Math.min(window.innerHeight, rect.top + rect.height / 2));
    const settings = { x, y, width: window.innerWidth, height: window.innerHeight };
    record = { transition: null, animation: null, commit, theme, committed: false };
    active = record;
    root.dataset.themeRevealing = 'true';
    try {
      const ink = typeof globalThis.CSS?.registerProperty === 'function'
        && CSS.supports('mask-composite', 'intersect');
      if (ink) {
        root.dataset.themeInk = 'true';
        themeInkField(settings).seeds.forEach(([sx, sy], i) => {
          root.style.setProperty(`--theme-ink-${i}-x`, `${sx}px`);
          root.style.setProperty(`--theme-ink-${i}-y`, `${sy}px`);
        });
      }
      const transition = document.startViewTransition(commit);
      record.transition = transition;
      transition.updateCallbackDone.catch(() => { if (active === record) { commit(); stop(); } });
      transition.ready.then(() => {
        if (active !== record || signal.aborted) return;
        record.animation = root.animate(ink ? themeInkFrames(settings) : [{ opacity: 1 }, { opacity: 0 }], {
          duration: ink ? 520 : 200,
          easing: 'cubic-bezier(.3,.65,.25,1)', fill: 'both',
          pseudoElement: '::view-transition-old(root)',
        });
        record.animation.finished.catch(() => {});
      }).catch(() => { if (active === record) { commit(); stop(); } });
      transition.finished.then(() => {
        if (active === record) { commit(); clear(record); }
      }, () => { if (active === record) { commit(); stop(); } });
    } catch {
      commit();
      stop();
    }
  };
}
