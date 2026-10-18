import { createGame, throwDart, undoDart, dart, checkoutHint, DARTS_PER_TURN } from './engine/darts-engine.js';
import { createGameStore } from './storage/players.js';
import { createDartboard } from './ui/dartboard.js';
import { createPlayerManager } from './ui/player-manager.js';
import { createRulesMenu, describeRules } from './ui/rules-menu.js';
import { createScoreboard } from './ui/scoreboard.js';

const $ = (id) => document.getElementById(id);
const gameStore = createGameStore();
const scoreboard = createScoreboard();
$('scoreboard').append(scoreboard.element);

const board = createDartboard({
  onThrow: (d, point) => handleThrow(d, point),
  onMiss: () => handleThrow(dart(0)),
  onUndo: () => undo(),
});
$('board').append(board.element);

// --- setup screen ---
const startButton = $('start');
const players = createPlayerManager({ onChange: (sel) => { startButton.disabled = sel.length === 0; } });
const rulesMenu = createRulesMenu({ onChange: (_rules, hintsEnabled) => { if (state) updateHint(hintsEnabled); } });
$('setup-players').append(players.element);
$('setup-rules').append(rulesMenu.element);
startButton.disabled = players.getSelected().length === 0;

// --- game state ---
let state = gameStore.load();
let clearOnNext = false;

function show(screen) {
  $('setup').hidden = screen !== 'setup';
  $('game').hidden = screen !== 'game';
}

/** Update the checkout hint on the board for the current player. */
function updateHint(hintsEnabled = rulesMenu.getHintsEnabled()) {
  if (!state || state.winnerId || !hintsEnabled) {
    board.clearHint();
    return;
  }
  const dartsLeft = DARTS_PER_TURN - state.turn.darts.length;
  const currentPlayer = state.players[state.currentPlayerIndex];
  const hint = checkoutHint(currentPlayer.score, state.rules.outMode, dartsLeft);
  if (hint) {
    board.setHint(hint.segment, hint.multiplier);
  } else {
    board.clearHint();
  }
}

function render() {
  scoreboard.render(state);
  $('rules-label').textContent = describeRules(state.rules);
  board.setDisabled(Boolean(state.winnerId));
  $('rematch').hidden = !state.winnerId;
  updateHint();
}

function handleThrow(d, point) {
  if (!state || state.winnerId) return;
  if (clearOnNext) {
    board.clearMarkers();
    if (point) board.addMarker(point); // the board already drew it before the wipe
  }
  const turnsBefore = state.turns.length;
  state = throwDart(state, d);
  clearOnNext = state.turns.length > turnsBefore;
  gameStore.save(state);
  render();
}

function startGame(rules, selected) {
  state = createGame(rules, selected);
  clearOnNext = false;
  board.clearMarkers();
  gameStore.save(state);
  render();
  show('game');
}

startButton.addEventListener('click', () => startGame(rulesMenu.getRules(), players.getSelected()));
function undo() {
  state = undoDart(state);
  clearOnNext = false;
  board.clearMarkers();
  gameStore.save(state);
  render();
}
$('rematch').addEventListener('click', () => startGame(state.rules, state.players));
$('new-game').addEventListener('click', () => {
  if (!state.winnerId && state.throws.length > 0 && !confirm('Abandon the running game?')) return;
  gameStore.clear();
  show('setup');
});

if (state) {
  render();
  show('game');
} else {
  show('setup');
}
