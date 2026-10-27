// Three overlapping, feathered exposures. Only the old palette is masked;
// content geometry and the independently live glass control never move.
export function themeInkField({ x, y, width, height }) {
  const w = Math.max(1, width), h = Math.max(1, height);
  return {
    // Even the narrow axis of the 62% transparent core covers the diagonal.
    radius: Math.ceil(Math.hypot(w, h) * 2.3),
    seeds: [
      [Math.max(0, Math.min(w, x)), Math.max(0, Math.min(h, y))],
      [w * .48, h * .48],
      [w * .84, h * .2],
    ],
  };
}

export function themeInkFrames(settings) {
  const { radius } = themeInkField(settings);
  const phases = [
    [0, 0, 0, 0],
    [.18, .025, 0, 0],
    [.44, .19, .08, .015],
    [.73, .48, .36, .21],
    [1, 1, .83, .7],
  ];
  return phases.map(([offset, a, b, c]) => ({
    offset,
    '--theme-ink-a': `${Math.max(1, radius * a).toFixed(2)}px`,
    '--theme-ink-b': `${Math.max(1, radius * b).toFixed(2)}px`,
    '--theme-ink-c': `${Math.max(1, radius * c).toFixed(2)}px`,
  }));
}
