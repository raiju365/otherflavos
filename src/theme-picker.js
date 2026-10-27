import { createThemeReveal } from './theme-reveal.js';
import { createThemeSelectionMotion } from './theme-selection-motion.js';
import { createThemePanelMotion } from './theme-panel-motion.js';
// One bounded glass surface opens from the trigger. Its blur remains constant.
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
  let pressed = false;
  let pressPointer = null;
  let outsideGesture = null;
  let rows=[];
  const panelMotion = createThemePanelMotion({
    glass, rim: glass.querySelector?.('.theme-glass-rim'),
    tone: toggle.querySelector?.('.theme-icon-tone'),
    close: toggle.querySelector?.('.theme-icon-close'),
    closeSurface: toggle.querySelector?.('.theme-close-surface'),
  }, { onRest: () => { if (!open && !pressed) finishClose(); } });
  function animatePanel() {
    panelMotion.set({ open, pressed: pressed && !motion.matches,
      animate: !motion.matches && !document.hidden });
  }
  function clearPress() {
    if (!pressed) return;
    pressed = false; pressPointer = null; picker.dataset.pressed = 'false'; animatePanel();
  }

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
    outsideGesture = null;
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
    }
    animatePanel();
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
  // Options never compress the panel; the original trigger owns pressure.
  on(picker, 'pointerdown', event => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.isPrimary === false) return;
    if (!toggle.contains(event.target)) return;
    pressPointer = event.pointerId ?? null;
    pressed = true; picker.dataset.pressed = 'true';
    setMotionActive(true); animatePanel();
  });
  const releasePointer = event => { if (pressPointer === null || event.pointerId === pressPointer) clearPress(); };
  on(window, 'pointerup', releasePointer);
  on(window, 'pointercancel', releasePointer);
  on(window, 'blur', () => { outsideGesture = null; clearPress(); panelMotion.settle(); selectionMotion.settle(); });
  on(window, 'pagehide', () => { outsideGesture = null; clearPress(); panelMotion.settle(); selectionMotion.settle(); });
  on(document, 'visibilitychange', () => { if (document.hidden) { outsideGesture = null; clearPress(); panelMotion.settle(); selectionMotion.settle(); } });
  on(toggle, 'pointerleave', clearPress);
  on(toggle, 'keydown', event => {
    if ([' ', 'Enter'].includes(event.key) && !event.repeat) {
      pressed = true; picker.dataset.pressed = 'true'; setMotionActive(true); animatePanel();
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    setOpen(true, event.key === 'ArrowUp' ? { focusIndex: options.length - 1 } : {});
  });
  on(toggle, 'keyup', event => { if ([' ', 'Enter'].includes(event.key)) clearPress(); });
  on(toggle, 'blur', clearPress);
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
  function insidePicker(event) {
    if (picker.contains(event.target) || event.composedPath?.().includes(picker)) return true;
    // Retargeted input and blank gaps still count as inside the material.
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      const rect = glass.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.left + rect.width
        && event.clientY >= rect.top && event.clientY <= rect.top + rect.height) return true;
    }
    return false;
  }
  // Wait for a completed outside tap. A swipe, wheel or cancelled touch must
  // leave the glass open while the real projects move behind it.
  on(document, 'pointerdown', event => {
    if (!open || event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
    if (insidePicker(event)) return;
    outsideGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  });
  function trackOutside(event) {
    if (!outsideGesture || event.pointerId !== outsideGesture.id) return;
    if (Math.hypot(event.clientX - outsideGesture.x, event.clientY - outsideGesture.y) >= 6) outsideGesture.moved = true;
  }
  on(document, 'pointermove', trackOutside);
  on(document, 'pointerup', event => {
    if (!outsideGesture || event.pointerId !== outsideGesture.id) return;
    trackOutside(event);
    const tap = !outsideGesture.moved;
    outsideGesture = null;
    if (open && tap && !insidePicker(event)) setOpen(false);
  });
  on(document, 'pointercancel', event => {
    if (event.pointerId === outsideGesture?.id) outsideGesture = null;
  });
  on(document, 'wheel', event => {
    if (outsideGesture && (event.deltaX || event.deltaY)) outsideGesture.moved = true;
  });
  on(window, 'resize', () => {
    outsideGesture = null; clearPress(); panelMotion.resize(); if (open) positionSelection(false,true);
  });
  on(motion, 'change', () => {
    if (motion.matches) { clearPress(); panelMotion.settle(); selectionMotion.settle(); }
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
    outsideGesture = null;
    selectionMotion.settle();
    pressed = false; picker.dataset.pressed = 'false';
    panelMotion.destroy();
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
