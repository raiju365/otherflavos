export function settleBeforeDeadline(promise, timeout, signal) {
  return new Promise(resolve => {
    let timer, settled = false;
    const finish = result => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = () => finish({ ok: false, reason: 'aborted' });
    if (signal.aborted) { Promise.resolve(promise).catch(() => {}); abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeout);
    Promise.resolve(promise).then(value => finish({ ok: true, value }), () => finish({ ok: false, reason: 'error' }));
  });
}

export async function prepareEntryFonts(signal) {
  let result;
  if (!document.fonts?.load) result = { ok: false, reason: 'unsupported' };
  else {
    // Only request faces used by the entry destination, not every hidden section.
    const faces = ['500 24px "Overused Grotesk"'];
    result = await settleBeforeDeadline(Promise.all(faces.map(face => document.fonts.load(face)))
      .then(() => document.fonts.ready), 6000, signal);
  }
  if (!result.ok && !signal.aborted) document.documentElement.dataset.entryFontFallback = 'true';
  return result;
}

export function collectEntryImages() {
  const panel = [...document.querySelectorAll('.panel')].find(element => !element.hidden);
  if (!panel) return [];
  return [...panel.querySelectorAll('img')].filter((image, index) => {
    if (index === 0) return true;
    const rect = image.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight + 160 && rect.right > 0 && rect.left < window.innerWidth;
  });
}

async function decodeImage(image, signal, timeout) {
  let removeListeners = () => {};
  const loaded = image.complete ? Promise.resolve(image.naturalWidth > 0) : new Promise(resolve => {
    const yes = () => resolve(true), no = () => resolve(false);
    image.addEventListener('load', yes, { once: true });
    image.addEventListener('error', no, { once: true });
    removeListeners = () => { image.removeEventListener('load', yes); image.removeEventListener('error', no); };
  });
  const result = await settleBeforeDeadline(loaded.then(async success => {
    if (!success) throw new Error('Image unavailable');
    if (typeof image.decode === 'function') await image.decode();
  }), timeout, signal);
  removeListeners();
  return result;
}

export async function prepareEntryImage(image, signal) {
  image.loading = 'eager';
  const result = await decodeImage(image, signal, 5000);
  if (result.ok || signal.aborted) return result;
  image.dataset.entryFallback = 'true';
  image.src = '/projects/website.svg';
  image.alt = 'Preview sementara — aset proyek belum tersedia';
  const fallback = await decodeImage(image, signal, 1500);
  if (!fallback.ok && !signal.aborted) {
    const replacement = document.createElement('span');
    replacement.className = 'entry-image-unavailable';
    replacement.textContent = 'Preview unavailable';
    replacement.setAttribute('role', 'img'); replacement.setAttribute('aria-label', 'Project preview unavailable');
    const ratio = getComputedStyle(image).aspectRatio;
    replacement.style.aspectRatio = ratio && ratio !== 'auto' ? ratio : '16 / 9';
    image.after(replacement); image.hidden = true;
  }
  return { ...fallback, fallback: true };
}

export async function prepareEntryAssets({ signal, fontsReady, figureReady, onProgress }) {
  const images = collectEntryImages();
  const tasks = [fontsReady, settleBeforeDeadline(figureReady, 5000, signal), ...images.map(image => prepareEntryImage(image, signal))];
  let completed = 0;
  onProgress(0);
  const results = await Promise.all(tasks.map(task => Promise.resolve(task).then(result => {
    completed++; onProgress(Math.floor(completed/tasks.length*100)); return result;
  })));
  return { count: tasks.length, fallbackCount: results.filter(result => !result.ok || result.fallback || result.value?.fallback).length };
}
