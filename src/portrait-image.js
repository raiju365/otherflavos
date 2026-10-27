export const portraitSource = '/profile/selfphoto.png';
export const portraitSize = { width: 200, height: 250 };

// Tight, proportional face/shoulder crop of the user's original PNG.
export function portraitCrop(width, height) {
  const x = width * .25, y = height * .275;
  const cropWidth = Math.min(width * .5, (height - y) * portraitSize.width / portraitSize.height);
  return { x, y, width: cropWidth, height: cropWidth * portraitSize.height / portraitSize.width };
}

export function portraitEffect({ rx, ry, elapsed, still }) {
  if (still) return { x: 0, y: 0 };
  return {
    x: rx * 1.8 + Math.sin(elapsed * .00025) * .35,
    y: ry * 1.2,
  };
}
