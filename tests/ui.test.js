import { test, assert } from './harness.js';
import { createRulesMenu, loadRules, RULES_KEY } from '../src/ui/rules-menu.js';
import { createScoreboard } from '../src/ui/scoreboard.js';
import { createMemoryStorage } from '../src/storage/players.js';
import { createGame, createRules, throwDart, dart } from '../src/engine/darts-engine.js';

const pick = (menu, name, value) => {
  const input = menu.element.querySelector(`input[name="${name}"][value="${value}"]`);
  input.checked = true;
  input.dispatchEvent(new Event('change'));
};

test('rules menu defaults to 501 double out', () => {
  const menu = createRulesMenu({ storage: createMemoryStorage() });
  assert.deepEqual(menu.getRules(), { startScore: 501, outMode: 'double', faecher: false, oppositeBull: false });
  assert.ok(menu.element.querySelector('input[value="501"]').checked);
});

test('rules menu changes rules, notifies and persists', () => {
  const storage = createMemoryStorage();
  const seen = [];
  const menu = createRulesMenu({ storage, onChange: (r) => seen.push(r) });
  pick(menu, 'startScore', 301);
  pick(menu, 'outMode', 'straight');
  const expected = { startScore: 301, outMode: 'straight', faecher: false, oppositeBull: false };
  assert.deepEqual(menu.getRules(), expected);
  assert.equal(seen.length, 2);
  assert.deepEqual(loadRules(storage), expected);
  assert.deepEqual(createRulesMenu({ storage }).getRules(), expected);
});

test('rules menu toggles custom rule Fächer and persists it', () => {
  const storage = createMemoryStorage();
  const menu = createRulesMenu({ storage });
  const box = menu.element.querySelector('.custom-rules input[type="checkbox"]');
  box.checked = true;
  box.dispatchEvent(new Event('change'));
  assert.equal(menu.getRules().faecher, true);
  assert.equal(loadRules(storage).faecher, true);
});

test('rules menu toggles custom rule Opposite double bull and persists it', () => {
  const storage = createMemoryStorage();
  const menu = createRulesMenu({ storage });
  const box = menu.element.querySelectorAll('.custom-rules input[type="checkbox"]')[1];
  box.checked = true;
  box.dispatchEvent(new Event('change'));
  assert.equal(menu.getRules().oppositeBull, true);
  assert.equal(loadRules(storage).oppositeBull, true);
});

test('loadRules falls back to defaults on corrupt or invalid data', () => {
  assert.deepEqual(loadRules(createMemoryStorage({ [RULES_KEY]: '{nope' })), { startScore: 501, outMode: 'double', faecher: false, oppositeBull: false });
  assert.deepEqual(loadRules(createMemoryStorage({ [RULES_KEY]: '{"startScore":7}' })), { startScore: 501, outMode: 'double', faecher: false, oppositeBull: false });
});

test('scoreboard shows scores, current player and thrown darts', () => {
  const sb = createScoreboard();
  let state = createGame(createRules({ startScore: 301 }), [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Ben' }]);
  state = throwDart(state, dart(20, 3));
  sb.render(state);
  const rows = [...sb.element.querySelectorAll('.sb-player')];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].querySelector('.sb-score').textContent, '241');
  assert.equal(rows[1].querySelector('.sb-score').textContent, '301');
  assert.ok(rows[0].classList.contains('is-current'));
  assert.ok(!rows[1].classList.contains('is-current'));
  assert.ok(rows[0].querySelector('.sb-darts').textContent.includes('T20'));
});

test('scoreboard keeps a player\'s last darts until that player throws again', () => {
  const sb = createScoreboard();
  const text = (i) => sb.element.querySelectorAll('.sb-darts')[i].textContent;
  let state = createGame(createRules({ startScore: 301 }), [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Ben' }]);
  for (const d of [dart(20, 3), dart(5, 1), dart(1, 1)]) state = throwDart(state, d);
  sb.render(state); // Ben's turn, nothing thrown yet
  assert.equal(text(0), 'T20  S5  S1');
  assert.equal(text(1), '·  ·  ·');
  state = throwDart(state, dart(19, 1));
  sb.render(state);
  assert.equal(text(0), 'T20  S5  S1', 'Anna keeps her darts while Ben throws');
  assert.equal(text(1), 'S19  ·  ·');
  for (const d of [dart(1, 1), dart(1, 1)]) state = throwDart(state, d);
  state = throwDart(state, dart(2, 1)); // Anna's first dart of her next turn
  sb.render(state);
  assert.equal(text(0), 'S2  ·  ·', 'Anna\'s old darts are replaced once she throws');
  assert.equal(text(1), 'S19  S1  S1', 'Ben keeps his last turn');
});

test('scoreboard marks the winner', () => {
  const sb = createScoreboard();
  let state = createGame(createRules({ startScore: 301, outMode: 'straight' }), [{ id: 'a', name: 'Anna' }]);
  for (const d of [dart(20, 3), dart(20, 3), dart(20, 3), dart(20, 3), dart(20, 3), dart(1, 1)]) {
    if (!state.winnerId) state = throwDart(state, d);
  }
  // 301 -> 241 -> 181 -> 121 -> 61 -> 1 -> ... finish with a single 1 is not yet 0, so finish explicitly
  state = createGame(createRules({ startScore: 301, outMode: 'straight' }), [{ id: 'a', name: 'Anna' }]);
  state = { ...state, players: [{ ...state.players[0], score: 5 }], turn: { darts: [], startScore: 5 } };
  state = throwDart(state, dart(5, 1));
  sb.render(state);
  assert.ok(sb.element.querySelector('.sb-player').classList.contains('is-winner'));
});
