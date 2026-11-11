const epsilon = 1e-7;
export const stageCount = 5;
export const maxPoints = 25;
const clamp = value => Math.max(0, Math.min(1, value));
const cross = (x, y, u, v) => x * v - y * u;

export function movePoint(points, index, x, y, spacing = .085) {
  if (!points[index] || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const next = { x: clamp(x), y: clamp(y) };
  if (Math.hypot(points[index].x - next.x, points[index].y - next.y) < epsilon) return false;
  if (points.some((point, other) => other !== index && Math.hypot(point.x - next.x, point.y - next.y) < spacing)) return false;
  points[index] = next;
  return true;
}

function intersection(a, b, c, d, sharedEndpoint) {
  const rx = b.x - a.x, ry = b.y - a.y;
  const sx = d.x - c.x, sy = d.y - c.y;
  const qx = c.x - a.x, qy = c.y - a.y;
  const denominator = cross(rx, ry, sx, sy);
  let t;
  if (Math.abs(denominator) > epsilon) {
    if (sharedEndpoint) return null;
    t = cross(qx, qy, sx, sy) / denominator;
    const u = cross(qx, qy, rx, ry) / denominator;
    if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) return null;
  } else {
    // A wire touching an unrelated endpoint or lying on another wire still crosses.
    if (Math.abs(cross(qx, qy, rx, ry)) > epsilon) return null;
    const length = rx * rx + ry * ry;
    if (length < epsilon) return null;
    const first = (qx * rx + qy * ry) / length;
    const last = first + (sx * rx + sy * ry) / length;
    const start = Math.max(0, Math.min(first, last));
    const end = Math.min(1, Math.max(first, last));
    if (end < start - epsilon || (sharedEndpoint && end - start < epsilon)) return null;
    t = (start + end) * .5;
  }
  return { x: a.x + rx * t, y: a.y + ry * t };
}

export function findCrossings(points, edges) {
  const crossings = [];
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const [c, d] = edges[j];
      const sharedEndpoint = a === c || a === d || b === c || b === d;
      const point = intersection(points[a], points[b], points[c], points[d], sharedEndpoint);
      if (point) crossings.push({ ...point, edges: [i, j] });
    }
  }
  return crossings;
}

export function boardLayout(width, height) {
  const shortSide = Math.min(width, height);
  const padding = Math.min(48, Math.max(25, shortSide * .105));
  const size = Math.max(1, shortSide - padding * 2);
  return { width, height, size, left: (width - size) / 2, top: (height - size) / 2 };
}

const stages = [[3, 2, 1, 1], [3, 3, 3, 8], [4, 3, 6, 20], [4, 4, 10, 55], [5, 5, 20, 150]];

export function createKnot(level, random = Math.random) {
  const [columns, rows, moves, minimum] = stages[level];
  const spacing = .44 / Math.max(rows, columns);
  const count = rows * columns;
  let best;
  let bestCount = -1;
  for (let attempt = 0; attempt < 48; attempt++) {
    const points = Array.from({ length: count }, (_, i) => {
      const x = (i % columns) / (columns - 1), y = Math.floor(i / columns) / (rows - 1);
      return { x: .12 + .76 * x + (random() - .5) * .20 / columns + (y - .5) * .10 * (random() - .5),
        y: .12 + .76 * y + (random() - .5) * .20 / rows };
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
    const candidates = Array.from({ length: count }, (_, index) => index);
    while (order.length < moves && candidates.length) {
      const [index] = candidates.splice(Math.floor(random() * candidates.length), 1);
      for (let sample = 0; sample < 24; sample++) {
        const x = .06 + .88 * random(), y = .06 + .88 * random();
        if (Math.hypot(x - solution[index].x, y - solution[index].y) < .21) continue;
        if (movePoint(points, index, x, y, spacing)) {
          order.push(index);
          break;
        }
      }
    }
    const crossingCount = findCrossings(points, edges).length;
    if (crossingCount > bestCount) {
      bestCount = crossingCount;
      best = { points, edges, solution, order: order.reverse(), spacing };
    }
    if (crossingCount >= minimum) return best;
  }
  return best;
}

// The puzzle lies in one plane. A perspective camera can orbit the scene
// independently, so viewing angle and the depth of the strings cannot win a stage.
export function cameraProjection(layout, yaw, pitch) {
  const c = Math.cos(yaw), s = Math.sin(yaw), p = Math.cos(pitch), q = Math.sin(pitch);
  const distance = 2.65;
  const cx = layout.width / 2, cy = layout.height / 2;
  let size = layout.size;
  // The closest corner can grow under perspective, especially at diagonal
  // angles. Reserve a hit-target margin before mapping both draw and input.
  for (const x of [-.5, .5]) {
    for (const y of [-.5, .5]) {
      const depth = -s * x;
      const z = q * y + p * depth;
      const scale = distance / (distance - z);
      size = Math.min(size, (cx - 23) / Math.max(.001, Math.abs(c * x * scale)),
        (cy - 23) / Math.max(.001, Math.abs((p * y - q * depth) * scale)));
    }
  }
  size = Math.max(1, size);
  return {
    project(point, height = 0) {
      const x = point.x - .5, y = point.y - .5;
      const depth = -s * x + c * height;
      const z = q * y + p * depth;
      const scale = distance / (distance - z);
      return { x: cx + (c * x + s * height) * size * scale,
        y: cy + (p * y - q * depth) * size * scale, z, scale };
    },
    unproject(point) {
      const x = (point.x - cx) / size, y = (point.y - cy) / size;
      const a = c - x * p * s / distance, b = x * q / distance;
      const d = q * s - y * p * s / distance, e = p + y * q / distance;
      const determinant = a * e - b * d;
      if (Math.abs(determinant) < .065) return null;
      return { x: .5 + (x * e - b * y) / determinant, y: .5 + (a * y - x * d) / determinant };
    },
  };
}