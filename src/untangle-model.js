export const knots = [
  {
    name: 'Loop',
    points: [[.29, .12], [.75, .18], [.88, .58], [.67, .83], [.27, .88], [.12, .47]],
    displaced: { 1: [.42, .73] },
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3], [0, 2], [3, 5]],
  },
  {
    name: 'Bridge',
    points: [[.17, .27], [.49, .14], [.81, .27], [.88, .65], [.51, .85], [.14, .67], [.29, .47], [.71, .48]],
    displaced: { 1: [.36, .72], 7: [.36, .21] },
    edges: [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [0, 6], [5, 6], [1, 6], [4, 6], [1, 7], [2, 7], [3, 7], [4, 7], [6, 7],
    ],
  },
  {
    name: 'Rosette',
    points: [[.50, .08], [.78, .20], [.92, .49], [.78, .78], [.49, .91], [.21, .79], [.08, .49], [.21, .21], [.49, .49]],
    displaced: { 0: [.61, .70], 2: [.26, .59], 5: [.69, .31], 8: [.44, .29] },
    edges: [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 6], [8, 7],
    ],
  },
];

const epsilon = 1e-7;
const spacing = .12;
const clamp = value => Math.max(0, Math.min(1, value));
const cross = (x, y, u, v) => x * v - y * u;

export function startingPoints(knot) {
  return knot.points.map((point, index) => {
    const [x, y] = knot.displaced[index] ?? point;
    return { x, y };
  });
}

export function movePoint(points, index, x, y) {
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
