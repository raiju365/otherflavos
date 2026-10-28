// Four anchored bodies, independent of the DOM. Time is bounded on every step;
// a sleeping tab never creates a catch-up simulation when it becomes visible.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = value => Number.isFinite(value) ? value : 0;
const speedLimit = 560;

export function createTypePlay(width, height, count = 4) {
  width = Math.max(1, finite(width));
  height = Math.max(1, finite(height));
  const size = Math.min(58, width / 5.4, height * .53);
  const hitSize = Math.max(44, size * 1.15);
  const margin = Math.min(width / 2, height / 2, Math.max(hitSize / 2 + 3, size * .69));
  const gap = Math.min(hitSize * 1.04, (width - margin * 2) / Math.max(1, count - 1));
  const bodies = Array.from({ length: count }, (_, index) => {
    const homeX = width / 2 + (index - (count - 1) / 2) * gap;
    const homeY = height / 2;
    return { homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0, angle: 0, spin: 0 };
  });
  return { width, height, size, hitSize, margin, radius: size * .39, bodies, quietTime: 0 };
}

export function placeTypeLetter(model, index, x, y) {
  const body = model.bodies[index];
  if (!body) return;
  body.x = clamp(finite(x), model.margin, model.width - model.margin);
  body.y = clamp(finite(y), model.margin, model.height - model.margin);
}

export function resetTypePlay(model, immediate = false) {
  for (const body of model.bodies) {
    body.vx = body.vy = body.spin = 0;
    if (immediate) { body.x = body.homeX; body.y = body.homeY; body.angle = 0; }
  }
}

export function kickTypeLetter(model, index, vx, vy, immediate = false) {
  const body = model.bodies[index];
  if (!body) return;
  const length = Math.hypot(finite(vx), finite(vy));
  const ratio = length > speedLimit ? speedLimit / length : 1;
  body.vx = finite(vx) * ratio;
  body.vy = finite(vy) * ratio;
  if (immediate) {
    placeTypeLetter(model, index, body.x + body.vx * .12, body.y + body.vy * .12);
    body.angle = clamp(body.vx * .025, -16, 16);
    body.vx = body.vy = body.spin = 0;
  }
}

export function mixTypePlay(model, turn = 0, immediate = false) {
  const noise = index => {
    const value = Math.sin((index + 1) * 127.1 + turn * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  model.bodies.forEach((body, index) => {
    kickTypeLetter(model, index, (noise(index) - .5) * 820, (noise(index + 8) - .5) * 680, immediate);
  });
}

export function resizeTypePlay(model, width, height) {
  const next = createTypePlay(width, height, model.bodies.length);
  next.bodies.forEach((body, index) => {
    const old = model.bodies[index];
    placeTypeLetter(next, index,
      body.homeX + (old.x - old.homeX) * next.width / model.width,
      body.homeY + (old.y - old.homeY) * next.height / model.height);
    body.angle = old.angle;
  });
  return next;
}

function collide(model, held) {
  const { bodies, radius } = model;
  for (let a = 0; a < bodies.length; a++) for (let b = a + 1; b < bodies.length; b++) {
    const first = bodies[a], second = bodies[b];
    let dx = second.x - first.x, dy = second.y - first.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= radius * 2) continue;
    if (distance < .001) { dx = 1; dy = 0; }
    const nx = distance < .001 ? 1 : dx / distance;
    const ny = distance < .001 ? 0 : dy / distance;
    const massA = a === held ? 0 : 1, massB = b === held ? 0 : 1;
    const total = massA + massB;
    const overlap = radius * 2 - distance;
    first.x -= nx * overlap * massA / total;
    first.y -= ny * overlap * massA / total;
    second.x += nx * overlap * massB / total;
    second.y += ny * overlap * massB / total;
    const closing = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny;
    if (closing < 0) {
      const impulse = -1.4 * closing / total;
      first.vx -= impulse * nx * massA; first.vy -= impulse * ny * massA;
      second.vx += impulse * nx * massB; second.vy += impulse * ny * massB;
    }
  }
}

export function stepTypePlay(model, elapsed, held = -1) {
  const duration = clamp(finite(elapsed), 0, .04);
  const steps = Math.max(1, Math.ceil(duration * 120));
  const dt = duration / steps;
  const { bodies, width, height, margin } = model;
  const before = held >= 0 ? bodies.map(body => [body.x, body.y, body.angle]) : null;
  for (let step = 0; step < steps; step++) {
    bodies.forEach((body, index) => {
      if (index === held) return;
      body.vx += ((body.homeX - body.x) * 70 - body.vx * 10) * dt;
      body.vy += ((body.homeY - body.y) * 70 - body.vy * 10) * dt;
      const speed = Math.hypot(body.vx, body.vy);
      if (speed > speedLimit) { body.vx *= speedLimit / speed; body.vy *= speedLimit / speed; }
      body.x += body.vx * dt; body.y += body.vy * dt;
      const lean = clamp((body.x - body.homeX) * .2 + body.vx * .025, -26, 26);
      body.spin += ((lean - body.angle) * 110 - body.spin * 16) * dt;
      body.angle += body.spin * dt;
    });
    collide(model, held);
    bodies.forEach((body, index) => {
      if (index === held) return;
      if (body.x < margin || body.x > width - margin) body.vx *= -.4;
      if (body.y < margin || body.y > height - margin) body.vy *= -.4;
      placeTypeLetter(model, index, body.x, body.y);
    });
  }
  let moving = false;
  bodies.forEach((body, index) => {
    if (index === held) return;
    const distance = Math.hypot(body.x - body.homeX, body.y - body.homeY);
    if (distance < .18 && Math.hypot(body.vx, body.vy) < .8 && Math.abs(body.angle) < .12 && Math.abs(body.spin) < .6) {
      body.x = body.homeX; body.y = body.homeY; body.vx = body.vy = body.angle = body.spin = 0;
    } else if (Math.hypot(body.vx, body.vy) > .7 || Math.abs(body.spin) > .5 || (held < 0 && distance >= .18)) moving = true;
  });
  // Contact can balance a spring away from its home, with tiny solver impulses
  // left over. Sleep on actual visual displacement, not those latent impulses.
  const quiet = before && bodies.every((body, index) => index === held
    || (Math.hypot(body.x - before[index][0], body.y - before[index][1]) < .035 && Math.abs(body.angle - before[index][2]) < .035));
  model.quietTime = quiet ? model.quietTime + duration : 0;
  if (held >= 0 && model.quietTime >= .12) {
    moving = false;
    bodies.forEach((body, index) => { if (index !== held) body.vx = body.vy = body.spin = 0; });
  }
  // A held letter can prevent a neighbour returning home. Let that contact sleep
  // too; the next pointer movement or release wakes the same owner again.
  if (!moving && held < 0) resetTypePlay(model, true);
  return moving;
}
