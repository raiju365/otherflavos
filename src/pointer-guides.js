export function initPointerGuides(signal) {
  const finePointer = matchMedia('(any-hover: hover) and (any-pointer: fine)');
  const guides = document.createElement('div');
  guides.className = 'pointer-guides';
  guides.setAttribute('aria-hidden', 'true');
  guides.hidden = true;
  const horizontal = document.createElement('span');
  const vertical = document.createElement('span');
  horizontal.className = 'pointer-guide-horizontal';
  vertical.className = 'pointer-guide-vertical';
  guides.append(horizontal, vertical);
  document.body.append(guides);
  const on = (target, type, listener) => target.addEventListener(type, listener, { signal, passive: true });
  const hide = () => { guides.hidden = true; };

  on(window, 'pointermove', event => {
    if (!finePointer.matches || event.pointerType === 'touch' || document.hidden || document.documentElement?.dataset.entry === 'loading'
      || document.querySelector('dialog[open]')) { hide(); return; }
    // Viewport coordinates work for both the nested desktop pane and document scroll.
    // Offset half the stroke so its center, rather than its edge, meets the pointer.
    horizontal.style.transform = `translate3d(0, ${event.clientY - .5}px, 0)`;
    vertical.style.transform = `translate3d(${event.clientX - .5}px, 0, 0)`;
    guides.hidden = false;
  });
  on(document, 'pointerout', event => { if (!event.relatedTarget) hide(); });
  on(window, 'pointerdown', event => { if (event.pointerType === 'touch') hide(); });
  on(document, 'pointercancel', hide);
  on(document, 'visibilitychange', hide);
  on(document, 'keydown', event => { if (event.key === 'Tab') hide(); });
  on(window, 'blur', hide);
  on(window, 'resize', hide);
  on(finePointer, 'change', hide);
  signal.addEventListener('abort', () => guides.remove(), { once: true });
  return hide;
}
