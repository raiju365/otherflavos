// Layout switches once. Native FLIP effects retain the currently painted
// portrait/type positions while the header height carries the tabs with it.
export function headerFlip(from, to, box = to) {
  const sx = from.width / to.width, sy = from.height / to.height;
  const x = from.left - box.left - sx * (to.left - box.left);
  const y = from.top - box.top - sy * (to.top - box.top);
  const n = value => Number(value.toFixed(5));
  return `translate(${n(x)}px, ${n(y)}px) scale(${n(sx)}, ${n(sy)})`;
}

export function createMobileHeaderMotion({ desktop, reduced }) {
  const header = document.querySelector('.profile-sticky');
  const photo = header?.querySelector('.figure-wrap');
  const name = header?.querySelector('.identity h1');
  const meta = header?.querySelector('.identity-meta');
  let active = null, destroyed = false;
  const enabled = () => !destroyed && !desktop.matches && !reduced.matches && !document.hidden
    && document.documentElement?.dataset.entry !== 'loading';
  function settle() {
    const previous = active; active = null;
    previous?.forEach(animation => animation.cancel());
  }
  function read() {
    const box = name.getBoundingClientRect();
    // A heading's block spans the column, while its actual glyphs change
    // alignment from left to center. Measure the real text, not that column.
    const range = document.createRange?.();
    range?.selectNodeContents(name);
    const text = range?.getBoundingClientRect() || box;
    return { height: header.getBoundingClientRect().height,
      photo: photo.getBoundingClientRect(), name: text, nameBox: box,
      meta: meta.getBoundingClientRect() };
  }
  return {
    capture(animate = true) {
      if (!header || !photo || !name || !meta || !animate || !enabled() || window.scrollY > 1) { settle(); return null; }
      // Read the presented rectangles before cancelling an interrupted effect.
      const from = read(); settle(); return from;
    },
    play(from) {
      if (!from || !enabled()) { settle(); return; }
      const to = read();
      if (![from.photo, to.photo, from.name, to.name, from.meta, to.meta].every(rect => rect.width > 0 && rect.height > 0)) return;
      const changed = Math.abs(from.height - to.height) > .5 || ['photo','name','meta'].some(key =>
        ['left','top','width','height'].some(prop => Math.abs(from[key][prop] - to[key][prop]) > .5));
      if (!changed || [header, photo, name, meta].some(element => typeof element.animate !== 'function')) return;
      const jobs = [];
      const timing = { duration: 420, easing: 'cubic-bezier(.2,0,.2,1)', fill: 'none' };
      const startTime = header.ownerDocument?.timeline?.currentTime;
      const animate = (element, frames) => {
        const job = element.animate(frames, timing); jobs.push(job);
        if (typeof startTime === 'number') job.startTime = startTime;
        job.finished.catch(() => {});
      };
      try {
        animate(header, [{ height: `${from.height}px` }, { height: `${to.height}px` }]);
        for (const [key, element] of [['photo', photo], ['name', name], ['meta', meta]]) {
          animate(element, [
            { transformOrigin: '0 0', transform: headerFlip(from[key], to[key], key === 'name' ? to.nameBox : to[key]) },
            { transformOrigin: '0 0', transform: 'translate(0px, 0px) scale(1, 1)' },
          ]);
        }
        active = jobs;
        Promise.all(jobs.map(job => job.finished)).then(() => { if (active === jobs) settle(); },
          () => { if (active === jobs) settle(); });
      } catch { jobs.forEach(job => job.cancel()); }
    },
    settle,
    destroy() { destroyed = true; settle(); },
  };
}
