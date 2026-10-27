export const portraitSource = '/profile/selfphoto.png';
export const portraitSize = { width: 200, height: 216 };

// Frame the supplied photograph around the head and shoulders, excluding its
// empty upper area. Keep the source file and transparent silhouette untouched.
export function portraitCrop(width, height) {
  const x = width * .15, y = height * .29;
  const cropWidth = Math.min(width * .72, (height - y) * portraitSize.width / portraitSize.height);
  return { x, y, width: cropWidth, height: cropWidth * portraitSize.height / portraitSize.width };
}

export function portraitPoints(pixels, width, height, step = 1.6) {
  const points = [];
  for (let y = step / 2; y < height; y += step) for (let x = step / 2; x < width; x += step) {
    const i = (Math.floor(y) * width + Math.floor(x)) * 4;
    const alpha = pixels[i + 3] / 255;
    // Transparent pixels in the PNG retain old RGB values: never draw them.
    if (alpha < .08) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const light = (.2126 * r + .7152 * g + .0722 * b) / 255;
    points.push({ x, y, alpha, radius: step * (.4 + .07 * Math.sqrt(light)), color: `rgb(${r} ${g} ${b})` });
  }
  return points;
}
