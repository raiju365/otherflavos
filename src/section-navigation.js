import { createSectionReveal } from './section-reveal.js';
import { createMobileHeaderMotion } from './mobile-header-motion.js';

export function initSectionNavigation(signal) {
  const workspace = document.querySelector('.workspace');
  const footer = document.querySelector('.colophon');
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const panels = [...document.querySelectorAll('.panel')];
  const marker = document.querySelector('.tab-art-marker');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 801px)');
  const headerMotion = createMobileHeaderMotion({ desktop, reduced });
  const on = (target, type, listener) => target.addEventListener(type, listener, { signal });
  const animations = new Set();
  const reveal = createSectionReveal({ animateElement, desktop });
  let transitioning = false;
  let active = 'home', revision = 0;
  let viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;

  tabs.forEach(tab => {
    const label = tab.querySelector('.tab-label');
    const text = label.textContent;
    tab.setAttribute('aria-label', text);
    label.setAttribute('aria-hidden', 'true');
    label.replaceChildren(...Array.from(text, character => {
      const letter = document.createElement('span');
      letter.className = 'tab-letter';
      letter.textContent = character;
      return letter;
    }));
  });

  function positionMarker() {
    if (signal.aborted) return;
    const selected = tabs.find(tab => tab.dataset.tab === active);
    const label = selected.querySelector('.tab-label');
    const left = selected.offsetLeft + (selected.offsetWidth - label.offsetWidth)/2 - marker.offsetWidth - 9;
    const firstPosition = marker.dataset.ready !== 'true';
    if (firstPosition) marker.style.transition = 'none';
    marker.style.transform = `translate3d(${Math.max(0, left)}px, -50%, 0)`;
    marker.dataset.ready = 'true';
    if (firstPosition) {
      marker.getBoundingClientRect();
      marker.style.transition = '';
    }
  }
  function cancelAnimations() {
    animations.forEach(animation => animation.cancel());
    animations.clear();
    reveal.reset();
    panels.forEach(panel => { panel.inert = false; });
    if(footer)footer.inert = false;
    workspace.setAttribute('aria-busy', 'false');
  }
  function animateElement(element, frames, options) {
    if (typeof element.animate !== 'function') return null;
    const animation = element.animate(frames, options);
    animations.add(animation);
    // Retain filled effects until the panel swap, then cancel them explicitly.
    animation.finished.catch(() => {});
    return animation;
  }
  function revealLabel(tab, direction) {
    tab.querySelectorAll('.tab-letter').forEach((letter, index) => {
      animateElement(letter, [
        { transform: `translateY(${direction*110}%)` },
        { transform: 'translateY(0)' },
      ], { duration: 340, delay: index*16, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
    });
  }

  async function selectTab(key, { historyMode = 'push', animate = true } = {}) {
    if (signal.aborted) return;
    if (!tabs.some(tab => tab.dataset.tab === key)) key = 'home';
    const previousIndex = tabs.findIndex(tab => tab.dataset.tab === active);
    const nextIndex = tabs.findIndex(tab => tab.dataset.tab === key);
    const direction = nextIndex >= previousIndex ? 1 : -1;
    const current = ++revision;
    const previous = panels.find(panel => !panel.hidden);
    const target = panels.find(panel => panel.id === `panel-${key}`);
    active = key;
    reveal.freeze(previous);
    cancelAnimations();
    transitioning = false;
    tabs.forEach(tab => {
      const selected = tab.dataset.tab === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    positionMarker();
    const moving = animate && !reduced.matches && previous !== target && typeof previous?.animate === 'function';
    if (moving) {
      revealLabel(tabs[nextIndex], direction);
    }
    if (historyMode === 'push' && location.hash !== `#${key}`) history.pushState({ tab: key }, '', `#${key}`);
    if (moving && previous) {
      transitioning = true;
      previous.inert = true;
      if(footer)footer.inert = true;
      workspace.setAttribute('aria-busy', 'true');
      const departures=[];
      document.dispatchEvent(new CustomEvent('portfolio:sectionstart',{detail:{entering:false,view:previous.id?.replace('panel-',''),
        waitUntil:task=>departures.push(Promise.resolve(task))}}));
      await Promise.allSettled([reveal.play(previous, false, footer),...departures]);
      if (signal.aborted || current !== revision) return;
    }
    const headerFrom = headerMotion.capture(moving);
    panels.forEach(panel => { panel.hidden = panel !== target; });
    // Hide the outgoing content before releasing its filled animation effects.
    cancelAnimations();
    workspace.dataset.view = key;
    if(footer)footer.hidden = key !== 'projects';
    (desktop.matches ? workspace : window).scrollTo({ top: 0, behavior: 'instant' });
    headerMotion.play(headerFrom);
    if (moving) {
      transitioning = true;
      target.inert = true;
      if(footer)footer.inert = true;
      workspace.setAttribute('aria-busy', 'true');
      document.dispatchEvent(new CustomEvent('portfolio:sectionstart',{detail:{entering:true,view:key}}));
      // Start immediately in the same task as the swap, avoiding an unmasked paint.
      const entry = reveal.play(target, true, footer);
      entry.then(() => {
        if (signal.aborted || current !== revision) return;
        cancelAnimations();
        transitioning = false;
        document.dispatchEvent(new Event('portfolio:sectionsettled'));
      });
    } else {
      transitioning = false;
      document.dispatchEvent(new Event('portfolio:sectionsettled'));
    }
  }

  tabs.forEach((tab, index) => {
    on(tab, 'click', () => { if (active !== tab.dataset.tab) selectTab(tab.dataset.tab); });
    on(tab, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus({ preventScroll: true });
      selectTab(tabs[next].dataset.tab);
    });
  });
  on(document, 'click', event => {
    const link = event.target.closest('[data-go-tab]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selectTab(link.dataset.goTab).then(() => {
      if (!signal.aborted) tabs.find(tab => tab.dataset.tab === active)?.focus({ preventScroll: true });
    });
  });
  on(window, 'popstate', () => selectTab(location.hash.slice(1), { historyMode: 'none' }));
  on(window, 'hashchange', () => {
    if (location.hash.slice(1) !== active) selectTab(location.hash.slice(1), { historyMode: 'none' });
  });
  on(window, 'resize', () => {
    const widthChanged = Math.abs(window.innerWidth - viewportWidth) > .5;
    const heightChanged = Math.abs(window.innerHeight - viewportHeight) > .5;
    viewportWidth = window.innerWidth; viewportHeight = window.innerHeight;
    positionMarker();
    // Mobile browser chrome can resize only the visible height during scroll
    // restoration. Keep both the header FLIP and content reveal on their clocks.
    // A real width/breakpoint change still commits the responsive layout safely.
    if (!widthChanged && (!desktop.matches || !heightChanged)) return;
    headerMotion.settle();
    if (transitioning) selectTab(active, { historyMode: 'none', animate: false });
  });
  on(document, 'visibilitychange', () => {
    if (document.hidden) headerMotion.settle();
    if (document.hidden && animations.size) selectTab(active, { historyMode: 'none', animate: false });
  });
  on(window, 'pagehide', () => headerMotion.settle());
  on(desktop, 'change', () => {
    headerMotion.settle();
    window.scrollTo({ top: 0, behavior: 'instant' });
    workspace.scrollTo({ top: 0, behavior: 'instant' });
    positionMarker();
    if (transitioning) selectTab(active, { historyMode: 'none', animate: false });
  });
  on(reduced, 'change', () => {
    headerMotion.settle();
    if (reduced.matches) selectTab(active, { historyMode: 'none', animate: false });
  });
  signal.addEventListener('abort', () => { revision++; headerMotion.destroy(); cancelAnimations(); reveal.destroy(); }, { once: true });
  selectTab(location.hash.slice(1) || 'home', { historyMode: 'none', animate: false });
  document.fonts?.ready?.then(positionMarker);
  async function revealInitial() {
    if (signal.aborted || reduced.matches) return;
    const target = panels.find(panel => !panel.hidden);
    if (typeof target?.animate !== 'function') return;
    const current = ++revision;
    cancelAnimations(); transitioning = true;
    target.inert = true; if(footer)footer.inert = true;
    workspace.setAttribute('aria-busy', 'true');
    document.dispatchEvent(new CustomEvent('portfolio:sectionstart',{detail:{entering:true,view:active}}));
    await reveal.play(target, true, footer);
    if (signal.aborted || current !== revision) return;
    cancelAnimations(); transitioning = false;
    document.dispatchEvent(new Event('portfolio:sectionsettled'));
  }
  return { selectTab, revealInitial, settleInitial: () => selectTab(active, { historyMode: 'none', animate: false }) };
}
