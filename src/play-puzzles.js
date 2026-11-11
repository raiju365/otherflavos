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

export function toggleLights(tiles, size, index) {
  tiles[index] ^= 1;
  for (const cell of neighbors(index, size)) tiles[cell] ^= 1;
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

const lightStages = [[3, 2], [3, 4], [4, 6], [5, 9], [6, 15]];
const shiftStages = [[3, 10, 4], [3, 24, 9], [4, 44, 16], [4, 76, 24], [5, 128, 38]];

function lightPuzzle(level, random) {
  const [size, moves] = lightStages[level];
  const count = size * size;
  const tiles = Array(count).fill(0);
  const choices = Array.from({ length: count }, (_, index) => index);
  for (let move = 0; move < moves; move++) {
    const [index] = choices.splice(Math.floor(random() * choices.length), 1);
    toggleLights(tiles, size, index);
  }
  if (!tiles.some(Boolean)) toggleLights(tiles, size, choices[0]);
  return { size, tiles };
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
  return game === 'afterglow' ? lightPuzzle(level, random) : slidingPuzzle(level, random);
}
