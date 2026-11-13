import { engravePortrait, portraitCrop, portraitSize, portraitSource, portraitPatternFrames, portraitPatternPosition } from './portrait-image.js';

const rasterScale = 2;
const atlasColumns = 4;
const tilePadding = 4;

export async function initFigure(canvas, signal) {
  if (!canvas || signal.aborted) return () => {};
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return () => {};

  const { width, height } = portraitSize;
  const pixelWidth = width * rasterScale;
  const pixelHeight = height * rasterScale;
  const image = new Image();
  image.decoding = 'async';
  image.src = portraitSource;
  await image.decode();
  if (signal.aborted) return () => {};

  const sample = document.createElement('canvas');
  const atlas = document.createElement('canvas');
  const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
  const atlasCtx = atlas.getContext('2d');
  if (!sampleCtx || !atlasCtx) return () => {};

  sample.width = pixelWidth;
  sample.height = pixelHeight;
  // Keep neighboring phases out of the sampling footprint on small screens.
  const tileWidth = pixelWidth + tilePadding * 2;
  const tileHeight = pixelHeight + tilePadding * 2;
  atlas.width = tileWidth * atlasColumns;
  atlas.height = tileHeight * Math.ceil(portraitPatternFrames / atlasColumns);
  const tileX = index => index % atlasColumns * tileWidth + tilePadding;
  const tileY = index => Math.floor(index / atlasColumns) * tileHeight + tilePadding;
  const crop = portraitCrop(image.naturalWidth, image.naturalHeight);
  sampleCtx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, pixelWidth, pixelHeight);
  try {
    const masks = engravePortrait(sampleCtx.getImageData(0, 0, pixelWidth, pixelHeight).data, pixelWidth, pixelHeight);
    const tile = atlasCtx.createImageData(pixelWidth, pixelHeight);
    for (let frame = 0; frame < masks.length; frame++) {
      const mask = masks[frame];
      for (let i = 0; i < mask.length; i++) tile.data[i * 4 + 3] = mask[i];
      atlasCtx.putImageData(tile, tileX(frame), tileY(frame));
    }
  } catch {
    atlas.width = atlas.height = 1;
    return () => {};
  } finally {
    sample.width = sample.height = 1;
  }

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const listeners = new AbortController();
  const dialog = document.querySelector('#project-detail');
  let frame = 0, visible = true, pageActive = true, disposed = false, sectionMoving = false;
  let elapsed = 0, lastTime = null, lastPaint = null, interval = 1000 / 24;
  let inkColor = '';
  const on = (target, type, listener) => target?.addEventListener(type, listener, {
    signal: listeners.signal, passive: true,
  });

  function drawFrame(index) {
    ctx.drawImage(atlas, tileX(index), tileY(index), pixelWidth, pixelHeight, 0, 0, width, height);
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const position = motion.matches || forced.matches ? 0 : portraitPatternPosition(elapsed);
    const first = Math.floor(position);
    const blend = position - first;
    ctx.globalAlpha = 1 - blend;
    drawFrame(first);
    if (blend > 0) {
      // Add weighted alpha from the adjacent frame with identical registration.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = blend;
      drawFrame((first + 1) % portraitPatternFrames);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = inkColor;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  function palette() {
    if (!disposed) inkColor = getComputedStyle(canvas).color;
  }

  function resize() {
    if (disposed) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const displayWidth = canvas.clientWidth || width;
    const w = Math.max(1, Math.round(displayWidth * ratio));
    const h = Math.max(1, Math.round((canvas.clientHeight || height) * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(w / width, 0, 0, h / height, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    interval = 1000 / (displayWidth < 140 ? 18 : 24);
    palette();
    draw();
  }

  const active = () => !disposed && visible && pageActive && !sectionMoving && !document.hidden
    && !motion.matches && !forced.matches && !dialog?.open
    && document.documentElement.dataset.entry !== 'loading'
    && document.documentElement.dataset.galleryMoving !== 'true';

  function wake() {
    if (active() && !frame) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (!active()) {
      lastTime = lastPaint = null;
      return;
    }
    if (lastTime !== null) elapsed += Math.max(0, Math.min(100, now - lastTime));
    lastTime = now;
    if (lastPaint === null || now - lastPaint >= interval) {
      draw();
      lastPaint = lastPaint === null ? now : now - (now - lastPaint) % interval;
    }
    wake();
  }
  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = lastPaint = null;
    if (disposed) return;
    draw();
    wake();
  }

  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }) : null;
  observer?.observe(canvas);
  const sizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  sizeObserver?.observe(canvas);
  const attributes = typeof MutationObserver === 'function' ? new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'data-theme')) palette();
    if (records.some(record => record.attributeName !== 'data-theme')) sync();
    else draw();
  }) : null;
  attributes?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-gallery-moving', 'data-entry'] });
  if (dialog) attributes?.observe(dialog, { attributes: true, attributeFilter: ['open'] });

  on(window, 'resize', resize);
  on(document, 'visibilitychange', sync);
  on(document, 'portfolio:entryready', sync);
  on(document, 'portfolio:gallerymotion', sync);
  on(document, 'portfolio:sectionstart', () => { sectionMoving = true; sync(); });
  on(document, 'portfolio:sectionsettled', () => { sectionMoving = false; sync(); });
  on(motion, 'change', sync);
  on(forced, 'change', () => { palette(); sync(); });
  on(window, 'pagehide', () => { pageActive = false; sync(); });
  on(window, 'pageshow', () => { pageActive = true; sync(); });

  function destroy() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    frame = 0;
    observer?.disconnect();
    sizeObserver?.disconnect();
    attributes?.disconnect();
    listeners.abort();
    signal.removeEventListener('abort', destroy);
    atlas.width = atlas.height = 1;
  }

  signal.addEventListener('abort', destroy, { once: true });
  resize();
  wake();
  return destroy;
}
