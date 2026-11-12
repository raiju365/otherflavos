export const puzzleLevels = 5;

export function neighbors(index, size) {
  const column = index % size;
  return [
    index >= size ? index - size : -1,
    column > 0 ? index - 1 : -1,
    column < size - 1 ? index + 1 : -1,
    index < size * (size - 1) ? index + size : -1,
  ].filter(cell => cell >= 0);
}

export function shiftTile(tiles, size, index) {
  const gap = tiles.indexOf(0);
  if (!neighbors(gap, size).includes(index)) return -1;
  [tiles[gap], tiles[index]] = [tiles[index], tiles[gap]];
  return gap;
}

export function shiftDistance(tiles, size) {
  return tiles.reduce((total, value, index) => {
    if (!value) return total;
    const goal = value - 1;
    return total + Math.abs(index % size - goal % size)
      + Math.abs(Math.floor(index / size) - Math.floor(goal / size));
  }, 0);
}

const circuitStages = [[3, 4], [4, 8], [4, 13], [5, 20], [6, 31]];
const shiftStages = [[3, 10, 4], [3, 24, 9], [4, 44, 16], [4, 76, 24], [5, 128, 38]];

export function turnCircuit(mask) {
  return ((mask << 1) | (mask >> 3)) & 15;
}

function portBetween(from, to, size) {
  const delta = to - from;
  return delta === -size ? 1 : delta === 1 ? 2 : delta === size ? 4 : 8;
}

export function traceConduit(tiles, size, source) {
  const connected = new Map([[source, { from: null, inlet: 0 }]]);
  for (const index of connected.keys()) {
    for (const next of neighbors(index, size)) {
      if (connected.has(next)) continue;
      const inlet = portBetween(next, index, size);
      if ((tiles[index] & portBetween(index, next, size)) && (tiles[next] & inlet)) {
        connected.set(next, { from: index, inlet });
      }
    }
  }
  return connected;
}

function circuitPuzzle(level, random) {
  const [size, moves] = circuitStages[level];
  const count = size * size;
  const tiles = Array(count).fill(0);
  const source = Math.floor(size / 2) * size + Math.floor(size / 2);
  const connected = new Set([source]);
  const frontier = neighbors(source, size).map(next => [source, next]);
  while (connected.size < count) {
    const [from, to] = frontier.splice(Math.floor(random() * frontier.length), 1)[0];
    if (connected.has(to)) continue;
    tiles[from] |= portBetween(from, to, size);
    tiles[to] |= portBetween(to, from, size);
    connected.add(to);
    for (const next of neighbors(to, size)) {
      if (!connected.has(next)) frontier.push([to, next]);
    }
  }
  const choices = Array.from({ length: count }, (_, index) => index);
  for (let move = 0; move < moves; move++) {
    const [index] = choices.splice(Math.floor(random() * choices.length), 1);
    const orientations = new Set();
    let rotated = tiles[index];
    for (let turn = 0; turn < 3; turn++) {
      rotated = turnCircuit(rotated);
      if (rotated !== tiles[index]) orientations.add(rotated);
    }
    const options = [...orientations];
    if (options.length) tiles[index] = options[Math.floor(random() * options.length)];
  }
  if (traceConduit(tiles, size, source).size === count) {
    const terminal = tiles.findIndex(mask => (mask & (mask - 1)) === 0);
    tiles[terminal] = turnCircuit(tiles[terminal]);
  }
  return { size, tiles, source };
}

function slidingPuzzle(level, random) {
  const [size, moves, minimum] = shiftStages[level];
  const count = size * size;
  let best = { tiles: [], distance: -1 };
  for (let attempt = 0; attempt < 12; attempt++) {
    const tiles = Array.from({ length: count }, (_, index) => (index + 1) % count);
    let gap = count - 1;
    let previous = -1;
    for (let move = 0; move < moves; move++) {
      const choices = neighbors(gap, size).filter(index => index !== previous);
      const next = choices[Math.floor(random() * choices.length)];
      tiles[gap] = tiles[next];
      tiles[next] = 0;
      previous = gap;
      gap = next;
    }
    const distance = shiftDistance(tiles, size);
    if (distance >= minimum) return { size, tiles };
    if (distance > best.distance) best = { tiles, distance };
  }
  if (!best.distance) shiftTile(best.tiles, size, count - 2);
  return { size, tiles: best.tiles };
}

export function createPuzzle(game, level, random = Math.random) {
  return game === 'conduit' ? circuitPuzzle(level, random) : slidingPuzzle(level, random);
}
