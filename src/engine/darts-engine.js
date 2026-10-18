/**
 * Rotordarts calculation engine.
 * Pure functions, immutable state, no DOM / storage access.
 * The whole game is serializable (JSON) so it can be persisted as-is.
 */

export const OUT_MODES = Object.freeze({ STRAIGHT: 'straight', DOUBLE: 'double' });
export const START_SCORES = Object.freeze([301, 501]);
export const DARTS_PER_TURN = 3;
export const BULL = 25;
export const MISS = 0;

/** Create a validated rule set. */
export function createRules({
  startScore = 501,
  outMode = OUT_MODES.DOUBLE,
  faecher = false,
  oppositeBull = false,
} = {}) {
  if (!START_SCORES.includes(startScore)) {
    throw new Error(`Invalid start score: ${startScore}`);
  }
  if (!Object.values(OUT_MODES).includes(outMode)) {
    throw new Error(`Invalid out mode: ${outMode}`);
  }
  return Object.freeze({ startScore, outMode, faecher: Boolean(faecher), oppositeBull: Boolean(oppositeBull) });
}

/** Segments in clockwise order around the board (starting at 20). */
export const BOARD_RING = Object.freeze([20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]);

/**
 * Custom rule "Fächer": three numbered darts (no bull / miss) that are equally
 * spaced around the board, regardless of the order they were thrown. This is the
 * case when one of the darts sits exactly halfway between the other two.
 */
export function isFaecher(darts) {
  if (darts.length !== DARTS_PER_TURN) return false;
  if (darts.some((d) => d.segment === MISS || d.segment === BULL)) return false;
  const [a, b, c] = darts.map((d) => BOARD_RING.indexOf(d.segment));
  const n = BOARD_RING.length;
  const step = (from, to) => (to - from + n) % n;
  return (
    step(a, b) === step(b, c) || // b is the middle dart
    step(b, a) === step(a, c) || // a is the middle dart
    step(a, c) === step(c, b)    // c is the middle dart
  );
}

/**
 * Custom rule "Opposite double bull": the first two darts are doubles on opposite
 * segments of the board (e.g. D1 + D19) and the third dart is the double bull.
 */
export function isOppositeDoubleBull(darts) {
  if (darts.length !== DARTS_PER_TURN) return false;
  const [a, b, c] = darts;
  if (a.multiplier !== 2 || b.multiplier !== 2) return false;
  if (a.segment === BULL || a.segment === MISS || b.segment === BULL || b.segment === MISS) return false;
  if (c.segment !== BULL || c.multiplier !== 2) return false;
  const half = BOARD_RING.length / 2;
  return (BOARD_RING.indexOf(a.segment) + half) % BOARD_RING.length === BOARD_RING.indexOf(b.segment);
}

/** Point value of each dart in a turn, applying custom rules. */
export function turnValues(darts, rules) {
  if (rules.faecher && isFaecher(darts)) {
    const top = Math.max(...darts.map((d) => d.segment));
    return darts.map((d) => top * d.multiplier);
  }
  return darts.map((d) => d.value);
}

/**
 * Create a dart. segment: 0 (miss), 1-20, or 25 (bull).
 * multiplier: 1 single, 2 double, 3 triple. Bull allows 1 (25) or 2 (50).
 */
export function dart(segment, multiplier = 1) {
  const validSegment =
    segment === MISS || segment === BULL || (Number.isInteger(segment) && segment >= 1 && segment <= 20);
  if (!validSegment) throw new Error(`Invalid segment: ${segment}`);

  const maxMultiplier = segment === MISS ? 1 : segment === BULL ? 2 : 3;
  if (!Number.isInteger(multiplier) || multiplier < 1 || multiplier > maxMultiplier) {
    throw new Error(`Invalid multiplier ${multiplier} for segment ${segment}`);
  }
  return Object.freeze({ segment, multiplier, value: segment * multiplier });
}

/** Human readable label, e.g. "T20", "D16", "BULL", "25", "MISS". */
export function dartLabel(d) {
  if (d.segment === MISS) return 'x';
  if (d.segment === BULL) return d.multiplier === 2 ? '50' : '25';
  return `${['', 'S', 'D', 'T'][d.multiplier]}${d.segment}`;
}

/** Whether a dart leaving `remaining` points is a bust under the given out mode. */
export function isBust(remaining, d, outMode) {
  if (remaining < 0) return true;
  if (outMode === OUT_MODES.DOUBLE) {
    if (remaining === 1) return true;
    if (remaining === 0 && d.multiplier !== 2) return true;
  }
  return false;
}

/**
 * Start a new game.
 * @param {object} rules  result of createRules()
 * @param {Array<{id:string,name:string}>} players
 */
export function createGame(rules, players) {
  if (!Array.isArray(players) || players.length === 0) {
    throw new Error('At least one player is required');
  }
  return {
    rules,
    players: players.map((p) => ({ id: p.id, name: p.name, score: rules.startScore })),
    currentPlayerIndex: 0,
    turn: { darts: [], startScore: rules.startScore },
    turns: [], // completed turns: { playerId, darts, bust, scoreBefore, scoreAfter }
    throws: [], // every dart thrown, in order (used for undo by replay)
    winnerId: null,
  };
}

export function getCurrentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

/** Apply one dart and return the new state. */
export function throwDart(state, d) {
  if (state.winnerId) throw new Error('Game is already finished');

  const index = state.currentPlayerIndex;
  const player = state.players[index];
  const darts = [...state.turn.darts, d];
  const values = turnValues(darts, state.rules);
  const instantWin = Boolean(state.rules.oppositeBull) && isOppositeDoubleBull(darts);
  const remaining = instantWin ? 0 : state.turn.startScore - values.reduce((s, v) => s + v, 0);
  const bust = !instantWin && isBust(remaining, d, state.rules.outMode);
  const checkout = instantWin || (!bust && remaining === 0);
  const turnOver = bust || checkout || darts.length === DARTS_PER_TURN;

  const newScore = bust ? state.turn.startScore : remaining;
  const players = state.players.map((p, i) => (i === index ? { ...p, score: newScore } : p));
  const throws = [...state.throws, d];

  if (!turnOver) {
    return { ...state, players, throws, turn: { ...state.turn, darts } };
  }

  const completedTurn = {
    playerId: player.id,
    darts,
    bust,
    values,
    scoreBefore: state.turn.startScore,
    scoreAfter: newScore,
  };
  const nextIndex = checkout ? index : (index + 1) % players.length;

  return {
    ...state,
    players,
    throws,
    turns: [...state.turns, completedTurn],
    currentPlayerIndex: nextIndex,
    turn: { darts: checkout ? darts : [], startScore: players[nextIndex].score },
    winnerId: checkout ? player.id : null,
  };
}

/** Undo the last dart by replaying all previous throws. */
export function undoDart(state) {
  if (state.throws.length === 0) return state;
  const fresh = createGame(state.rules, state.players);
  return state.throws.slice(0, -1).reduce(throwDart, fresh);
}

/**
 * Returns the recommended next dart for the current player, or null if no hint applies.
 * Hints are only shown for scores 2–170 (the maximum double-out checkout).
 * For straight out the hint is simply the field that covers the remaining score.
 *
 * @param {number} score      remaining score of the current player
 * @param {string} outMode    OUT_MODES.DOUBLE or OUT_MODES.STRAIGHT
 * @param {number} dartsLeft  darts remaining in this turn (1, 2, or 3)
 * @returns {{ segment: number, multiplier: number } | null}
 */
export function checkoutHint(score, outMode, dartsLeft) {
  if (score <= 1 || score > 170) return null;
  if (dartsLeft < 1 || dartsLeft > 3) return null;

  if (outMode === OUT_MODES.STRAIGHT) {
    if (score === BULL * 2) return { segment: BULL, multiplier: 2 };
    if (score === BULL) return { segment: BULL, multiplier: 1 };
    if (score <= 20) return { segment: score, multiplier: 1 };
    if (score <= 40 && score % 2 === 0) return { segment: score / 2, multiplier: 2 };
    if (score <= 60 && score % 3 === 0) return { segment: score / 3, multiplier: 3 };
    return null;
  }

  // Double out: pick the best route. Prefer a route that fits exactly within
  // dartsLeft; if none fits, fall back to the shortest route and show the dart
  // at the current step (clamped to index 0 if we're "behind schedule").
  const routes = DOUBLE_OUT_ROUTES[score];
  if (!routes) return null;

  // Best route: fewest darts, preference already encoded in table order.
  const best = routes[0];
  const idx = best.length - dartsLeft;
  // idx < 0 means the route needs fewer darts than we have left → show first dart.
  // idx >= best.length means we're past the end (shouldn't happen) → show last dart.
  return best[Math.max(0, Math.min(idx, best.length - 1))];
}

/**
 * Standard double-out checkout routes for scores 2–170.
 * Generated and verified programmatically – every route sums to the key
 * and ends on a double (multiplier 2). Scores with no valid route are omitted.
 * Routes with fewer darts are preferred; T20 is preferred as first dart.
 */
const DOUBLE_OUT_ROUTES = (() => {
  const D = (s) => ({ segment: s, multiplier: 2 });
  const S = (s) => ({ segment: s, multiplier: 1 });
  const T = (s) => ({ segment: s, multiplier: 3 });
  const B1 = { segment: BULL, multiplier: 1 };
  const B2 = { segment: BULL, multiplier: 2 };

  return Object.freeze({
    // ── 1-dart finishes ──────────────────────────────────────────────────────
    2:   [[D(1)]],   4:   [[D(2)]],   6:   [[D(3)]],   8:   [[D(4)]],
    10:  [[D(5)]],  12:  [[D(6)]],  14:  [[D(7)]],  16:  [[D(8)]],
    18:  [[D(9)]],  20:  [[D(10)]], 22:  [[D(11)]], 24:  [[D(12)]],
    26:  [[D(13)]], 28:  [[D(14)]], 30:  [[D(15)]], 32:  [[D(16)]],
    34:  [[D(17)]], 36:  [[D(18)]], 38:  [[D(19)]], 40:  [[D(20)]],
    50:  [[B2]],

    // ── 2-dart finishes ──────────────────────────────────────────────────────
    3:   [[S(1),  D(1)]],  5:   [[S(1),  D(2)]],  7:   [[S(1),  D(3)]],
    9:   [[S(1),  D(4)]],  11:  [[S(1),  D(5)]],  13:  [[S(1),  D(6)]],
    15:  [[S(1),  D(7)]],  17:  [[S(1),  D(8)]],  19:  [[S(1),  D(9)]],
    21:  [[S(1),  D(10)]], 23:  [[S(1),  D(11)]], 25:  [[S(1),  D(12)]],
    27:  [[S(1),  D(13)]], 29:  [[S(1),  D(14)]], 31:  [[S(1),  D(15)]],
    33:  [[S(1),  D(16)]], 35:  [[S(1),  D(17)]], 37:  [[S(1),  D(18)]],
    39:  [[S(1),  D(19)]], 41:  [[S(1),  D(20)]],
    42:  [[D(1),  D(20)]], 43:  [[T(1),  D(20)]], 44:  [[D(2),  D(20)]],
    45:  [[T(3),  D(18)]], 46:  [[T(2),  D(20)]], 47:  [[T(3),  D(19)]],
    48:  [[D(4),  D(20)]], 49:  [[T(3),  D(20)]],
    51:  [[S(1),  B2]],    52:  [[D(1),  B2]],    53:  [[T(1),  B2]],
    54:  [[D(2),  B2]],    55:  [[S(5),  B2]],    56:  [[T(2),  B2]],
    57:  [[S(7),  B2]],    58:  [[D(4),  B2]],    59:  [[T(3),  B2]],
    60:  [[D(5),  B2]],    61:  [[T(7),  D(20)]], 62:  [[T(4),  B2]],
    63:  [[T(9),  D(18)]], 64:  [[D(7),  B2]],    65:  [[T(5),  B2]],
    66:  [[D(8),  B2]],    67:  [[T(9),  D(20)]], 68:  [[T(6),  B2]],
    69:  [[T(11), D(18)]], 70:  [[D(10), B2]],    71:  [[T(7),  B2]],
    72:  [[D(11), B2]],    73:  [[T(11), D(20)]], 74:  [[T(8),  B2]],
    75:  [[T(13), D(18)]], 76:  [[T(12), D(20)]], 77:  [[T(9),  B2]],
    78:  [[D(14), B2]],    79:  [[T(13), D(20)]], 80:  [[T(10), B2]],
    81:  [[T(15), D(18)]], 82:  [[T(14), D(20)]], 83:  [[T(11), B2]],
    84:  [[T(16), D(18)]], 85:  [[T(15), D(20)]], 86:  [[T(12), B2]],
    87:  [[T(17), D(18)]], 88:  [[T(16), D(20)]], 89:  [[T(13), B2]],
    90:  [[T(18), D(18)]], 91:  [[T(17), D(20)]], 92:  [[T(14), B2]],
    93:  [[T(19), D(18)]], 94:  [[T(18), D(20)]], 95:  [[T(15), B2]],
    96:  [[T(20), D(18)]], 97:  [[T(19), D(20)]], 98:  [[T(16), B2]],
    100: [[T(20), D(20)]], 101: [[T(17), B2]],    104: [[T(18), B2]],
    107: [[T(19), B2]],    110: [[T(20), B2]],

    // ── 3-dart finishes ──────────────────────────────────────────────────────
    99:  [[T(20), S(1),  D(19)]], // 60+1+38=99
    102: [[T(20), D(1),  D(20)]], // 60+2+40=102  (wait: D1=2, D20=40 → 102 ✓)
    103: [[T(20), T(1),  D(20)]], // 60+3+40=103
    105: [[T(20), T(3),  D(18)]], // 60+9+36=105
    106: [[T(20), T(2),  D(20)]], // 60+6+40=106
    108: [[T(20), D(4),  D(20)]], // 60+8+40=108  (wait: D4=8 → 108 ✓)
    109: [[T(20), T(3),  D(20)]], // 60+9+40=109
    111: [[T(20), S(1),  B2]],    // 60+1+50=111
    112: [[T(20), D(1),  B2]],    // 60+2+50=112
    113: [[T(20), T(1),  B2]],    // 60+3+50=113
    114: [[T(20), D(2),  B2]],    // 60+4+50=114
    115: [[T(20), S(5),  B2]],    // 60+5+50=115
    116: [[T(20), T(2),  B2]],    // 60+6+50=116
    117: [[T(20), S(7),  B2]],    // 60+7+50=117
    118: [[T(20), D(4),  B2]],    // 60+8+50=118
    119: [[T(20), T(3),  B2]],    // 60+9+50=119
    120: [[T(20), D(5),  B2]],    // 60+10+50=120
    121: [[T(20), T(7),  D(20)]], // 60+21+40=121
    122: [[T(20), T(4),  B2]],    // 60+12+50=122
    123: [[T(20), T(9),  D(18)]], // 60+27+36=123
    124: [[T(20), D(7),  B2]],    // 60+14+50=124
    125: [[T(20), T(5),  B2]],    // 60+15+50=125
    126: [[T(20), D(8),  B2]],    // 60+16+50=126
    127: [[T(20), T(9),  D(20)]], // 60+27+40=127
    128: [[T(20), T(6),  B2]],    // 60+18+50=128
    129: [[T(20), T(11), D(18)]], // 60+33+36=129
    130: [[T(20), D(10), B2]],    // 60+20+50=130
    131: [[T(20), T(7),  B2]],    // 60+21+50=131
    132: [[T(20), D(11), B2]],    // 60+22+50=132
    133: [[T(20), T(11), D(20)]], // 60+33+40=133
    134: [[T(20), T(8),  B2]],    // 60+24+50=134
    135: [[T(20), T(13), D(18)]], // 60+39+36=135
    136: [[T(20), T(12), D(20)]], // 60+36+40=136
    137: [[T(20), T(9),  B2]],    // 60+27+50=137
    138: [[T(20), D(14), B2]],    // 60+28+50=138
    139: [[T(20), T(13), D(20)]], // 60+39+40=139
    140: [[T(20), T(10), B2]],    // 60+30+50=140
    141: [[T(20), T(15), D(18)]], // 60+45+36=141
    142: [[T(20), T(14), D(20)]], // 60+42+40=142
    143: [[T(20), T(11), B2]],    // 60+33+50=143
    144: [[T(20), T(16), D(18)]], // 60+48+36=144
    145: [[T(20), T(15), D(20)]], // 60+45+40=145
    146: [[T(20), T(12), B2]],    // 60+36+50=146
    147: [[T(20), T(17), D(18)]], // 60+51+36=147
    148: [[T(20), T(16), D(20)]], // 60+48+40=148
    149: [[T(20), T(13), B2]],    // 60+39+50=149
    150: [[T(20), T(18), D(18)]], // 60+54+36=150
    151: [[T(20), T(17), D(20)]], // 60+51+40=151
    152: [[T(20), T(14), B2]],    // 60+42+50=152
    153: [[T(20), T(19), D(18)]], // 60+57+36=153
    154: [[T(20), T(18), D(20)]], // 60+54+40=154
    155: [[T(20), T(15), B2]],    // 60+45+50=155
    156: [[T(20), T(20), D(18)]], // 60+60+36=156
    157: [[T(20), T(19), D(20)]], // 60+57+40=157
    158: [[T(20), T(16), B2]],    // 60+48+50=158
    160: [[T(20), T(20), D(20)]], // 60+60+40=160
    161: [[T(20), T(17), B2]],    // 60+51+50=161
    164: [[T(20), T(18), B2]],    // 60+54+50=164
    167: [[T(20), T(19), B2]],    // 60+57+50=167
    170: [[T(20), T(20), B2]],    // 60+60+50=170
  });
})();

/** Three-dart average for a player over completed turns (busts count as 0). */
export function threeDartAverage(state, playerId) {
  const turns = state.turns.filter((t) => t.playerId === playerId);
  if (turns.length === 0) return 0;
  const scored = turns.reduce((sum, t) => sum + (t.scoreBefore - t.scoreAfter), 0);
  const dartsThrown = turns.reduce((sum, t) => sum + t.darts.length, 0);
  return (scored / dartsThrown) * 3;
}
