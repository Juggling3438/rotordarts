/** Active players with their score, current darts and average. Pure view: render(state). */
import { dartLabel, getCurrentPlayer, threeDartAverage, turnValues, DARTS_PER_TURN } from '../engine/darts-engine.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createScoreboard() {
  const element = el('ol', 'scoreboard');

  function render(state) {
    const current = getCurrentPlayer(state);
    element.replaceChildren(
      ...state.players.map((p) => {
        const isCurrent = p.id === current.id;
        const li = el('li', 'sb-player');
        li.dataset.id = p.id;
        li.classList.toggle('is-current', isCurrent && !state.winnerId);
        li.classList.toggle('is-winner', p.id === state.winnerId);

        const isWinner = p.id === state.winnerId;
        const name = el('span', 'sb-name', isWinner ? `👑 ${p.name}` : p.name);

        // During play show the current turn's score; once there's a winner, show the average.
        let avgText;
        if (state.winnerId) {
          avgText = `∅ ${threeDartAverage(state, p.id).toFixed(1)}`;
        } else if (isCurrent) {
          const thrown = turnValues(state.turn.darts, state.rules).reduce((s, v) => s + v, 0);
          avgText = String(thrown);
        } else {
          const lastTurn = state.turns.findLast((t) => t.playerId === p.id);
          avgText = String(lastTurn ? lastTurn.values.reduce((s, v) => s + v, 0) : 0);
        }
        const avg = el('span', 'sb-avg', avgText);
        const score = el('span', 'sb-score', String(p.score));

        // A player's darts stay visible until that same player throws their next dart:
        // live darts while their turn is in progress, otherwise their last completed turn.
        const darts = el('span', 'sb-darts');
        const live = isCurrent && state.turn.darts.length > 0;
        const lastTurn = state.turns.findLast((t) => t.playerId === p.id);
        const thrown = (live ? state.turn.darts : lastTurn?.darts ?? []).map(dartLabel);
        const slots = Array.from({ length: DARTS_PER_TURN }, (_, i) => thrown[i] ?? '·');
        darts.textContent = slots.join('  ');
        darts.classList.toggle('is-finished', !live);
        if (!live && lastTurn?.bust) {
          darts.textContent += '  BUST';
          darts.classList.add('is-bust');
        }
        li.append(name, avg, darts, score);
        return li;
      }),
    );
  }

  return { element, render };
}
