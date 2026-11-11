import assert from 'node:assert/strict';
import { createPuzzle, neighbors, puzzleLevels, shiftDistance, shiftTile, toggleLights } from '../src/play-puzzles.js';

function rng(seed) {
  seed = Math.imul(seed, 0x9e3779b1);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canTurnOff(tiles, size) {
  // Once the first row is chosen, every later press is forced by the row above.
  for (let firstRow = 0; firstRow < 2 ** size; firstRow++) {
    const candidate = tiles.slice();
    for (let column = 0; column < size; column++) {
      if (firstRow & (1 << column)) toggleLights(candidate, size, column);
    }
    for (let index = size; index < candidate.length; index++) {
      if (candidate[index - size]) toggleLights(candidate, size, index);
    }
    if (!candidate.some(Boolean)) return true;
  }
  return false;
}

for (let level = 0; level < puzzleLevels; level++) {
  const lightLayouts = new Set(), shiftLayouts = new Set();
  for (let seed = 1; seed <= 32; seed++) {
    const light = createPuzzle('afterglow', level, rng(seed));
    assert.ok(light.tiles.some(Boolean));
    assert.ok(canTurnOff(light.tiles, light.size));
    lightLayouts.add(light.tiles.join(''));
    const shift = createPuzzle('shift', level, rng(seed));
    const { size, tiles } = shift;
    const numbered = tiles.filter(Boolean);
    const gap = tiles.indexOf(0);
    const inversions = numbered.reduce((total, value, index) =>
      total + numbered.slice(index + 1).filter(other => other < value).length, 0);
    assert.equal(size % 2 ? inversions % 2 : (inversions + size - Math.floor(gap / size)) % 2,
      size % 2 ? 0 : 1);
    assert.ok(shiftDistance(tiles, size) >= [2, 6, 12, 18, 26][level]);
    shiftLayouts.add(tiles.join(','));
    const unchanged = tiles.slice();
    assert.equal(shiftTile(tiles, size, gap), -1);
    assert.deepEqual(tiles, unchanged);
    const adjacent = neighbors(gap, size)[0];
    assert.equal(shiftTile(tiles, size, adjacent), gap);
    assert.equal(shiftTile(tiles, size, gap), adjacent);
    assert.deepEqual(tiles, unchanged);
  }
  assert.ok(lightLayouts.size >= 12);
  assert.ok(shiftLayouts.size >= 16);
}

console.log('Afterglow and Shift passed 160 seeded layouts each across all five stages.');
