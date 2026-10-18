import { test, assert } from './harness.js';
import {
  createRules, createGame, dart, dartLabel, throwDart, undoDart, isBust,
  getCurrentPlayer, threeDartAverage, OUT_MODES, isFaecher, turnValues, isOppositeDoubleBull,
  checkoutHint,
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
  assert.deepEqual(createRules(), { startScore: 501, outMode: 'double', faecher: false, oppositeBull: false });
});

// --- custom rule: opposite double bull ---
test('isOppositeDoubleBull needs opposite doubles then bull', () => {
  assert.ok(isOppositeDoubleBull([dart(1, 2), dart(19, 2), dart(25, 2)]));
  assert.ok(isOppositeDoubleBull([dart(19, 2), dart(1, 2), dart(25, 2)]));
  assert.ok(isOppositeDoubleBull([dart(20, 2), dart(3, 2), dart(25, 2)]));
  assert.ok(!isOppositeDoubleBull([dart(1, 2), dart(18, 2), dart(25, 2)])); // not opposite
  assert.ok(!isOppositeDoubleBull([dart(1, 2), dart(19, 1), dart(25, 2)])); // single
  assert.ok(!isOppositeDoubleBull([dart(1, 2), dart(19, 2), dart(25, 1)])); // single bull
  assert.ok(!isOppositeDoubleBull([dart(1, 2), dart(25, 2), dart(19, 2)])); // wrong order
});
test('opposite double bull is an instant win when enabled', () => {
  const rules = createRules({ oppositeBull: true });
  const s = throwAll(createGame(rules, players), [dart(1, 2), dart(19, 2), dart(25, 2)]);
  assert.equal(s.winnerId, 'a');
  assert.equal(s.players[0].score, 0);
});
test('opposite double bull does nothing when disabled', () => {
  const s = throwAll(createGame(createRules(), players), [dart(1, 2), dart(19, 2), dart(25, 2)]);
  assert.equal(s.winnerId, null);
  assert.equal(s.players[0].score, 501 - 2 - 38 - 50);
});
test('opposite double bull instant win can be undone', () => {
  const rules = createRules({ oppositeBull: true });
  let s = throwAll(createGame(rules, players), [dart(1, 2), dart(19, 2), dart(25, 2)]);
  s = undoDart(s);
  assert.equal(s.winnerId, null);
  assert.equal(s.players[0].score, 501 - 40);
});

// --- custom rule: Fächer ---
test('isFaecher detects equal board offset', () => {
  assert.ok(isFaecher([dart(20), dart(1), dart(18)]));
  assert.ok(isFaecher([dart(20), dart(6, 2), dart(3, 3)])); // 20, 6, 3: offset 5
  assert.ok(!isFaecher([dart(20), dart(1), dart(4)]));
  assert.ok(!isFaecher([dart(20), dart(25), dart(18)]));
  assert.ok(!isFaecher([dart(20), dart(1)]));
});
test('isFaecher is order independent', () => {
  // 20, 1, 18 are equally spaced; any throwing order is still a Fächer.
  assert.ok(isFaecher([dart(18), dart(20), dart(1)]));
  assert.ok(isFaecher([dart(1), dart(18), dart(20)]));
  assert.ok(isFaecher([dart(18), dart(1), dart(20)]));
  assert.ok(isFaecher([dart(1), dart(20), dart(18)]));
  // Unequally spaced segments stay a non-Fächer in every order.
  assert.ok(!isFaecher([dart(4), dart(20), dart(1)]));
  assert.ok(!isFaecher([dart(1), dart(4), dart(20)]));
});
test('Fächer: 20+1+18 scores 60', () => {
  const rules = createRules({ faecher: true });
  const s = throwAll(createGame(rules, players), [dart(20), dart(1), dart(18)]);
  assert.equal(s.players[0].score, 441);
});
test('Fächer keeps multipliers: 20 + D6 + T3 = 20 + D20 + T20', () => {
  const rules = createRules({ faecher: true });
  assert.deepEqual(turnValues([dart(20), dart(6, 2), dart(3, 3)], rules), [20, 40, 60]);
});
test('Fächer off: normal scoring', () => {
  const s = throwAll(createGame(createRules(), players), [dart(20), dart(1), dart(18)]);
  assert.equal(s.players[0].score, 462);
});
test('Fächer undo works', () => {
  const rules = createRules({ faecher: true });
  let s = throwAll(createGame(rules, players), [dart(20), dart(1), dart(18)]);
  s = undoDart(s);
  assert.equal(s.players[0].score, 501 - 21);
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

// --- checkout hints ---
test('checkoutHint: returns null outside hint range', () => {
  assert.equal(checkoutHint(1,   OUT_MODES.DOUBLE, 3), null);
  assert.equal(checkoutHint(171, OUT_MODES.DOUBLE, 3), null);
  assert.equal(checkoutHint(0,   OUT_MODES.DOUBLE, 3), null);
});
test('checkoutHint: 1-dart double-out finishes', () => {
  assert.deepEqual(checkoutHint(40, OUT_MODES.DOUBLE, 1), { segment: 20, multiplier: 2 });
  assert.deepEqual(checkoutHint(16, OUT_MODES.DOUBLE, 1), { segment: 8,  multiplier: 2 });
  assert.deepEqual(checkoutHint(50, OUT_MODES.DOUBLE, 1), { segment: 25, multiplier: 2 });
  assert.deepEqual(checkoutHint(2,  OUT_MODES.DOUBLE, 1), { segment: 1,  multiplier: 2 });
});
test('checkoutHint: 2-dart – shows first dart when dartsLeft=2', () => {
  // 41 = S1 + D20: with 2 darts left show S1
  assert.deepEqual(checkoutHint(41, OUT_MODES.DOUBLE, 2), { segment: 1, multiplier: 1 });
});
test('checkoutHint: 2-dart – shows finish dart when dartsLeft=1', () => {
  // 41 = S1 + D20: with only 1 dart left the checkout is impossible → null
  assert.equal(checkoutHint(41, OUT_MODES.DOUBLE, 1), null);
});
test('checkoutHint: double-out 41 with dartsLeft=1 must not suggest D20 (would leave 1)', () => {
  // Regression: D20=40, leaving 1 point which is an impossible double-out finish.
  // The hint must return null, not suggest D20.
  assert.equal(checkoutHint(41, OUT_MODES.DOUBLE, 1), null);
});
test('checkoutHint: 3-dart route returns null if fewer than needed darts remain', () => {
  // 106 = T20 + T2 + D20: impossible to finish with 1 or 2 darts left
  assert.equal(checkoutHint(106, OUT_MODES.DOUBLE, 1), null);
  assert.equal(checkoutHint(106, OUT_MODES.DOUBLE, 2), null);
  assert.deepEqual(checkoutHint(106, OUT_MODES.DOUBLE, 3), { segment: 20, multiplier: 3 });
  // 99 = T20 + S1 + D19: same rule
  assert.equal(checkoutHint(99, OUT_MODES.DOUBLE, 1), null);
  assert.equal(checkoutHint(99, OUT_MODES.DOUBLE, 2), null);
  assert.deepEqual(checkoutHint(99, OUT_MODES.DOUBLE, 3), { segment: 20, multiplier: 3 });
});
test('checkoutHint: 3-dart – shows correct dart at each step', () => {
  // 170 = T20 + T20 + B2: only possible with exactly 3 darts left
  assert.deepEqual(checkoutHint(170, OUT_MODES.DOUBLE, 3), { segment: 20, multiplier: 3 });
  assert.equal(checkoutHint(170, OUT_MODES.DOUBLE, 2), null);
  assert.equal(checkoutHint(170, OUT_MODES.DOUBLE, 1), null);
  // after T20 the score is 110 – a 2-dart finish
  assert.deepEqual(checkoutHint(110, OUT_MODES.DOUBLE, 2), { segment: 20, multiplier: 3 });
  assert.equal(checkoutHint(110, OUT_MODES.DOUBLE, 1), null);
  // after T20+T20 the score is 50 – a 1-dart finish
  assert.deepEqual(checkoutHint(50, OUT_MODES.DOUBLE, 1), { segment: 25, multiplier: 2 });
});
test('checkoutHint: no route for impossible scores', () => {
  assert.equal(checkoutHint(159, OUT_MODES.DOUBLE, 3), null);
  assert.equal(checkoutHint(169, OUT_MODES.DOUBLE, 3), null);
});
test('checkoutHint: straight out hints', () => {
  assert.deepEqual(checkoutHint(20, OUT_MODES.STRAIGHT, 1), { segment: 20, multiplier: 1 });
  assert.deepEqual(checkoutHint(40, OUT_MODES.STRAIGHT, 1), { segment: 20, multiplier: 2 });
  assert.deepEqual(checkoutHint(60, OUT_MODES.STRAIGHT, 1), { segment: 20, multiplier: 3 });
  assert.deepEqual(checkoutHint(50, OUT_MODES.STRAIGHT, 1), { segment: 25, multiplier: 2 });
  assert.deepEqual(checkoutHint(25, OUT_MODES.STRAIGHT, 1), { segment: 25, multiplier: 1 });
  // scores above 60 (and not bull) have no 1-dart finish → null
  assert.equal(checkoutHint(171, OUT_MODES.STRAIGHT, 3), null);
  assert.equal(checkoutHint(501, OUT_MODES.STRAIGHT, 3), null);
  // scores > 170 are NOT blocked for straight out (unlike double out)
  assert.equal(checkoutHint(200, OUT_MODES.STRAIGHT, 3), null); // no single dart covers 200
});