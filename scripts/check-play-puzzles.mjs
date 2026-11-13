import assert from 'node:assert/strict';
import { createPuzzle, neighbors, openConduitPorts, traceConduit, puzzleLevels, shiftDistance, shiftTile, turnCircuit } from '../src/play-puzzles.js';
import { slideProgress, slideRelease } from '../src/shift-board.js';

// A board turned in perspective can show a local horizontal slide on a diagonal.
assert.equal(slideProgress({ x: 50, y: 80 }, { x: 20, y: 120 }, -15, 20), .5);
assert.equal(slideProgress({ x: 50, y: 80 }, { x: 20, y: 120 }, 40, 30), 0);
assert.equal(slideProgress({ x: 50, y: 80 }, { x: 20, y: 120 }, 15, -20), 0);
assert.equal(slideProgress({ x: 50, y: 80 }, { x: 20, y: 120 }, -60, 80), 1);
assert.equal(slideProgress({ x: 50, y: 80 }, { x: 50, y: 80 }, -60, 80), 0);

for (const offset of [0, -.01, -.6, -1, .27]) {
  for (const speed of [-.01, 0, .01]) {
    const { duration, frames } = slideRelease(offset, speed);
    assert(duration >= 140 && duration <= 360);
    assert.equal(frames[0], offset);
    assert.equal(frames.at(-1), 0);
    frames.slice(1).forEach((position, index) => {
      assert(position * offset >= 0 && Math.abs(position) <= Math.abs(frames[index]));
    });
  }
}
assert(Math.abs(slideRelease(-.6, .004).frames[1]) < Math.abs(slideRelease(-.6, 0).frames[1]));

function rng(seed) {
  seed = Math.imul(seed, 0x9e3779b1);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

assert.equal(turnCircuit(8), 1);
assert.equal(turnCircuit(5), 10);
assert.equal(traceConduit([2, 8, 1, 1], 2, 0).size, 2);
assert.equal(traceConduit([4, 8, 2, 1], 2, 0).size, 1);
assert.equal(openConduitPorts([3, 8, 0, 0], 2, 0), 1);
assert.equal(openConduitPorts([6, 8, 2, 0], 2, 0), 4);
assert.deepEqual([...traceConduit([2, 12, 2, 9], 2, 0)], [
  [0, { from: null, inlet: 0 }],
  [1, { from: 0, inlet: 8 }],
  [3, { from: 1, inlet: 1 }],
  [2, { from: 3, inlet: 2 }],
]);

function canConnect({ tiles, size, source }) {
  const layout = [];
  function visit(index) {
    if (index === tiles.length) return traceConduit(layout, size, source).size === tiles.length;
    const column = index % size;
    const up = index >= size && Boolean(layout[index - size] & 4);
    const left = column > 0 && Boolean(layout[index - 1] & 2);
    let mask = tiles[index];
    do {
      if (Boolean(mask & 1) === up && Boolean(mask & 8) === left
        && (column < size - 1 || !(mask & 2)) && (index < size * (size - 1) || !(mask & 4))) {
        layout[index] = mask;
        if (visit(index + 1)) return true;
      }
      mask = turnCircuit(mask);
    } while (mask !== tiles[index]);
    return false;
  }
  return visit(0);
}

for (let level = 0; level < puzzleLevels; level++) {
  const circuitLayouts = new Set(), shiftLayouts = new Set();
  for (let seed = 1; seed <= 32; seed++) {
    const circuit = createPuzzle('conduit', level, rng(seed));
    assert.ok(circuit.tiles.every(mask => mask > 0 && mask <= 15));
    assert.ok(traceConduit(circuit.tiles, circuit.size, circuit.source).size < circuit.tiles.length);
    assert.ok(canConnect(circuit), `Conduit stage ${level + 1}, seed ${seed}`);
    circuitLayouts.add(circuit.tiles.join(','));
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
  assert.ok(circuitLayouts.size >= 16);
  assert.ok(shiftLayouts.size >= 16);
}

console.log('Conduit and Shift passed 160 seeded layouts each across all five stages.');
