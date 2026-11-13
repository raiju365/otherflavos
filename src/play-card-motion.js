export function initPlayCardMotion(menu, screen, { signal, available, open }) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const still = matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)');
  const on = (target, event, handler) => target.addEventListener(event, handler, { signal });
  const cards = menu.querySelectorAll('[data-open-game]');
  const easing = 'cubic-bezier(.22, .68, .28, 1)';
  let pending, entrance, returnMotion;

  function resetTilt(card) {
    delete card.dataset.tilting;
    card.style.removeProperty('--card-x');
    card.style.removeProperty('--card-y');
  }

  function cancel() {
    if (pending) {
      pending.animation.cancel();
      delete pending.card.dataset.opening;
      pending = undefined;
    }
    entrance?.cancel();
    returnMotion?.cancel();
    entrance = returnMotion = undefined;
    cards.forEach(resetTilt);
  }

  function enter(card, animated) {
    if (animated) {
      entrance = screen.animate([
        { opacity: .35, transform: 'translateY(7px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 205, easing });
    }
    open(card);
  }

  for (const card of cards) {
    const surface = card.querySelector('.play-card-surface');
    on(card, 'pointermove', event => {
      if (!fine.matches || still.matches || pending || !available() || event.pointerType === 'touch') return;
      const bounds = card.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
      const y = (event.clientY - bounds.top) / bounds.height * 2 - 1;
      card.style.setProperty('--card-x', Math.max(-1, Math.min(1, x)));
      card.style.setProperty('--card-y', Math.max(-1, Math.min(1, y)));
      card.dataset.tilting = '';
    });
    on(card, 'pointerleave', () => resetTilt(card));
    on(card, 'pointercancel', () => resetTilt(card));
    on(card, 'click', () => {
      if (pending || !available() || menu.hidden) return;
      returnMotion?.cancel();
      if (still.matches || typeof surface.animate !== 'function') {
        enter(card, false);
        return;
      }

      const current = getComputedStyle(surface).transform;
      card.dataset.opening = '';
      const animation = surface.animate([
        { transform: current, opacity: 1 },
        { transform: 'none', opacity: 1, offset: .66 },
        { transform: 'scale(.98)', opacity: .58 },
      ], { duration: 255, easing, fill: 'both' });
      pending = { card, animation };
      animation.finished.then(() => {
        if (pending?.animation !== animation) return;
        pending = undefined;
        if (available()) enter(card, true);
        resetTilt(card);
        delete card.dataset.opening;
        animation.cancel();
      }, () => {});
    });
  }

  on(document, 'portfolio:sectionstart', cancel);
  on(document, 'visibilitychange', () => { if (document.hidden) cancel(); });
  on(window, 'pagehide', cancel);
  on(window, 'blur', cancel);
  on(window, 'resize', cancel);
  on(fine, 'change', cancel);
  on(still, 'change', () => {
    const card = pending?.card;
    cancel();
    if (card && available() && !document.hidden) enter(card, false);
  });
  signal.addEventListener('abort', cancel, { once: true });

  return {
    restore(card) {
      cancel();
      if (still.matches || !card.animate) return;
      returnMotion = card.animate([
        { opacity: .55, transform: 'translateY(5px) scale(.985)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 230, easing });
    },
  };
}
