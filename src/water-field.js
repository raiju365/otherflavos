// A damped 2D height field at a bounded raster size. No renderer or frame owner.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = value => Number.isFinite(value) ? value : 0;
const interval = 1 / 60;

export function createWaterField(width, height) {
  width = Math.max(1, finite(width)); height = Math.max(1, finite(height));
  const columns = clamp(Math.round(width / 3), 64, 112);
  const rows = clamp(Math.round(height / (width / (columns - 1))), 28, 84);
  const length = columns * rows;
  const field = { width, height, columns, rows, current: new Float32Array(length), previous: new Float32Array(length),
    next: new Float32Array(length), damping: new Float32Array(length), ground: new Float32Array(length), active: false, accumulator: 0, magnitude: 0 };
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const index = y * columns + x, u = x / (columns - 1), v = y / (rows - 1);
    const edge = Math.min(x, y, columns - 1 - x, rows - 1 - y);
    field.damping[index] = .975 * (.77 + .23 * Math.min(1, edge / 6));
    // Broad, quiet reflections; no repeating tiled floor or dot grid.
    const band = Math.exp(-Math.pow((u * .78 + v * .44 - .62) / .19, 2));
    field.ground[index] = clamp(.035 + band * .14 + .025 * Math.sin(u * 6 - v * 4), .015, .22);
  }
  return field;
}

export function clearWater(field) {
  field.current.fill(0); field.previous.fill(0); field.next.fill(0);
  field.active = false; field.accumulator = field.magnitude = 0;
}

export function disturbWater(field, x, y, strength = 1, radius = 2.5) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(strength)) return false;
  x = clamp(x, 0, 1) * (field.columns - 1); y = clamp(y, 0, 1) * (field.rows - 1);
  strength = clamp(strength, -3, 3); radius = clamp(finite(radius), 1.4, 7);
  if (!strength) return false;
  const reach = radius * 3;
  for (let row = Math.max(1, Math.floor(y - reach)); row <= Math.min(field.rows - 2, Math.ceil(y + reach)); row++) {
    for (let column = Math.max(1, Math.floor(x - reach)); column <= Math.min(field.columns - 2, Math.ceil(x + reach)); column++) {
      const r2 = ((column - x) ** 2 + (row - y) ** 2) / (radius * radius);
      const displacement = strength * (1 - r2 * .5) * Math.exp(-r2 * .5);
      const index = row * field.columns + column;
      field.current[index] = clamp(field.current[index] + displacement, -5, 5);
      field.previous[index] = clamp(field.previous[index] + displacement * .35, -5, 5);
    }
  }
  field.active = true;
  return true;
}

export function stepWater(field, elapsed) {
  if (!field.active) return 0;
  field.accumulator = Math.min(.05, field.accumulator + clamp(finite(elapsed), 0, .05));
  let steps = 0;
  while (field.accumulator + 1e-9 >= interval && steps < 3) {
    const { columns, rows, current, previous, next, damping } = field;
    let magnitude = 0;
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < columns - 1; x++) {
      const i = y * columns + x;
      const laplacian = current[i - 1] + current[i + 1] + current[i - columns] + current[i + columns] - 4 * current[i];
      const value = (2 * current[i] - previous[i] + .46 * laplacian) * damping[i];
      next[i] = value;
      magnitude = Math.max(magnitude, Math.abs(value), Math.abs(value - current[i]));
    }
    field.previous = current; field.current = next; field.next = previous;
    field.magnitude = magnitude;
    field.accumulator = Math.max(0, field.accumulator - interval); steps++;
    if (magnitude < .0025) { clearWater(field); break; }
  }
  return steps;
}

export function paintWater(field, palette, pixels = new Uint8ClampedArray(field.columns * field.rows * 4)) {
  const { columns, rows, current, ground } = field;
  const { base, ink, shade } = palette;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const i = y * columns + x;
    const left = current[y * columns + Math.max(0, x - 1)], right = current[y * columns + Math.min(columns - 1, x + 1)];
    const above = current[Math.max(0, y - 1) * columns + x], below = current[Math.min(rows - 1, y + 1) * columns + x];
    const dx = (left - right) * 1.8, dy = (above - below) * 1.8;
    const sx = clamp(Math.round(x + dx * 11), 0, columns - 1), sy = clamp(Math.round(y + dy * 11), 0, rows - 1);
    const reflection = ground[sy * columns + sx];
    const curvature = left + right + above + below - current[i] * 4;
    const light = clamp(dx * .7 - dy * .9 + curvature * .3, -1, 1);
    const crest = Math.pow(Math.max(0, light), .8) * .82;
    const trough = Math.max(0, -light) * .7;
    for (let channel = 0; channel < 3; channel++) {
      let color = base[channel] + (ink[channel] - base[channel]) * reflection;
      color += (ink[channel] - color) * crest;
      color += (shade[channel] - color) * trough;
      pixels[i * 4 + channel] = color;
    }
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}
