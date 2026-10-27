import { createThemeReveal } from './theme-reveal.js';
import { createThemeSelectionMotion } from './theme-selection-motion.js';
// One fixed-size surface, anchored to the trigger; only opacity/transform animate.
export function initThemePicker(signal) {
  const picker = document.querySelector('.theme-picker');
  const toggle = document.querySelector('#theme-toggle');
  const menu = document.querySelector('#theme-menu');
  // An optional control must not prevent entry/readiness from starting.
  if (!picker || !toggle || !menu) return;
  const glass = picker.querySelector('.theme-glass');
  const selection = menu.querySelector('.theme-selection');
  const options = [...menu.querySelectorAll('[data-set-theme]')];
  if (!glass || !selection || !options.length) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const selectionMotion = createThemeSelectionMotion(selection);
  const root = document.documentElement;
  const on = (target, type, listener) => target.addEventListener(type, listener, { signal });
  let open = false;
  let selectedTheme = root.dataset.theme;
  let reflectedTheme;
  let closeTimer;
  let rows=[];
  function clearPress() { picker.dataset.pressed = 'false'; }

  function positionSelection(animate = true, measure = false) {
    if (menu.hidden) return;
    const selected = options.find(option => option.dataset.setTheme === selectedTheme);
    if (!selected) return;
    if(measure||!rows.length)rows=options.map(option=>({option,y:option.offsetTop,height:option.offsetHeight}));
    const row=rows.find(item=>item.option===selected);
    selectionMotion.move({
      y: row.y, height: row.height,
      maxY: Math.max(...rows.map(item=>item.y)),
      animate: animate && !motion.matches && !document.hidden,
    });
  }

  function focusOption(index) {
    options.forEach((option, i) => { option.tabIndex = i === index ? 0 : -1; });
    options[index]?.focus({ preventScroll: true });
  }

  function finishClose() {
    clearTimeout(closeTimer);
    if (!open) {
      menu.hidden = true;
      setMotionActive(false);
    }
  }

  function setMotionActive(active) {
    if(root.dataset.themeControlOpen===String(active))return;
    root.dataset.themeControlOpen=String(active);
    document.dispatchEvent(new CustomEvent('portfolio:themecontrol',{detail:{open:active}}));
  }

  function setOpen(next, { restoreFocus = false, focusIndex } = {}) {
    clearTimeout(closeTimer);
    open = next;
    if (open) {
      menu.hidden = false;
      // Measure fixed option rows once on open; palette changes reuse them.
      positionSelection(false,true);
    }
    picker.dataset.open = String(open);
    if(open)setMotionActive(true);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close color themes' : `Choose color theme, current: ${currentLabel()}`);
    if (!open && (restoreFocus || menu.contains(document.activeElement))) {
      toggle.focus({ preventScroll: true });
    }
    menu.inert = !open;
    menu.setAttribute('aria-hidden', String(!open));
    if (open) {
      const selected = options.findIndex(option => option.dataset.setTheme === selectedTheme);
      focusOption(focusIndex ?? Math.max(0, selected));
    } else {
      selectionMotion.settle();
      options.forEach(option => { option.tabIndex = -1; });
      if (motion.matches) finishClose();
      else closeTimer = setTimeout(finishClose, 280);
    }
  }

  function currentLabel() {
    return options.find(option => option.dataset.setTheme === selectedTheme)
      ?.querySelector('.theme-label').textContent || 'Dark';
  }

  function reflectTheme(theme = root.dataset.theme, updateMeta = true) {
    selectedTheme = theme;
    if (reflectedTheme !== theme) {
      options.forEach(option => {
        option.setAttribute('aria-checked', String(option.dataset.setTheme === theme));
      });
      if (!open) toggle.setAttribute('aria-label', `Choose color theme, current: ${currentLabel()}`);
      positionSelection();
      reflectedTheme = theme;
    }
    if (updateMeta) document.querySelector('meta[name="theme-color"]').content = getComputedStyle(root)
      .getPropertyValue('--bg').trim();
  }

  on(toggle, 'click', () => setOpen(!open, { restoreFocus: open }));
  // Press response only; glass highlights stay at their authored CSS position.
  on(picker, 'pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    picker.dataset.pressed = 'true';
  });
  on(window, 'pointerup', clearPress);
  on(window, 'pointercancel', clearPress);
  on(window, 'blur', () => { clearPress(); selectionMotion.settle(); });
  on(window, 'pagehide', () => {selectionMotion.settle();if(!open)finishClose();});
  on(document, 'visibilitychange', () => { if (document.hidden) { clearPress(); selectionMotion.settle(); if(!open)finishClose(); } });
  on(glass, 'pointerleave', clearPress);
  on(toggle, 'keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    setOpen(true, event.key === 'ArrowUp' ? { focusIndex: options.length - 1 } : {});
  });
  on(menu, 'keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = options.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    focusOption(next);
  });
  on(document, 'keydown', event => {
    if (event.key !== 'Escape' || !open || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    setOpen(false, { restoreFocus: true });
  });
  // Selecting a theme keeps the preview open. Dismiss with X, Escape, or an
  // outside pointer; normal keyboard focus movement does not dismiss it.
  on(document, 'pointerdown', event => {
    if (!open) return;
    if (picker.contains(event.target) || event.composedPath?.().includes(picker)) return;
    // Native snapshot layers can retarget a pointer to the document root.
    // The whole visible glass, including empty gaps, still counts as inside.
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      const rect = glass.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.left + rect.width
        && event.clientY >= rect.top && event.clientY <= rect.top + rect.height) return;
    }
    setOpen(false);
  });
  on(window, 'resize', () => { if (open) positionSelection(false,true); });
  on(glass, 'transitionend', event => {
    if (event.target === glass && event.propertyName === 'transform') finishClose();
  });
  on(motion, 'change', () => {
    if (motion.matches) { clearPress(); selectionMotion.settle(); if (!open) finishClose(); }
  });

  const changeTheme = createThemeReveal({ signal, origin: toggle, apply(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem('personal-web:theme', root.dataset.theme); } catch { }
    reflectTheme();
  } });
  options.forEach(option => on(option, 'click', () => {
    focusOption(options.indexOf(option));
    // Input feedback never waits for the browser's initial snapshot callback.
    reflectTheme(option.dataset.setTheme, false);
    changeTheme(option.dataset.setTheme);
  }));
  reflectTheme();

  signal.addEventListener('abort', () => {
    selectionMotion.settle();
    clearPress();
    clearTimeout(closeTimer);
    open = false;
    picker.dataset.open = 'false';
    toggle.setAttribute('aria-expanded', 'false');
    menu.inert = true;
    menu.hidden = true;
    menu.setAttribute('aria-hidden', 'true');
    options.forEach(option => { option.tabIndex = -1; });
    delete root.dataset.themeControlOpen;
    document.dispatchEvent(new CustomEvent('portfolio:themecontrol',{detail:{open:false}}));
  }, { once: true });
}
