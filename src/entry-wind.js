const mixPoint = (a, b, t) => a.map((n, i) => n + (b[i] - n)*t);
function split(curve, t) {
  const a = mixPoint(curve[0], curve[1], t), b = mixPoint(curve[1], curve[2], t), c = mixPoint(curve[2], curve[3], t);
  const d = mixPoint(a, b, t), e = mixPoint(b, c, t), f = mixPoint(d, e, t);
  return [[curve[0], a, d, f], [f, e, c, curve[3]]];
}
export function windCurves(state, compact = false) {
  if (state.wind < .015) return [];
  return Array.from({ length: compact ? 2 : 3 }, (_, i) => {
    const side = i%2 ? -1 : 1, lane = Math.floor(i/2);
    const flow = (state.t*2.4 + i*.173)%1, start = Math.max(0, flow - .32);
    const curve = [[-1.7, side*(.12 + lane*.11)], [-.95, side*(1.32 + lane*.13)], [.7, side*(1.2 + lane*.12)], [1.65, side*(.05 + lane*.16)]];
    const first = split(curve, flow)[0];
    return { points: flow > 0 ? split(first, start/flow)[1] : first,
      alpha: state.wind*Math.sin(Math.PI*flow)*(.13 - lane*.025), width: .65 + lane*.2, angle: state.windAngle };
  });
}
export function createWindRenderer(canvas, { size, ratio, compact }) {
  let ctx; try { ctx = canvas?.getContext('2d', { alpha: true }); } catch { /* Optional air layer. */ }
  if (!ctx || typeof ctx.bezierCurveTo !== 'function') return { draw() {}, destroy() { if (canvas) { canvas.width = 1; canvas.height = 1; } } };
  canvas.width = Math.round(size*ratio); canvas.height = Math.round(size*ratio);
  return {
    draw(state) {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, size, size);
      ctx.save(); ctx.translate(size/2, size/2); ctx.scale(size*.235, size*.235);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const air of windCurves(state, compact)) {
        ctx.save(); ctx.rotate(air.angle);
        const [a, b, c, d] = air.points;
        const shade = ctx.createLinearGradient(...a, ...d);
        shade.addColorStop(0, 'rgba(242,247,255,0)'); shade.addColorStop(.52, `rgba(242,247,255,${air.alpha})`); shade.addColorStop(1, 'rgba(242,247,255,0)');
        ctx.strokeStyle = shade;
        ctx.beginPath(); ctx.moveTo(...a); ctx.bezierCurveTo(...b, ...c, ...d);
        ctx.lineWidth = air.width/(size*.235); ctx.shadowColor = 'rgba(235,240,255,.22)'; ctx.shadowBlur = compact ? 3 : 5; ctx.stroke();
        ctx.globalAlpha = .18; ctx.lineWidth = 8/(size*.235); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    },
    destroy() { canvas.width = 1; canvas.height = 1; },
  };
}
