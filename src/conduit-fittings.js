const quarterTurn = Math.PI / 2;
const axes = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const center = 50;
let rustImage;

function point(side, distance) {
  const [x, y] = axes[side];
  return [center + x * distance, center + y * distance];
}

function tubePath(sides) {
  const path = new Path2D();
  path.moveTo(...point(sides[0], 50));
  if (sides.length === 1) {
    path.lineTo(center, center);
  } else {
    if ((sides[1] - sides[0]) % 2) {
      path.lineTo(...point(sides[0], 21));
      path.quadraticCurveTo(center, center, ...point(sides[1], 21));
    }
    path.lineTo(...point(sides[1], 50));
  }
  return path;
}

function stroke(ctx, path, color, width, shift = 0) {
  ctx.save();
  ctx.translate(shift, shift);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke(path);
  ctx.restore();
}

function paintTube(ctx, sides, iron) {
  const path = tubePath(sides);
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.shadowColor = '#100c0994';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 3;
  stroke(ctx, path, '#241b16', 24);
  ctx.shadowColor = 'transparent';
  stroke(ctx, path, iron, 22);
  stroke(ctx, path, '#130f0d78', 22);
  stroke(ctx, path, '#e5bd9540', 17, -1);
  stroke(ctx, path, '#eee0bc36', 9, -3);
  stroke(ctx, path, '#ffefcd40', 2, -6);
  ctx.restore();
}

function bolt(ctx, x, y, radius) {
  ctx.beginPath();
  for (let corner = 0; corner < 6; corner++) {
    const angle = Math.PI * corner / 3;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fillStyle = '#33231c';
  ctx.fill();
  ctx.strokeStyle = '#d0a17e';
  ctx.lineWidth = .65;
  ctx.stroke();
}

function paintCollar(ctx, side, distance, iron, closed = false) {
  ctx.save();
  ctx.translate(center, center);
  ctx.rotate(side * quarterTurn);
  ctx.translate(0, -distance);
  const lip = ctx.createLinearGradient(-15, 0, 15, 0);
  lip.addColorStop(0, '#201511ed');
  lip.addColorStop(.25, '#d8ae896b');
  lip.addColorStop(.47, '#f6d6aa84');
  lip.addColorStop(.73, '#734c335c');
  lip.addColorStop(1, '#1b120ee3');
  const collar = new Path2D();
  collar.roundRect(-14.5, -5.5, 29, 11, 2.4);
  ctx.fillStyle = iron;
  ctx.fill(collar);
  ctx.fillStyle = lip;
  ctx.fill(collar);
  ctx.strokeStyle = '#271912';
  ctx.lineWidth = .9;
  ctx.stroke(collar);
  ctx.fillStyle = closed ? '#2b1c17' : '#302019a6';
  ctx.fillRect(-13, -1, 26, closed ? 3 : 1.6);
  bolt(ctx, -11.2, 1.3, 2.4);
  bolt(ctx, 11.2, 1.3, 2.4);
  ctx.restore();
}

function paintValve(ctx, iron) {
  ctx.save();
  ctx.translate(center, center);
  ctx.beginPath();
  ctx.arc(0, 0, 13.5, 0, Math.PI * 2);
  ctx.fillStyle = iron;
  ctx.fill();
  ctx.strokeStyle = '#322017';
  ctx.lineWidth = 2.3;
  ctx.stroke();
  const wheel = new Path2D();
  wheel.arc(0, 0, 12.6, 0, Math.PI * 2);
  for (let spoke = 0; spoke < 3; spoke++) {
    const angle = spoke * Math.PI * 2 / 3 - quarterTurn;
    wheel.moveTo(0, 0);
    wheel.lineTo(Math.cos(angle) * 12, Math.sin(angle) * 12);
  }
  stroke(ctx, wheel, '#421c14', 5);
  stroke(ctx, wheel, '#a84932', 3.3);
  stroke(ctx, wheel, '#eda575a1', .8, -.8);
  bolt(ctx, 0, 0, 4);
  ctx.restore();
}

function paintFitting(canvas, mask, source, index, texture) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.clearRect(0, 0, 100, 100);
  const iron = texture ? ctx.createPattern(texture, 'repeat') : null;
  iron?.setTransform(new DOMMatrix().translate(-index * 29, -index * 43).scale(.62));
  const material = iron ?? '#92755d';
  const sides = axes.map((_, side) => side).filter(side => mask & (1 << side));
  if (sides.length <= 2) {
    paintTube(ctx, sides, material);
  } else {
    const main = sides.find(side => sides.includes((side + 2) % 4));
    const through = [main, (main + 2) % 4];
    for (const side of sides.filter(side => !through.includes(side))) paintTube(ctx, [side], material);
    paintTube(ctx, through, material);
    for (const side of sides) paintCollar(ctx, side, 17, material);
  }
  for (const side of sides) paintCollar(ctx, side, 44, material);
  if (sides.length === 1 && !source) paintCollar(ctx, sides[0], 1, material, true);
  if (source) paintValve(ctx, material);
}

export function createConduitFitting(mask, source, index) {
  const canvas = document.createElement('canvas');
  canvas.className = 'conduit-fitting';
  canvas.width = canvas.height = 200;
  if (!rustImage) {
    rustImage = new Image();
    // Poly Haven Metal Plate 02 (CC0).
    rustImage.src = '/textures/conduit-iron.webp';
  }
  paintFitting(canvas, mask, source, index, rustImage.naturalWidth ? rustImage : null);
  if (!rustImage.complete) {
    rustImage.addEventListener('load', () => {
      if (canvas.isConnected) paintFitting(canvas, mask, source, index, rustImage);
    }, { once: true });
  }
  return canvas;
}
