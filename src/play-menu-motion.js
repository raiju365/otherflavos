export function initPlayMenuMotion(menu, screen, { signal, available, open }) {
  const still = matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)');
  const on = (target, event, handler) => target.addEventListener(event, handler, { signal });
  const easing = 'cubic-bezier(.22, .68, .28, 1)';
  let motion;

  function cancel() {
    motion?.cancel();
    motion = undefined;
  }

  function reveal(element, offset) {
    cancel();
    if (still.matches || typeof element.animate !== 'function') return;
    motion = element.animate([
      { opacity: .55, translate: `0 ${offset}px` },
      { opacity: 1, translate: 'none' },
    ], { duration: 250, easing });
  }

  on(menu, 'click', event => {
    const option = event.target.closest('[data-open-game]');
    if (!option || menu.hidden || !available()) return;
    open(option);
    reveal(screen, 6);
  });

  on(document, 'portfolio:sectionstart', cancel);
  on(document, 'visibilitychange', () => { if (document.hidden) cancel(); });
  on(window, 'pagehide', cancel);
  on(still, 'change', cancel);
  signal.addEventListener('abort', cancel, { once: true });
  return { restore: () => reveal(menu, 4) };
}
