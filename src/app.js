import { createGame, throwDart, undoDart, getCurrentPlayer, dart, DARTS_PER_TURN } from './engine/darts-engine.js';
import { createGameStore } from './storage/players.js';
import { createDartboard } from './ui/dartboard.js';
import { createPlayerManager } from './ui/player-manager.js';
import { createRulesMenu, describeRules } from './ui/rules-menu.js';
import { createScoreboard } from './ui/scoreboard.js';

const $ = (id) => document.getElementById(id);
const gameStore = createGameStore();
const scoreboard = createScoreboard();
$('scoreboard').append(scoreboard.element);

const board = createDartboard({ onThrow: (d, point) => handleThrow(d, point) });
$('board').append(board.element);

// --- setup screen ---
const startButton = $('start');
const players = createPlayerManager({ onChange: (sel) => { startButton.disabled = sel.length === 0; } });
const rulesMenu = createRulesMenu();
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

function status() {
  if (state.winnerId) {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return `🎯 ${winner.name} wins!`;
  }
  const last = state.turns.at(-1);
  const bust = last?.bust && state.turn.darts.length === 0 ? 'Bust! ' : '';
  return `${bust}${getCurrentPlayer(state).name} – dart ${state.turn.darts.length + 1} of ${DARTS_PER_TURN}`;
}

function render() {
  scoreboard.render(state);
  $('rules-label').textContent = describeRules(state.rules);
  $('status').textContent = status();
  $('status').classList.toggle('is-win', Boolean(state.winnerId));
  board.setDisabled(Boolean(state.winnerId));
  $('miss').disabled = Boolean(state.winnerId);
  $('undo').disabled = state.throws.length === 0;
  $('rematch').hidden = !state.winnerId;
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
$('miss').addEventListener('click', () => handleThrow(dart(0)));
$('undo').addEventListener('click', () => {
  state = undoDart(state);
  clearOnNext = false;
  board.clearMarkers();
  gameStore.save(state);
  render();
});
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
