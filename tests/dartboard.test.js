import { test, assert } from './harness.js';
import {
  hitTest, segmentAtAngle, polar, sectorPath, createDartboard, SEGMENT_ORDER, RADII,
} from '../src/ui/dartboard.js';
import { dartLabel } from '../src/engine/darts-engine.js';

const at = (r, deg) => dartLabel(hitTest(...polar(r, deg)));

// --- geometry ---
test('segment order contains 1-20 exactly once', () => {
  assert.equal(SEGMENT_ORDER.length, 20);
  assert.deepEqual([...SEGMENT_ORDER].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
});
test('polar: 0° is top, 90° is right', () => {
  const [x0, y0] = polar(10, 0);
  const [x90, y90] = polar(10, 90);
  assert.ok(Math.abs(x0) < 1e-9 && Math.abs(y0 + 10) < 1e-9, 'top');
  assert.ok(Math.abs(x90 - 10) < 1e-9 && Math.abs(y90) < 1e-9, 'right');
});
test('compass directions hit the right numbers', () => {
  assert.equal(segmentAtAngle(...polar(100, 0)), 20);
  assert.equal(segmentAtAngle(...polar(100, 90)), 6);
  assert.equal(segmentAtAngle(...polar(100, 180)), 3);
  assert.equal(segmentAtAngle(...polar(100, 270)), 11);
});
test('segment boundaries (20 | 1 at 9°, 5 | 20 at -9°)', () => {
  assert.equal(segmentAtAngle(...polar(100, 8.9)), 20);
  assert.equal(segmentAtAngle(...polar(100, 9.1)), 1);
  assert.equal(segmentAtAngle(...polar(100, -8.9)), 20);
  assert.equal(segmentAtAngle(...polar(100, -9.1)), 5);
  assert.equal(segmentAtAngle(...polar(100, 350)), 5); // 5 spans 333°–351°
  assert.equal(segmentAtAngle(...polar(100, 352)), 20);
});
test('rings along the 20', () => {
  assert.equal(at(0, 0), 'BULL');
  assert.equal(at(RADII.doubleBull, 0), 'BULL');
  assert.equal(at(30, 0), '25');
  assert.equal(at(60, 0), 'S20');
  assert.equal(at(95, 0), 'T20');
  assert.equal(at(120, 0), 'S20');
  assert.equal(at(160, 0), 'D20');
  assert.equal(at(RADII.doubleOuter, 0), 'D20');
  assert.equal(at(RADII.doubleOuter + 1, 0), 'MISS');
});
test('trebles around the board', () => {
  assert.equal(at(95, 90), 'T6');
  assert.equal(at(95, 180), 'T3');
  assert.equal(at(95, 18 * 11), 'T19');
  assert.equal(at(160, 18 * 2), 'D18');
});
test('sectorPath produces a closed path', () => {
  const d = sectorPath(10, 20, -9, 9);
  assert.ok(d.startsWith('M ') && d.endsWith('Z'));
  assert.equal((d.match(/A /g) || []).length, 2);
});

// --- DOM ---
function mount(options) {
  const board = createDartboard(options);
  board.element.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:420px;opacity:0;';
  document.body.append(board.element);
  return board;
}

function clickAt(board, x, y) {
  const rect = board.element.getBoundingClientRect();
  const scale = rect.width / (RADII.surround * 2);
  const clientX = rect.left + rect.width / 2 + x * scale;
  const clientY = rect.top + rect.height / 2 + y * scale;
  const target = document.elementFromPoint(clientX, clientY) ?? board.element;
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX, clientY }));
}

test('renders 80 ring segments, 2 bulls and 20 numbers', () => {
  const board = createDartboard();
  const svg = board.element;
  assert.equal(svg.querySelectorAll('.segments path').length, 80);
  assert.equal(svg.querySelectorAll('.bull').length, 2);
  assert.deepEqual([...svg.querySelectorAll('.number')].map((t) => Number(t.textContent)), [...SEGMENT_ORDER]);
  assert.equal(svg.querySelectorAll('.triple[data-segment="20"]').length, 1);
  assert.equal(svg.querySelectorAll('.single[data-segment="20"]').length, 2);
});
test('click emits the dart under the pointer and adds a marker', () => {
  const thrown = [];
  const board = mount({ onThrow: (d) => thrown.push(dartLabel(d)) });
  try {
    clickAt(board, 0, 0);
    clickAt(board, ...polar(95, 0));
    clickAt(board, ...polar(160, 90));
    clickAt(board, ...polar(200, 45));
    assert.deepEqual(thrown, ['BULL', 'T20', 'D6', 'MISS']);
    assert.equal(board.element.querySelectorAll('.marker').length, 4);
    board.clearMarkers();
    assert.equal(board.element.querySelectorAll('.marker').length, 0);
  } finally {
    board.destroy();
  }
});
test('disabled board ignores clicks', () => {
  const thrown = [];
  const board = mount({ onThrow: (d) => thrown.push(d) });
  try {
    board.setDisabled(true);
    clickAt(board, 0, 0);
    assert.equal(thrown.length, 0);
    assert.ok(board.element.classList.contains('is-disabled'));
    board.setDisabled(false);
    clickAt(board, 0, 0);
    assert.equal(thrown.length, 1);
  } finally {
    board.destroy();
  }
});
