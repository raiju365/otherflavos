export const portraitSource = '/profile/selfphoto.png';
export const portraitSize = { width: 200, height: 250 };
export const portraitPatternFrames = 8;
const patternPeriod = 4200;

export function portraitCrop(width, height) {
  const x = width * .24;
  const y = height * .265;
  const cropWidth = Math.min(width * .52, (height - y) * portraitSize.width / portraitSize.height);
  return { x, y, width: cropWidth, height: cropWidth * portraitSize.height / portraitSize.width };
}

const clamp = value => Math.max(0, Math.min(1, value));
function smooth(low, high, value) {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
}

function softenLuminance(source, width, height, radius) {
  const horizontal = new Float32Array(source.length);
  const softened = new Float32Array(source.length);
  for (let y = 0; y < height; y++) {
    const start = y * width;
    for (let x = 0; x < width; x++) {
      horizontal[start + x] = (
        source[start + Math.max(0, x - radius)] +
        source[start + x] * 2 +
        source[start + Math.min(width - 1, x + radius)]
      ) * .25;
    }
  }
  for (let y = 0; y < height; y++) {
    const above = Math.max(0, y - radius) * width;
    const below = Math.min(height - 1, y + radius) * width;
    const start = y * width;
    for (let x = 0; x < width; x++) {
      softened[start + x] = (horizontal[above + x] + horizontal[start + x] * 2 + horizontal[below + x]) * .25;
    }
  }
  return softened;
}

const distanceToLine = phase => Math.abs(phase - Math.round(phase));

// Work in the same 200 × 250 coordinates at every pixel density, so the
// engraving retains the same spacing while its thin lines stay antialiased.
export function engravePortrait(pixels, width, height) {
  const luma = new Float32Array(width * height);
  const masks = Array.from({ length: portraitPatternFrames }, () => new Uint8ClampedArray(luma.length));
  for (let i = 0; i < luma.length; i++) {
    const offset = i * 4;
    const alpha = pixels[offset + 3] / 255;
    const tone = (pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722) / 255;
    luma[i] = tone * alpha + .55 * (1 - alpha);
  }
  const scale = portraitSize.width / width;
  const soft = softenLuminance(luma, width, height, Math.max(1, Math.round(2.2 / scale)));
  for (let y = 0; y < height; y++) {
    const v = (y + .5) * portraitSize.height / height;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const alpha = pixels[i * 4 + 3];
      if (!alpha) continue;
      const u = (x + .5) * scale;
      const light = .67 * luma[i] + .33 * soft[i];
      const shade = clamp((.68 - light) / .66);
      const field = v + (u - 100) * .26 + 10 * Math.sin(u * .034 + v * .014) + soft[i] * 21;
      const spacing = 4.5;
      const lineEdge = .07 + shade * .14;
      const edgeSoftness = Math.max(.09, scale / spacing);
      const contour = 1 - smooth(.04, .19, distanceToLine(soft[i] * 8.6 + .13));
      const key = .12 * shade + .22 * smooth(.22, .52, shade) + .32 * smooth(.62, .95, shade);
      const hatch = (.14 + .37 * shade) * smooth(.06, .26, shade);
      const cut = contour * .13 * smooth(.23, .43, shade) * (1 - smooth(.79, .94, shade));
      // The contours and tonal values stay anchored. Only the hatching phase changes.
      const phase = field / spacing;
      for (let frame = 0; frame < masks.length; frame++) {
        const distance = distanceToLine(phase - frame / masks.length);
        const line = 1 - smooth(lineEdge - edgeSoftness, lineEdge + edgeSoftness, distance);
        masks[frame][i] = alpha * clamp(key + hatch * line + cut);
      }
    }
  }
  return masks;
}

export function portraitPatternPosition(elapsed) {
  return (Math.max(0, elapsed) % patternPeriod) / patternPeriod * portraitPatternFrames;
}
