const epsilon = 1e-9;
const clearance = .083;
export const stageCount = 5;
export const maxPoints = 25;
const clamp = value => Math.max(0, Math.min(1, value));
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function movePoint(points, index, target) {
  const previous = points[index];
  if (!previous || ![target.x, target.y, target.z].every(Number.isFinite) || distance(previous, target) < epsilon) return false;
  points[index] = target;
  return true;
}

function closestContact(a, u, uu, c, v, vv) {
  const offset = subtract(a, c);
  const uv = dot(u, v), ur = dot(u, offset), vr = dot(v, offset);
  const denominator = uu * vv - uv * uv;
  let s = denominator > epsilon ? clamp((uv * vr - ur * vv) / denominator) : 0;
  let t = vv > epsilon ? (uv * s + vr) / vv : 0;
  if (t < 0 || t > 1 || vv <= epsilon) {
    t = clamp(t);
    s = uu > epsilon ? clamp((uv * t - ur) / uu) : 0;
  }
  const dx = offset.x + s * u.x - t * v.x;
  const dy = offset.y + s * u.y - t * v.y;
  const dz = offset.z + s * u.z - t * v.z;
  if (dx * dx + dy * dy + dz * dz >= clearance * clearance) return null;
  return {
    x: (a.x + c.x + s * u.x + t * v.x) / 2,
    y: (a.y + c.y + s * u.y + t * v.y) / 2,
    z: (a.z + c.z + s * u.z + t * v.z) / 2,
  };
}

export function findContacts(points, edges) {
  const contacts = [];
  const wires = edges.map(([a, b]) => {
    const vector = subtract(points[b], points[a]);
    return { a, b, vector, squared: dot(vector, vector) };
  });
  for (let i = 0; i < wires.length; i++) {
    const { a, b, vector: u, squared: uu } = wires[i];
    for (let j = i + 1; j < wires.length; j++) {
      const { a: c, b: d, vector: v, squared: vv } = wires[j];
      if (a === c || a === d || b === c || b === d) continue;
      const point = closestContact(points[a], u, uu, points[c], v, vv);
      if (point) contacts.push({ ...point, edges: [i, j] });
    }
  }
  return contacts;
}

export function boardLayout(width, height) {
  const shortSide = Math.min(width, height);
  const padding = Math.min(48, Math.max(25, shortSide * .105));
  const size = Math.max(1, shortSide - padding * 2);
  return { width, height, size, left: (width - size) / 2, top: (height - size) / 2 };
}


const stages = [[3, 2, 1, 1], [3, 3, 3, 3], [4, 3, 6, 8], [4, 4, 10, 18], [5, 5, 20, 45]];

export function createKnot(level, random = Math.random) {
  const [columns, rows, moves, minimum] = stages[level];
  const count = rows * columns;
  let best, bestCount = -1;
  for (let attempt = 0; attempt < 64; attempt++) {
    const depths = Array.from({ length: count }, (_, i) => .08 + .84 * (i + random()) / count);
    const jitter = attempt === 63 ? 0 : .07;
    const points = Array.from({ length: count }, (_, i) => {
      const x = (i % columns) / (columns - 1), y = Math.floor(i / columns) / (rows - 1);
      return { x: .10 + .80 * x + (random() - .5) * jitter,
        y: .10 + .80 * y + (random() - .5) * jitter, z: depths.splice(Math.floor(random() * depths.length), 1)[0] };
    });
    if (random() < .5) points.forEach(point => { point.x = 1 - point.x; });
    if (random() < .5) points.forEach(point => { [point.x, point.y] = [point.y, point.x]; });
    const edges = [];
    for (let i = 0; i < count; i++) {
      const right = i % columns < columns - 1, below = i < count - columns;
      if (right) edges.push([i, i + 1]);
      if (below) edges.push([i, i + columns]);
      if (right && below && (level >= 3 || random() > .25)) {
        edges.push(random() < .5 ? [i, i + columns + 1] : [i + 1, i + columns]);
      }
    }
    const solution = points.slice(), order = [];
    if (findContacts(solution, edges).length) continue;
    const low = Math.min(...points.map(point => point.z)), high = Math.max(...points.map(point => point.z));
    const candidates = points.flatMap((point, index) => point.z === low || point.z === high ? [] : [index]);
    while (order.length < moves && candidates.length) {
      const [index] = candidates.splice(Math.floor(random() * candidates.length), 1);
      for (let sample = 0; sample < 18; sample++) {
        const target = { x: .09 + .82 * random(), y: .09 + .82 * random(), z: .09 + .82 * random() };
        if (distance(target, solution[index]) < .24 || points.some(point => distance(point, target) < .075)) continue;
        movePoint(points, index, target);
        order.push(index);
        break;
      }
    }
    const contactCount = findContacts(points, edges).length;
    if (contactCount > bestCount) {
      bestCount = contactCount;
      best = { points, edges, solution, order: order.reverse() };
    }
    if (contactCount >= minimum) return best;
  }
  // If a shuffle happens to remain clean, create one contact on a non-adjacent wire.
  if (!bestCount) {
    const depths = best.solution.map(point => point.z);
    const low = Math.min(...depths), high = Math.max(...depths);
    const [a, b] = best.edges.flatMap(([a, b]) => [[a, b], [b, a]])
      .find(([index]) => depths[index] !== low && depths[index] !== high);
    const [c, d] = best.edges.find(edge => !edge.includes(a) && !edge.includes(b));
    const first = best.points[c], second = best.points[d];
    best.points[a] = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2, z: (first.z + second.z) / 2 };
    best.order = [...best.order.filter(index => index !== a), a];
  }
  return best;
}

export function frameView(points) {
  const axes = ['x', 'y', 'z'];
  const center = Object.fromEntries(axes.map(axis => {
    const values = points.map(point => point[axis]);
    return [axis, (Math.min(...values) + Math.max(...values)) / 2];
  }));
  const radius = Math.max(...points.map(point => distance(point, center)));
  return { center, zoom: Math.min(1, .57 / Math.max(radius, .001)) };
}

export function cameraProjection(layout, yaw, pitch, view = { center: { x: .5, y: .5, z: .5 }, zoom: 1 }) {
  const c = Math.cos(yaw), s = Math.sin(yaw), p = Math.cos(pitch), q = Math.sin(pitch);
  const right = { x: c, y: 0, z: s };
  const down = { x: q * s, y: p, z: -q * c };
  const near = { x: -p * s, y: q, z: p * c };
  const size = layout.size * view.zoom;
  return {
    project(point) {
      const local = subtract(point, view.center);
      const depth = dot(local, near) * view.zoom;
      return { x: layout.width / 2 + dot(local, right) * size,
        y: layout.height / 2 + dot(local, down) * size, z: depth,
        scale: Math.max(.76, Math.min(1.22, 1 + depth * .29)) };
    },
    move(point, dx, dy, axis = 'free') {
      const x = dx / size, y = dy / size;
      if (axis === 'free') return {
        x: point.x + x * right.x + y * down.x,
        y: point.y + x * right.y + y * down.y,
        z: point.z + x * right.z + y * down.z,
      };
      const rx = right[axis], ry = down[axis];
      const projected = rx * rx + ry * ry;
      // When a chosen axis points into the camera, use vertical motion for depth.
      const amount = projected < .10 ? -y * Math.sign(near[axis]) : (x * rx + y * ry) / projected;
      return { ...point, [axis]: point[axis] + amount };
    },
  };
}
