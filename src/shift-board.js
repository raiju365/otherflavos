const radians = Math.PI / 180;
const clamp = value => Math.max(0, Math.min(1, value));
const turn = 360;

export function slideProgress(from, to, dx, dy) {
  const x = to.x - from.x, y = to.y - from.y;
  const lengthSquared = x * x + y * y;
  return lengthSquared > 1 ? clamp((dx * x + dy * y) / lengthSquared) : 0;
}

function center(element) {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x: x + width / 2, y: y + height / 2 };
}

export function initShiftBoard(space, object, front, { signal, available, findGap, move, reduced }) {
  let pitch = 13, yaw = -17;
  let gesture = null, ignoreClick = false;
  const on = (target, type, listener, options) => target.addEventListener(type, listener, { ...options, signal });

  function paint() {
    object.style.setProperty('--shift-pitch', `${pitch}deg`);
    object.style.setProperty('--shift-yaw', `${yaw}deg`);
  }

  function clear() {
    const current = gesture;
    if (!current) return;
    gesture = null;
    delete space.dataset.holding;
    if (current.tile) {
      current.tile.style.removeProperty('translate');
      delete current.tile.dataset.sliding;
    }
    if (space.hasPointerCapture(current.id)) space.releasePointerCapture(current.id);
  }

  function resetView() {
    clear();
    pitch = yaw = 0;
    paint();
  }

  on(space, 'pointerdown', event => {
    if (!available() || event.button !== 0 || event.isPrimary === false || gesture) return;
    ignoreClick = false;
    const tile = event.target.closest('[data-cell]');
    const gap = tile && findGap(tile);
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, pitch, yaw, moved: false };
    if (gap) {
      gesture.tile = tile;
      gesture.from = center(tile);
      gesture.to = center(gap);
      gesture.dx = gap.offsetLeft - tile.offsetLeft;
      gesture.dy = gap.offsetTop - tile.offsetTop;
      gesture.progress = 0;
    }
  });

  on(window, 'pointermove', event => {
    if (gesture?.id !== event.pointerId) return;
    if (!available()) { clear(); return; }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      gesture.moved = ignoreClick = true;
      space.dataset.holding = 'true';
      try { space.setPointerCapture(event.pointerId); } catch { /* Window input still tracks the gesture. */ }
    }
    if (gesture.tile) {
      gesture.progress = slideProgress(gesture.from, gesture.to, dx, dy);
      gesture.tile.dataset.sliding = 'true';
      gesture.tile.style.translate = `${gesture.dx * gesture.progress}px ${gesture.dy * gesture.progress}px`;
    } else {
      yaw = (gesture.yaw + dx * .72) % turn;
      pitch = (gesture.pitch - dy * .72) % turn;
      paint();
    }
  });

  on(window, 'pointerup', event => {
    if (gesture?.id !== event.pointerId) return;
    const { tile, progress, dx, dy, moved } = gesture;
    clear();
    if (!tile || !moved || !available()) return;
    if (progress >= .28) move(Number(tile.dataset.cell), progress);
    else if (progress && !reduced.matches) {
      tile.animate?.([
        { translate: `${dx * progress}px ${dy * progress}px`, zIndex: 2 },
        { translate: '0px 0px', zIndex: 2 },
      ], { duration: 160, easing: 'ease-out' });
    }
  });

  on(space, 'click', event => {
    if (!ignoreClick || event.detail === 0) return;
    ignoreClick = false;
    event.stopPropagation();
  }, { capture: true });
  on(window, 'pointercancel', event => { if (gesture?.id === event.pointerId) clear(); });
  on(space, 'lostpointercapture', event => {
    if (event.target === space && gesture?.id === event.pointerId) clear();
  });
  on(front, 'click', resetView);
  on(front, 'keydown', event => {
    const delta = { ArrowLeft: [0, -15], ArrowRight: [0, 15], ArrowUp: [15, 0], ArrowDown: [-15, 0] }[event.key];
    if (!delta || !available()) return;
    event.preventDefault();
    pitch = (pitch + delta[0]) % turn;
    yaw = (yaw + delta[1]) % turn;
    paint();
  });
  on(object, 'focusin', event => {
    const facingViewer = Math.cos(pitch * radians) * Math.cos(yaw * radians) > .15;
    if (!facingViewer && event.target.matches(':focus-visible')) resetView();
  });
  on(window, 'blur', clear);
  on(window, 'resize', clear);
  on(window, 'pagehide', clear);
  on(document, 'visibilitychange', () => { if (document.hidden) clear(); });
  on(document, 'portfolio:sectionstart', clear);
  signal.addEventListener('abort', clear, { once: true });
  paint();
  return { clear };
}
