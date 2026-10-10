import { test, assert } from './harness.js';
import {
  createRules, createGame, dart, dartLabel, throwDart, undoDart, isBust,
  getCurrentPlayer, threeDartAverage, OUT_MODES,
} from '../src/engine/darts-engine.js';

const players = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }];
const throwAll = (state, darts) => darts.reduce(throwDart, state);

/** Bring player 'a' to a given score quickly by editing state (test helper). */
function withScore(state, score) {
  return {
    ...state,
    players: state.players.map((p, i) => (i === 0 ? { ...p, score } : p)),
    turn: { darts: [], startScore: score },
  };
}

// --- rules ---
test('rules default to 501 double out', () => {
  assert.deepEqual(createRules(), { startScore: 501, outMode: 'double' });
});
test('rules reject invalid values', () => {
  assert.throws(() => createRules({ startScore: 400 }));
  assert.throws(() => createRules({ outMode: 'master' }));
});

// --- darts ---
test('dart values', () => {
  assert.equal(dart(20, 3).value, 60);
  assert.equal(dart(25, 2).value, 50);
  assert.equal(dart(0).value, 0);
});
test('invalid darts throw', () => {
  assert.throws(() => dart(21));
  assert.throws(() => dart(25, 3));
  assert.throws(() => dart(20, 4));
  assert.throws(() => dart(0, 2));
});
test('dart labels', () => {
  assert.equal(dartLabel(dart(20, 3)), 'T20');
  assert.equal(dartLabel(dart(16, 2)), 'D16');
  assert.equal(dartLabel(dart(25, 2)), 'BULL');
  assert.equal(dartLabel(dart(25)), '25');
  assert.equal(dartLabel(dart(0)), 'MISS');
});

// --- game flow ---
test('new game sets start score for all players', () => {
  const g = createGame(createRules({ startScore: 301 }), players);
  assert.deepEqual(g.players.map((p) => p.score), [301, 301]);
  assert.equal(getCurrentPlayer(g).id, 'a');
});
test('createGame requires players', () => {
  assert.throws(() => createGame(createRules(), []));
});
test('scores are subtracted and turn passes after 3 darts', () => {
  let g = createGame(createRules(), players);
  g = throwAll(g, [dart(20, 3), dart(20, 3), dart(20, 3)]);
  assert.equal(g.players[0].score, 321);
  assert.equal(getCurrentPlayer(g).id, 'b');
  assert.equal(g.turn.darts.length, 0);
  assert.equal(g.turns.length, 1);
});
test('turn stays with player before 3 darts', () => {
  let g = createGame(createRules(), players);
  g = throwDart(g, dart(5));
  assert.equal(getCurrentPlayer(g).id, 'a');
  assert.equal(g.turn.darts.length, 1);
});
test('players rotate back to first', () => {
  let g = createGame(createRules(), players);
  g = throwAll(g, Array(6).fill(dart(1)));
  assert.equal(getCurrentPlayer(g).id, 'a');
});

// --- bust / checkout ---
test('isBust rules', () => {
  assert.ok(isBust(-1, dart(1), OUT_MODES.STRAIGHT));
  assert.ok(!isBust(0, dart(1), OUT_MODES.STRAIGHT));
  assert.ok(!isBust(1, dart(1), OUT_MODES.STRAIGHT));
  assert.ok(isBust(1, dart(1), OUT_MODES.DOUBLE));
  assert.ok(isBust(0, dart(10, 1), OUT_MODES.DOUBLE));
  assert.ok(!isBust(0, dart(10, 2), OUT_MODES.DOUBLE));
  assert.ok(!isBust(0, dart(25, 2), OUT_MODES.DOUBLE));
});
test('bust resets score to turn start and ends turn', () => {
  let g = withScore(createGame(createRules(), players), 40);
  g = throwAll(g, [dart(10), dart(20, 3)]);
  assert.equal(g.players[0].score, 40);
  assert.equal(getCurrentPlayer(g).id, 'b');
  assert.ok(g.turns[0].bust);
});
test('double out: single finish is a bust', () => {
  let g = withScore(createGame(createRules(), players), 20);
  g = throwDart(g, dart(20));
  assert.equal(g.players[0].score, 20);
  assert.equal(g.winnerId, null);
});
test('double out: leaving 1 is a bust', () => {
  let g = withScore(createGame(createRules(), players), 21);
  g = throwDart(g, dart(20));
  assert.equal(g.players[0].score, 21);
});
test('double out: double finish wins', () => {
  let g = withScore(createGame(createRules(), players), 40);
  g = throwDart(g, dart(20, 2));
  assert.equal(g.players[0].score, 0);
  assert.equal(g.winnerId, 'a');
});
test('double out: bull finish wins', () => {
  let g = withScore(createGame(createRules(), players), 50);
  g = throwDart(g, dart(25, 2));
  assert.equal(g.winnerId, 'a');
});
test('straight out: single finish wins', () => {
  let g = withScore(createGame(createRules({ outMode: 'straight' }), players), 20);
  g = throwDart(g, dart(20));
  assert.equal(g.winnerId, 'a');
});
test('no darts allowed after win', () => {
  let g = withScore(createGame(createRules({ outMode: 'straight' }), players), 20);
  g = throwDart(g, dart(20));
  assert.throws(() => throwDart(g, dart(1)));
});

// --- undo ---
test('undo restores previous state', () => {
  let g = createGame(createRules(), players);
  g = throwAll(g, [dart(20, 3), dart(20, 3), dart(20, 3), dart(5)]);
  g = undoDart(g);
  assert.equal(getCurrentPlayer(g).id, 'b');
  assert.equal(g.players[1].score, 501);
  g = undoDart(g);
  assert.equal(getCurrentPlayer(g).id, 'a');
  assert.equal(g.players[0].score, 381);
  assert.equal(g.turn.darts.length, 2);
});
test('undo on empty game is a no-op', () => {
  const g = createGame(createRules(), players);
  assert.equal(undoDart(g), g);
});
test('state is not mutated', () => {
  const g = createGame(createRules(), players);
  throwDart(g, dart(20));
  assert.equal(g.players[0].score, 501);
  assert.equal(g.throws.length, 0);
});

// --- stats ---
test('three dart average', () => {
  let g = createGame(createRules(), players);
  g = throwAll(g, [dart(20, 3), dart(20, 3), dart(20, 3)]);
  assert.equal(threeDartAverage(g, 'a'), 180);
  assert.equal(threeDartAverage(g, 'b'), 0);
});
