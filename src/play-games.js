import { initUntangle } from './untangle.js';
import { initUntanglePreview } from './untangle-preview.js';
import { initPlayCardMotion } from './play-card-motion.js';
import { initShiftBoard } from './shift-board.js';
import { createConduitFitting } from './conduit-fittings.js';
import { conduitHint, createPuzzle, neighbors, openConduitPorts, traceConduit, puzzleLevels, shiftDistance, shiftTile, turnCircuit } from './play-puzzles.js';

const games = {
  untangle: { title: 'Untangle', help: 'Drag points apart. Drag the background to orbit.' },
  conduit: { title: 'Conduit', help: 'Connect every pipe to the pump and seal every leak.' },
  shift: { title: 'Shift', help: 'Drag the frame to turn it. Slide tiles into the gap.' },
};

const directions = { ArrowUp: 0, ArrowLeft: 1, ArrowRight: 2, ArrowDown: 3 };
const ports = ['up', 'right', 'down', 'left'];
const pipeFill = 85;

function buildConduitPreview(board) {
  const source = 3;
  const elbow = 4;
  const starting = [3, 6, 12, 2, 12, 1, 3, 10, 9];
  const connected = starting.slice();
  connected[elbow] = turnCircuit(starting[elbow]);
  const route = traceConduit(connected, 3, source);
  const order = [...route.keys()];
  const cells = starting.map((mask, index) => {
    const cell = document.createElement('span');
    cell.className = 'conduit-preview-cell';
    const fitting = document.createElement('span');
    fitting.className = 'conduit-preview-fitting';
    fitting.append(createConduitFitting(mask, index === source, index));
    if (index === elbow) fitting.classList.add('conduit-preview-turn');

    const connection = route.get(index);
    if (connection) {
      for (let side = 0; side < ports.length; side++) {
        if (!(mask & (1 << side))) continue;
        const inlet = Boolean(connection.inlet & (1 << ((side + (index === elbow ? 1 : 0)) % ports.length)));
        const glass = document.createElement('span');
        glass.className = 'conduit-window';
        glass.dataset.inlet = String(inlet);
        glass.style.setProperty('--port', side);
        glass.style.setProperty('--flow-delay', `${880 + (order.indexOf(index) - 1) * 330 + (inlet ? 0 : 165)}ms`);
        if (index === source) glass.classList.add('conduit-preview-source');
        fitting.append(glass);
      }
    }
    cell.append(fitting);
    return cell;
  });
  board.replaceChildren(...cells);
}

export function initPlayGames(panel, signal) {
  const menu = panel.querySelector('[data-play-menu]');
  buildConduitPreview(menu.querySelector('[data-conduit-preview]'));
  initUntanglePreview(menu.querySelector('[data-untangle-preview]'), panel, menu, signal);
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
  const hint = panel.querySelector('[data-puzzle-hint]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sessions = new Map();
  const on = (target, event, listener) => target.addEventListener(event, listener, { signal });
  let currentGame, opener, untangleControls, buttons = [], focused = 0, hintedPipe;
  const fillEnds = new Map();

  const available = () => !panel.hidden && !panel.inert
    && document.documentElement.dataset.entry !== 'loading';
  const cardMotion = initPlayCardMotion(menu, screen, { signal, available, open: openGame });
  const current = () => sessions.get(currentGame);
  const shiftBoard = initShiftBoard(space, object, front, {
    signal, reduced, move: moveShift,
    available: () => currentGame === 'shift' && !screen.hidden && available(),
    findGap(tile) {
      const { size, tiles, solved } = current();
      const gap = tiles.indexOf(0);
      return !solved && neighbors(gap, size).includes(Number(tile.dataset.cell)) ? buttons[gap] : null;
    },
  });

  function createSession(game, level) {
    const previous = sessions.get(game);
    let puzzle = createPuzzle(game, level);
    for (let retry = 0; retry < 8 && previous?.level === level
      && puzzle.tiles.every((value, index) => value === previous.starting[index]); retry++) {
      puzzle = createPuzzle(game, level);
    }
    const state = { ...puzzle, level, starting: puzzle.tiles, tiles: puzzle.tiles.slice(), solved: false };
    sessions.set(game, state);
    return state;
  }

  function paintWater(route, tiles, size, turning) {
    const now = performance.now();
    for (const index of fillEnds.keys()) {
      if (route.has(index)) continue;
      fillEnds.delete(index);
      buttons[index].dataset.filled = 'false';
    }
    // The map follows the flow from the pump, so each inlet can wait for its upstream pipe.
    for (const [index, { from, inlet }] of route) {
      const button = buttons[index];
      const turn = Number.parseInt(button.style.getPropertyValue('--circuit-angle'), 10) / 90;
      const fresh = !fillEnds.has(index);
      const start = Math.max(now + (turning ? 215 : 0), fillEnds.get(from) ?? 0);
      const hub = start + (inlet ? pipeFill : 0);
      if (fresh) fillEnds.set(index, hub + pipeFill);
      const open = openConduitPorts(tiles, size, index);
      if (fresh) {
        for (const sightglass of button.querySelectorAll('[data-pipe-side]')) {
          const port = 1 << ((Number(sightglass.dataset.pipeSide) + turn) % ports.length);
          const incoming = Boolean(inlet & port);
          sightglass.dataset.inlet = String(incoming);
          sightglass.style.setProperty('--water-delay', `${(incoming ? start : hub) + 18 - now}ms`);
        }
      }
      for (const outlet of button.querySelectorAll('[data-outlet-side]')) {
        const port = 1 << ((Number(outlet.dataset.outletSide) + turn) % ports.length);
        const leaking = Boolean(open & port);
        if (leaking && (fresh || outlet.dataset.leak !== 'true')) {
          outlet.style.setProperty('--leak-delay', `${Math.max(0, turning ? 215 : 0, fillEnds.get(index) - now)}ms`);
        }
        outlet.dataset.leak = String(leaking);
      }
      button.dataset.filled = 'true';
    }
  }

  function paintPuzzle(turning = false) {
    const state = current();
    const { level, size, tiles, source } = state;
    const circuit = currentGame === 'conduit';
    const water = circuit ? traceConduit(tiles, size, source) : null;
    const movable = circuit ? [] : neighbors(tiles.indexOf(0), size);
    if (circuit) {
      paintWater(water, tiles, size, turning);
      state.solved = water.size === tiles.length && tiles.every((_, index) => !openConduitPorts(tiles, size, index));
    }
    const { solved } = state;
    const count = circuit ? water.size
      : tiles.filter((value, index) => value === index + 1).length;
    board.dataset.solved = String(solved);
    buttons.forEach((button, index) => {
      const value = tiles[index];
      button.dataset.value = String(value);
      button.tabIndex = index === focused && !solved ? 0 : -1;
      if (circuit) {
        const filled = water.has(index);
        const open = ports.filter((_, side) => value & (1 << side));
        button.setAttribute('aria-label', `${index === source ? 'Water source' : `Pipe ${index + 1}`}. ${open.join(', ')}. ${filled ? 'Filled' : 'Empty'}`);
        button.setAttribute('aria-disabled', String(solved));
      } else {
        const canMove = movable.includes(index) && !solved;
        button.setAttribute('aria-label', value ? `Tile ${value}` : 'Empty space');
        button.setAttribute('aria-disabled', String(!canMove));
        button.style.setProperty('--tile-grain-x', `${(value * 37) % 101}%`);
        button.style.setProperty('--tile-grain-y', `${(value * 61) % 101}%`);
        button.style.setProperty('--tile-stain', (value * 5 % 7) * .017);
      }
    });
    stage.textContent = `Stage ${level + 1} / ${puzzleLevels}`;
    status.textContent = solved ? (level === puzzleLevels - 1 ? 'All stages cleared' : 'Stage cleared')
      : circuit ? (count === tiles.length ? 'All filled · seal the leaks' : `${count} / ${tiles.length} filled`)
        : `${count} / ${tiles.length - 1} in place`;
    next.textContent = level === puzzleLevels - 1 ? 'Play again' : 'Next level';
    next.hidden = !solved;
    hint.hidden = !circuit || solved;
  }

  function clearPipeHint() {
    if (hintedPipe) delete hintedPipe.dataset.hinted;
    hintedPipe = undefined;
  }

  function buildBoard(focus = false) {
    clearPipeHint();
    fillEnds.clear();
    shiftBoard.clear();
    const { size, tiles, source } = current();
    board.dataset.game = currentGame;
    space.dataset.game = currentGame;
    front.hidden = currentGame !== 'shift';
    board.setAttribute('aria-label', `${games[currentGame].title}, ${size} by ${size} board`);
    board.style.setProperty('--side', size);
    buttons = tiles.map((value, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'puzzle-tile';
      button.dataset.cell = String(index);
      if (currentGame === 'shift') {
        const face = document.createElement('span');
        face.className = 'shift-tile-face';
        face.setAttribute('aria-hidden', 'true');
        const number = document.createElement('span');
        number.className = 'shift-tile-number';
        number.dataset.number = value || '';
        face.append(number);
        button.append(face);
        for (const side of ports) {
          const edge = document.createElement('span');
          edge.className = `shift-tile-edge shift-tile-edge--${side}`;
          edge.setAttribute('aria-hidden', 'true');
          button.append(edge);
        }
      } else {
        const frame = document.createElement('span');
        frame.className = 'conduit-cell-frame';
        frame.setAttribute('aria-hidden', 'true');
        const assembly = document.createElement('span');
        assembly.className = 'conduit-assembly';
        assembly.append(createConduitFitting(value, index === source, index));
        frame.append(assembly);
        const spray = document.createElement('span');
        spray.className = 'conduit-spray';
        spray.setAttribute('aria-hidden', 'true');
        for (let side = 0; side < ports.length; side++) {
          if (!(value & (1 << side))) continue;
          const sightglass = document.createElement('span');
          sightglass.className = 'conduit-window';
          sightglass.style.setProperty('--port', side);
          sightglass.dataset.pipeSide = String(side);
          assembly.append(sightglass);
          const outlet = document.createElement('span');
          outlet.className = 'conduit-outlet';
          outlet.style.setProperty('--port', side);
          outlet.dataset.outletSide = String(side);
          spray.append(outlet);
        }
        button.append(frame, spray);
        if (index === source) {
          const fountain = document.createElement('span');
          fountain.className = 'conduit-fountain';
          fountain.setAttribute('aria-hidden', 'true');
          button.append(fountain);
        }
        button.dataset.source = String(index === source);
        button.style.setProperty('--circuit-angle', '0deg');
      }
      return button;
    });
    focused = currentGame === 'shift' ? neighbors(tiles.indexOf(0), size)[0] : source;
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
    screen.hidden = true;
    untangle.hidden = true;
    puzzle.hidden = true;
    menu.hidden = false;
    opener.focus({ preventScroll: true });
    cardMotion.restore(opener);
  }

  on(back, 'click', closeGame);

  on(hint, 'click', () => {
    if (screen.hidden || !available() || currentGame !== 'conduit' || current().solved) return;
    const { size, source, tiles, solution } = current();
    const move = conduitHint(tiles, size, source, solution);
    if (!move) return;
    clearPipeHint();
    hintedPipe = buttons[move.index];
    hintedPipe.dataset.hinted = 'true';
    const pipe = move.index === source ? 'Pump' : `Pipe ${move.index + 1}`;
    const inlet = ports.find((_, side) => move.inlet === (1 << side));
    status.textContent = `${pipe} · turn ${move.turns}× clockwise${inlet ? ` · inlet ${inlet}` : ''}`;
    hintedPipe.focus({ preventScroll: true });
  });

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

  function moveShift(index, progress = 0, speed = 0) {
    const state = current();
    if (state.solved || shiftBoard.settling()) return;
    const { size, tiles } = state;
    const destination = shiftTile(tiles, size, index);
    if (destination < 0) return;
    const tile = buttons[index], gap = buttons[destination];
    const direction = shiftBoard.direction(tile, gap);
    const afterTile = tile.nextSibling;
    board.insertBefore(tile, gap);
    board.insertBefore(gap, afterTile === gap ? tile : afterTile);
    [buttons[index], buttons[destination]] = [gap, tile];
    tile.dataset.cell = String(destination);
    gap.dataset.cell = String(index);
    state.solved = shiftDistance(tiles, size) === 0;
    focused = destination;
    paintPuzzle();
    shiftBoard.settle(tile, direction, progress - 1, speed);
    if (state.solved) next.focus({ preventScroll: true });
    else tile.focus({ preventScroll: true });
  }

  on(board, 'click', event => {
    const state = current();
    const index = Number(event.target.closest('[data-cell]')?.dataset.cell);
    if (!Number.isInteger(index) || !available() || state.solved) return;
    if (currentGame === 'shift') {
      moveShift(index);
      return;
    }
    clearPipeHint();
    state.tiles[index] = turnCircuit(state.tiles[index]);
    const tile = buttons[index];
    const angle = Number.parseInt(tile.style.getPropertyValue('--circuit-angle'), 10);
    tile.style.setProperty('--circuit-angle', `${angle + 90}deg`);
    focused = index;
    paintPuzzle(true);
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
