import { portraitSource, portraitSize, portraitCrop, portraitEffect } from './portrait-image.js';

// Full-opacity original photo inside the clean monochrome studio oval.
export async function initFigure(canvas, signal) {
  if (!canvas || signal.aborted) return () => {};
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return () => {};
  const { width, height } = portraitSize;
  const stamp = document.createElement('canvas'), ink = stamp.getContext('2d');
  if (!ink) return () => {};
  const image = new Image();
  image.decoding = 'async';
  image.src = portraitSource;
  await image.decode();
  if (signal.aborted) return () => {};
  const crop = portraitCrop(image.naturalWidth, image.naturalHeight);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  let frame = 0, visible = true, pageActive = true, disposed = false, sectionMoving=false;
  let targetX = 0, targetY = 0, rx = 0, ry = 0;
  function draw() {
    ctx.clearRect(0, 0, width, height);
    const fx = portraitEffect({ rx, ry, elapsed:0, still: motion.matches });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(stamp, fx.x, fx.y, width, height);
  }
  function resize() {
    if (disposed) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    stamp.width = canvas.width; stamp.height = canvas.height;
    ink.setTransform(stamp.width / width, 0, 0, stamp.height / height, 0, 0);
    ink.imageSmoothingEnabled = true;
    ink.imageSmoothingQuality = 'high';
    ink.globalAlpha = 1;
    ink.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    draw();
  }
  const active=()=>!disposed&&visible&&pageActive&&!sectionMoving&&!document.hidden&&!motion.matches
    &&document.documentElement.dataset.entry!=='loading'
    &&document.documentElement.dataset.themeControlOpen!=='true'&&document.documentElement.dataset.galleryMoving!=='true';
  const unsettled=()=>Math.abs(targetX-rx)>.001||Math.abs(targetY-ry)>.001;
  function wake(){if(active()&&!frame&&unsettled())frame=requestAnimationFrame(tick);}
  const tick = () => {
    frame = 0;
    if(!active())return;
    rx+=(targetX-rx)*.18;ry+=(targetY-ry)*.18;
    if(!unsettled()){rx=targetX;ry=targetY;}
    draw();wake();
  };
  const sync = () => {
    cancelAnimationFrame(frame); frame = 0;
    if (disposed) return;
    draw();
    wake();
  };
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting; sync();
  }) : null;
  observer?.observe(canvas);
  const on = (target, type, listener) => target.addEventListener(type, listener, { signal: listeners.signal });
  on(window, 'resize', resize);
  on(document, 'visibilitychange', sync);
  on(document, 'portfolio:entryready', sync);
  on(document, 'portfolio:themecontrol', sync);
  on(document, 'portfolio:gallerymotion', sync);
  on(document, 'portfolio:sectionstart',()=>{sectionMoving=true;sync();});
  on(document, 'portfolio:sectionsettled',()=>{sectionMoving=false;sync();});
  on(motion, 'change', sync);
  on(window, 'pagehide', () => { pageActive = false; sync(); });
  on(window, 'pageshow', () => { pageActive = true; sync(); });
  on(canvas.parentElement, 'pointermove', event => {
    if (event.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    targetX = Math.max(-.5, Math.min(.5, (event.clientX - rect.left) / rect.width - .5));
    targetY = Math.max(-.5, Math.min(.5, (event.clientY - rect.top) / rect.height - .5));
    wake();
  });
  on(canvas.parentElement, 'pointerleave', () => { targetX = 0; targetY = 0; wake(); });
  on(window, 'blur', () => { targetX = 0; targetY = 0; sync(); });
  function destroy() {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame); frame = 0;
    observer?.disconnect();
    listeners.abort();
    signal.removeEventListener('abort', destroy);
    stamp.width = stamp.height = 1;
  }
  signal.addEventListener('abort', destroy, { once: true });
  resize(); sync();
  return destroy;
}
