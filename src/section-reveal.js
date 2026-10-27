// Soft baseline type and depth/mask reveals from the Sybiosme study.
// Each word has one accessible source; preview motion keeps its inner owner.
export function createSectionReveal({ animateElement, desktop }) {
  const prepared = new Map();
  let snapshots = new Map();
  const textSelector = '#about-statement, #about-copy p, #about-draft, .social-item dt, .social-link > span:not(.social-arrow), .featured-caption h3, .featured-caption p, .project-title, .project-kind, .project-status, .project-note';

  function makeWord(token) {
    const mask = document.createElement('span');
    mask.className = 'section-word-mask';
    const word = document.createElement('span');
    word.className = 'section-word';
    word.textContent = token;
    mask.append(word);
    return mask;
  }

  function prepare(panel) {
    if (prepared.has(panel)) return prepared.get(panel);
    const groups = [...panel.querySelectorAll(textSelector)].filter(element => !element.hidden);
    groups.forEach(element => {
      element.dataset.sectionDisplay=String(element.matches('#about-statement, .project-title, .featured-caption h3'));
      if (element.children.length||element.dataset.sectionDisplay!=='true') return;
      element.replaceChildren(...element.textContent.split(/(\s+)/).map(token =>
        token.trim() ? makeWord(token) : token));
    });
    const media = [...panel.querySelectorAll('.featured-preview, .project-image-button')].map(element => {
      const image = element.querySelector('[data-preview-content]') || element.querySelector('img');
      if (!image) return { element };
      const frame = document.createElement('span');
      frame.className = 'section-media-frame';
      image.before(frame);
      frame.append(image);
      return { element, frame, image, arrow: element.querySelector('.preview-open') };
    });
    const result = { groups, media };
    prepared.set(panel, result);
    return result;
  }
  function inViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }
  function freeze(panel) {
    snapshots = new Map();
    if (typeof getComputedStyle !== 'function') return;
    const content = prepared.get(panel);
    if (!content) return;
    const sample = element => {
      const style = getComputedStyle(element);
      snapshots.set(element, { transform: style.transform, opacity: style.opacity || '1',clipPath:style.clipPath||'none' });
    };
    content.groups.forEach(group => {const words=[...group.querySelectorAll('.section-word')];(group.dataset.sectionDisplay==='true'&&words.length?words:[group]).forEach(sample);});
    content.media.forEach(({ frame, image }) => { if (frame) { sample(frame); sample(image); } });
  }
  function reset() { /* Filled effects are cancelled by the shared navigation owner. */ }
  function play(panel, entering, footer) {
    const { groups, media } = prepare(panel);
    const motions = [];
    const easing = entering?'cubic-bezier(.22,1,.36,1)':'cubic-bezier(.5,0,.75,.35)';
    const run = (element, frames, duration, delay = 0) => {
      const motion = animateElement(element, frames, { duration, delay, easing, fill: 'both' });
      if (motion) motions.push(motion);
    };
    groups.filter(inViewport).forEach((group, groupIndex) => {
      const words=[...group.querySelectorAll('.section-word')],targets=group.dataset.sectionDisplay==='true'&&words.length?words:[group];
      const display=group.dataset.sectionDisplay==='true',groupDelay=entering?Math.min(groupIndex*40,120):0;
      const step=display?18:Math.min(4,65/Math.max(1,targets.length-1));
      targets.forEach((word,index)=>{
        const rest={transform:'translate3d(0,0,0) rotate(0deg)',opacity:1};
        const away={transform:entering?'translate3d(0,112%,0) rotate(3deg)':'translate3d(0,-70%,0) rotate(-2deg)',opacity:0};
        run(word,entering?[away,rest]:[snapshots.get(word)||rest,away],
          entering?(display?(desktop.matches?930:700):(desktop.matches?720:520)):(display?230:180),
          groupDelay+(entering?Math.min(index*step,display?120:65):0));
      });
    });
    media.filter(({ element }) => inViewport(element)).forEach(({ element, frame, image, arrow }, index) => {
      const duration = entering ? (desktop.matches ? 1050 : 780) : 300;
      const delay = entering ? Math.min(index*80, 160) : 0;
      if (frame) {
        const rest={transform:'perspective(1200px) translate3d(0,0,0) rotateX(0deg) scale(1)',clipPath:'inset(0% 0% 0% 0% round 18px)',opacity:1};
        const maskAway={transform:entering?'perspective(1200px) translate3d(0,8%,0) rotateX(-8deg) scale(.96)':'perspective(1200px) translate3d(0,-3%,0) rotateX(5deg) scale(.99)',clipPath:'inset(0% 0% 100% 0% round 18px)',opacity:1};
        const imageRest={transform:'translate3d(0,0,0) scale(1)',opacity:1};
        const imageAway={transform:entering?'translate3d(0,-4%,0) scale(1.07)':'translate3d(0,2%,0) scale(1.025)',opacity:1};
        run(frame,entering?[maskAway,rest]:[snapshots.get(frame)||rest,maskAway],duration,delay);
        run(image,entering?[imageAway,imageRest]:[snapshots.get(image)||imageRest,imageAway],duration,delay);
      } else run(element, entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], duration, delay);
      if (arrow) run(arrow, entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], 200, delay);
    });
    if (footer && !footer.hidden && inViewport(footer)) {
      [...footer.children].forEach((element, index) => run(element,
        entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
        entering ? 450 : 180, entering ? 100 + index*25 : 0));
    }
    if (!motions.length) run(panel, entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], 240);
    snapshots.clear();
    return Promise.allSettled(motions.map(motion => motion.finished));
  }
  return { prepare, play, freeze, reset, destroy() { reset(); prepared.clear(); snapshots.clear(); } };
}
