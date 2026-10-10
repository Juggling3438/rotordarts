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
 * Custom rule "Fächer": three numbered darts (no bull / miss) whose board offset
 * between consecutive darts is identical. Then every dart counts the highest segment.
 */
export function isFaecher(darts) {
  if (darts.length !== DARTS_PER_TURN) return false;
  if (darts.some((d) => d.segment === MISS || d.segment === BULL)) return false;
  const [a, b, c] = darts.map((d) => BOARD_RING.indexOf(d.segment));
  const n = BOARD_RING.length;
  return (b - a + n) % n === (c - b + n) % n;
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
  if (d.segment === MISS) return 'MISS';
  if (d.segment === BULL) return d.multiplier === 2 ? 'BULL' : '25';
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

/** Three-dart average for a player over completed turns (busts count as 0). */
export function threeDartAverage(state, playerId) {
  const turns = state.turns.filter((t) => t.playerId === playerId);
  if (turns.length === 0) return 0;
  const scored = turns.reduce((sum, t) => sum + (t.scoreBefore - t.scoreAfter), 0);
  const dartsThrown = turns.reduce((sum, t) => sum + t.darts.length, 0);
  return (scored / dartsThrown) * 3;
}
