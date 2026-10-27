// Fold shading and the attached tip light use the exact same path/phase data.
export function clothEdgeFrames(geometry) {
  const point = p => p.map(n => Number(n.toFixed(2))).join(' ');
  return geometry.map(({ offset, points: p }) => ({
    offset,
    d: `path("M ${point(p[1])} C ${point(p[2])} ${point(p[3])} ${point(p[4])}")`,
    opacity: offset === 0 || offset === 1 ? 0 : 1,
  }));
}
export function clothTipFrames(geometry) {
  return geometry.map(({ offset, points: p }) => {
    const angle = Math.atan2(p[2][1] - p[1][1], p[2][0] - p[1][0]) * 180 / Math.PI;
    return {
      offset,
      transform: `translate(${p[1][0]}px,${p[1][1]}px) rotate(${angle}deg)`,
      opacity: offset === 0 || offset === 1 ? 0 : offset < .5 ? .65 : 1,
    };
  });
}

export function createThemeCloth(geometry) {
  if (typeof document.createElementNS !== 'function') return null;
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag, attrs = {}) => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  };
  const svg = make('svg', { class: 'theme-cloth', 'aria-hidden': 'true', focusable: 'false' });
  const defs = make('defs');
  const light = make('radialGradient', { id: 'theme-cloth-light' });
  [[0,'#fff',.95],[.2,'#fff',.65],[.5,'var(--accent)',.3],[1,'var(--accent)',0]].forEach(([offset,color,opacity]) => {
    light.append(make('stop', { offset, 'stop-color': color, 'stop-opacity': opacity }));
  });
  defs.append(light); svg.append(defs);
  const edges = [
    make('path', { class: 'theme-cloth-shadow', fill: 'none', 'stroke-linecap': 'round' }),
    make('path', { class: 'theme-cloth-fold', fill: 'none', 'stroke-linecap': 'round' }),
    make('path', { class: 'theme-cloth-edge', fill: 'none', 'stroke-linecap': 'round' }),
  ];
  edges.forEach(edge => svg.append(edge));
  const tip = make('g', { class: 'theme-cloth-tip' });
  tip.append(make('ellipse', { rx: 44, ry: 25, fill: 'url(#theme-cloth-light)' }));
  tip.append(make('path', { d: 'M -8 0 Q 0 -3 8 0', fill: 'none', stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round' }));
  svg.append(tip);
  // Empty at capture time; lighting begins only with the actual pull.
  edges.forEach(edge => { edge.style.opacity = '0'; }); tip.style.opacity = '0';
  document.body.append(svg);
  const animations = [];
  return {
    play(options) {
      const edgeFrames = clothEdgeFrames(geometry), tipFrames = clothTipFrames(geometry);
      [...edges.map(edge => [edge, edgeFrames]), [tip, tipFrames]].forEach(([element, frames]) => {
        if (typeof element.animate !== 'function') return;
        const animation = element.animate(frames, options);
        animation.finished.catch(() => {});
        animations.push(animation);
      });
    },
    destroy() { animations.forEach(animation => animation.cancel()); svg.remove(); },
  };
}
