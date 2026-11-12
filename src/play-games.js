import { initUntangle } from './untangle.js';
import { initShiftBoard } from './shift-board.js';
import { createPuzzle, neighbors, puzzleLevels, shiftDistance, shiftTile, toggleLights } from './play-puzzles.js';

const games = {
  untangle: { title: 'Untangle', help: 'Drag points apart. Drag the background to orbit.' },
  afterglow: { title: 'Afterglow', help: 'Tap to toggle a light and its neighbors.' },
  shift: { title: 'Shift', help: 'Drag the frame to turn it. Slide tiles into the gap.' },
};

const directions = { ArrowUp: 0, ArrowLeft: 1, ArrowRight: 2, ArrowDown: 3 };

export function initPlayGames(panel, signal) {
  const menu = panel.querySelector('[data-play-menu]');
  const screen = panel.querySelector('[data-play-game]');
  const back = panel.querySelector('[data-play-back]');
  const title = panel.querySelector('[data-game-title]');
  const help = panel.querySelector('[data-game-help]');
  const untangle = panel.querySelector('[data-untangle]');
  const puzzle = panel.querySelector('[data-puzzle]');
  const board = panel.querySelector('[data-puzzle-board]');
  const space = panel.querySelector('[data-puzzle-space]');
  const object = panel.querySelector('[data-puzzle-object]');
  const front = panel.querySelector('[data-puzzle-front]');
  const stage = panel.querySelector('[data-puzzle-stage]');
  const status = panel.querySelector('[data-puzzle-status]');
  const reset = panel.querySelector('[data-puzzle-reset]');
  const fresh = panel.querySelector('[data-puzzle-new]');
  const next = panel.querySelector('[data-puzzle-next]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sessions = new Map();
  const on = (target, event, listener) => target.addEventListener(event, listener, { signal });
  let currentGame, opener, untangleControls, buttons = [], focused = 0;
  let tileMotion = null;

  const available = () => !panel.hidden && !panel.inert
    && document.documentElement.dataset.entry !== 'loading';
  const current = () => sessions.get(currentGame);
  const shiftBoard = initShiftBoard(space, object, front, {
    signal, reduced, move: moveShift,
    available: () => currentGame === 'shift' && !screen.hidden && available(),
    findGap(tile) {
      tileMotion?.cancel();
      const { size, tiles, solved } = current();
      const gap = tiles.indexOf(0);
      return !solved && neighbors(gap, size).includes(Number(tile.dataset.cell)) ? buttons[gap] : null;
    },
  });

  function createSession(game, level) {
    const previous = sessions.get(game);
    let { size, tiles } = createPuzzle(game, level);
    for (let retry = 0; retry < 8 && previous?.level === level
      && tiles.every((value, index) => value === previous.starting[index]); retry++) {
      ({ size, tiles } = createPuzzle(game, level));
    }
    const state = { level, size, starting: tiles, tiles: tiles.slice(), solved: false };
    sessions.set(game, state);
    return state;
  }

  function paintPuzzle() {
    const { level, size, tiles, solved } = current();
    const lights = currentGame === 'afterglow';
    const movable = lights ? [] : neighbors(tiles.indexOf(0), size);
    const count = lights ? tiles.filter(Boolean).length
      : tiles.filter((value, index) => value === index + 1).length;
    board.dataset.solved = String(solved);
    buttons.forEach((button, index) => {
      const value = tiles[index];
      button.dataset.value = String(value);
      button.tabIndex = index === focused && !solved ? 0 : -1;
      if (lights) {
        button.setAttribute('aria-label', `Light ${index + 1}`);
        button.setAttribute('aria-pressed', String(Boolean(value)));
      } else {
        const canMove = movable.includes(index) && !solved;
        button.textContent = value || '';
        button.setAttribute('aria-label', value ? `Tile ${value}` : 'Empty space');
        button.setAttribute('aria-disabled', String(!canMove));
        button.style.setProperty('--tile-order', value / (tiles.length - 1));
      }
    });
    stage.textContent = `Stage ${level + 1} / ${puzzleLevels}`;
    status.textContent = solved ? (level === puzzleLevels - 1 ? 'All stages cleared' : 'Stage cleared')
      : lights ? `${count} ${count === 1 ? 'light' : 'lights'} on`
        : `${count} / ${tiles.length - 1} in place`;
    next.textContent = level === puzzleLevels - 1 ? 'Play again' : 'Next level';
    next.hidden = !solved;
  }

  function buildBoard(focus = false) {
    shiftBoard.clear();
    tileMotion?.cancel();
    const { size, tiles } = current();
    board.dataset.game = currentGame;
    space.dataset.game = currentGame;
    front.hidden = currentGame !== 'shift';
    board.setAttribute('aria-label', `${games[currentGame].title}, ${size} by ${size} board`);
    board.style.setProperty('--side', size);
    buttons = tiles.map((_, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'puzzle-tile';
      button.dataset.cell = String(index);
      if (currentGame === 'shift') {
        button.style.setProperty('--tile-gloss-x', `${index % size / (size - 1) * 100}%`);
        button.style.setProperty('--tile-gloss-y', `${Math.floor(index / size) / (size - 1) * 100}%`);
      }
      return button;
    });
    focused = currentGame === 'shift' ? neighbors(tiles.indexOf(0), size)[0] : 0;
    board.replaceChildren(...buttons);
    paintPuzzle();
    if (focus) buttons[focused].focus({ preventScroll: true });
  }

  function openGame(button) {
    if (!available()) return;
    opener = button;
    currentGame = button.dataset.openGame;
    const strings = currentGame === 'untangle';
    title.textContent = games[currentGame].title;
    help.textContent = games[currentGame].help;
    menu.hidden = true;
    screen.hidden = false;
    untangle.hidden = !strings;
    puzzle.hidden = strings;
    if (strings) {
      untangleControls ??= initUntangle(untangle, signal) ?? {};
      untangleControls.resume?.();
    } else {
      if (!current()) createSession(currentGame, 0);
      buildBoard();
    }
    title.focus({ preventScroll: true });
  }

  function closeGame() {
    untangleControls?.pause?.();
    shiftBoard.clear();
    tileMotion?.cancel();
    screen.hidden = true;
    untangle.hidden = true;
    puzzle.hidden = true;
    menu.hidden = false;
    opener.focus({ preventScroll: true });
  }

  for (const button of menu.querySelectorAll('[data-open-game]')) {
    on(button, 'click', () => openGame(button));
  }
  on(back, 'click', closeGame);

  on(board, 'focusin', event => {
    const index = Number(event.target.dataset.cell);
    if (!Number.isInteger(index) || current().solved) return;
    buttons[focused].tabIndex = -1;
    focused = index;
    event.target.tabIndex = 0;
  });

  on(board, 'keydown', event => {
    if (!Object.hasOwn(directions, event.key) || !available() || current().solved) return;
    const { size } = current();
    const index = Number(event.target.dataset.cell);
    if (!Number.isInteger(index)) return;
    event.preventDefault();
    const destination = index + [-size, -1, 1, size][directions[event.key]];
    if (neighbors(index, size).includes(destination)) buttons[destination].focus({ preventScroll: true });
  });

  function moveShift(index, progress = 0) {
    const state = current();
    if (state.solved) return;
    const { size, tiles } = state;
    const destination = shiftTile(tiles, size, index);
    if (destination < 0) return;
    tileMotion?.cancel();
    state.solved = shiftDistance(tiles, size) === 0;
    focused = destination;
    paintPuzzle();
    const from = buttons[index], to = buttons[destination];
    if (!reduced.matches && progress < 1 && typeof to.animate === 'function') {
      const dx = (from.offsetLeft - to.offsetLeft) * (1 - progress);
      const dy = (from.offsetTop - to.offsetTop) * (1 - progress);
      tileMotion = to.animate(
        [{ translate: `${dx}px ${dy}px`, zIndex: 2 }, { translate: '0px 0px', zIndex: 2 }],
        { duration: 150 + 100 * (1 - progress), easing: 'cubic-bezier(.22, 1, .36, 1)' },
      );
    }
    if (state.solved) next.focus({ preventScroll: true });
    else to.focus({ preventScroll: true });
  }

  on(board, 'click', event => {
    const state = current();
    const index = Number(event.target.closest('[data-cell]')?.dataset.cell);
    if (!Number.isInteger(index) || !available() || state.solved) return;
    if (currentGame === 'shift') {
      moveShift(index);
      return;
    }
    toggleLights(state.tiles, state.size, index);
    state.solved = !state.tiles.some(Boolean);
    focused = index;
    paintPuzzle();
    if (state.solved) next.focus({ preventScroll: true });
  });

  on(reset, 'click', () => {
    if (!available()) return;
    const state = current();
    state.tiles = state.starting.slice();
    state.solved = false;
    buildBoard(true);
  });
  on(fresh, 'click', () => {
    if (!available()) return;
    createSession(currentGame, current().level);
    buildBoard(true);
  });
  on(next, 'click', () => {
    if (!available() || !current().solved) return;
    createSession(currentGame, (current().level + 1) % puzzleLevels);
    buildBoard(true);
  });
}
