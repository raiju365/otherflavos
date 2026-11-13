const radians = Math.PI / 180;
const clamp = value => Math.max(0, Math.min(1, value));
const turn = 360;

function woodReflection(pitch, yaw) {
  // The half vector between the viewer and a light above and to the left.
  const light = { x: -.32, y: -.38, z: .868 };
  const x = pitch * radians, y = yaw * radians;
  const sinX = Math.sin(x), cosX = Math.cos(x);
  const sinY = Math.sin(y), cosY = Math.cos(y);
  const vertical = light.y * cosX + light.z * sinX;
  const depth = light.z * cosX - light.y * sinX;
  const horizontal = light.x * cosY - depth * sinY;
  const facing = light.x * sinY + depth * cosY;
  return {
    x: 36 * horizontal,
    y: 36 * vertical,
    front: clamp(facing) ** 8,
    back: clamp(-facing) ** 8,
  };
}

export function slideProgress(from, to, dx, dy) {
  const x = to.x - from.x, y = to.y - from.y;
  const lengthSquared = x * x + y * y;
  return lengthSquared > 1 ? clamp((dx * x + dy * y) / lengthSquared) : 0;
}

function center(element) {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x: x + width / 2, y: y + height / 2 };
}

export function slideRelease(offset, speed) {
  const distance = Math.abs(offset);
  const duration = 140 + distance * 220;
  const momentum = distance ? Math.sign(-offset) * speed * duration / distance : 0;
  const tangent = 1.45 + 1.45 * clamp(momentum);
  const frames = Array.from({ length: 25 }, (_, index) => {
    const t = index / 24;
    return offset * (1 - t) ** 2 * (1 + (2 - tangent) * t) || 0;
  });
  return { duration, frames };
}

export function initShiftBoard(space, object, front, { signal, available, findGap, move, reduced }) {
  let pitch = 17, yaw = -21;
  let gesture = null, motion = null, ignoreClick = false;
  let frame = 0;
  const [frontReflection, backReflection] = object.querySelectorAll('.shift-reflection');
  const on = (target, type, listener, options) => target.addEventListener(type, listener, { ...options, signal });
  const direction = (tile, gap) => ({ x: gap.offsetLeft - tile.offsetLeft, y: gap.offsetTop - tile.offsetTop });
  const translation = ({ x, y }, offset) => `${x * offset}px ${y * offset}px`;

  function paint() {
    object.style.setProperty('--shift-orientation', `rotateX(${pitch}deg) rotateY(${yaw}deg)`);
    const gloss = woodReflection(pitch, yaw);
    frontReflection.style.translate = `${gloss.x}% ${gloss.y}%`;
    frontReflection.style.opacity = gloss.front;
    backReflection.style.translate = `${-gloss.x}% ${gloss.y}%`;
    backReflection.style.opacity = gloss.back;
  }

  function paintDrag() {
    frame = 0;
    if (gesture.tile) gesture.tile.style.translate = translation(gesture.track, gesture.progress);
    else paint();
  }

  function releasePointer() {
    const current = gesture;
    if (!current) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (current.moved && !current.tile) paint();
    gesture = null;
    delete space.dataset.holding;
    if (current.tile) {
      current.tile.style.removeProperty('translate');
      delete current.tile.dataset.sliding;
    }
    if (space.hasPointerCapture(current.id)) space.releasePointerCapture(current.id);
  }

  function clear() {
    releasePointer();
    motion?.cancel();
    motion = null;
  }

  function settle(tile, track, offset, speed) {
    if (!offset || reduced.matches || typeof tile.animate !== 'function') return;
    const { duration, frames } = slideRelease(offset, speed);
    const animation = tile.animate(frames.map(position => ({ translate: translation(track, position) })), { duration });
    motion = animation;
    animation.finished.then(() => { if (motion === animation) motion = null; }, () => {});
  }

  function resetView() {
    clear();
    pitch = yaw = 0;
    paint();
  }

  on(space, 'pointerdown', event => {
    if (!available() || event.button !== 0 || event.isPrimary === false || gesture || motion) return;
    ignoreClick = false;
    const tile = event.target.closest('[data-cell]');
    const gap = tile && findGap(tile);
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, pitch, yaw, moved: false };
    if (gap) {
      gesture.tile = tile;
      gesture.from = center(tile);
      gesture.to = center(gap);
      gesture.track = direction(tile, gap);
      gesture.progress = 0;
      gesture.speed = 0;
      gesture.time = event.timeStamp;
    }
  });

  on(window, 'pointermove', event => {
    if (gesture?.id !== event.pointerId) return;
    if (!available()) { clear(); return; }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved) {
      if (Math.hypot(dx, dy) < (gesture.tile ? 3 : 6)) return;
      gesture.moved = ignoreClick = true;
      space.dataset.holding = 'true';
      if (gesture.tile) gesture.tile.dataset.sliding = 'true';
      try { space.setPointerCapture(event.pointerId); } catch { /* Window input still tracks the gesture. */ }
    }
    if (gesture.tile) {
      const progress = slideProgress(gesture.from, gesture.to, dx, dy);
      const elapsed = Math.max(1, event.timeStamp - gesture.time);
      gesture.speed = elapsed < 85 ? (progress - gesture.progress) / elapsed : 0;
      gesture.progress = progress;
      gesture.time = event.timeStamp;
    } else {
      yaw = (gesture.yaw + dx * .72) % turn;
      pitch = (gesture.pitch - dy * .72) % turn;
    }
    if (!frame) frame = requestAnimationFrame(paintDrag);
  });

  on(window, 'pointerup', event => {
    if (gesture?.id !== event.pointerId) return;
    const { tile, progress, track, moved, speed, time } = gesture;
    releasePointer();
    if (!tile || !moved || !available()) return;
    const releaseSpeed = event.timeStamp - time < 65 ? speed : 0;
    if (progress >= .28) move(Number(tile.dataset.cell), progress, releaseSpeed);
    else settle(tile, track, progress, releaseSpeed);
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
  on(reduced, 'change', clear);
  on(document, 'visibilitychange', () => { if (document.hidden) clear(); });
  on(document, 'portfolio:sectionstart', clear);
  signal.addEventListener('abort', clear, { once: true });
  paint();
  return { clear, direction, settle, settling: () => Boolean(motion) };
}
