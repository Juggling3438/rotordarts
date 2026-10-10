import { test, assert } from './harness.js';
import {
  createPlayerStore, createGameStore, createMemoryStorage, normalizeName,
  PLAYERS_KEY, GAME_KEY, MAX_NAME_LENGTH,
} from '../src/storage/players.js';
import { createGame, createRules, dart, throwDart, undoDart } from '../src/engine/darts-engine.js';

function setup(initial) {
  const storage = createMemoryStorage(initial);
  let n = 0;
  const store = createPlayerStore({ storage, idGenerator: () => `id${++n}` });
  return { storage, store };
}

// --- names ---
test('normalizeName trims and collapses whitespace', () => {
  assert.equal(normalizeName('  Phil   the  Power '), 'Phil the Power');
});
test('normalizeName rejects empty and too long names', () => {
  assert.throws(() => normalizeName('   '));
  assert.throws(() => normalizeName(null));
  assert.throws(() => normalizeName('x'.repeat(MAX_NAME_LENGTH + 1)));
  assert.equal(normalizeName('x'.repeat(MAX_NAME_LENGTH)).length, MAX_NAME_LENGTH);
});

// --- player store ---
test('empty store lists no players', () => {
  assert.deepEqual(setup().store.list(), []);
});
test('add stores player and persists to storage', () => {
  const { storage, store } = setup();
  const p = store.add(' Alice ');
  assert.deepEqual(p, { id: 'id1', name: 'Alice' });
  assert.deepEqual(JSON.parse(storage.getItem(PLAYERS_KEY)), [{ id: 'id1', name: 'Alice' }]);
});
test('players survive a new store instance (reload)', () => {
  const { storage, store } = setup();
  store.add('Alice');
  store.add('Bob');
  const reloaded = createPlayerStore({ storage });
  assert.deepEqual(reloaded.list().map((p) => p.name), ['Alice', 'Bob']);
});
test('duplicate names are rejected case-insensitively', () => {
  const { store } = setup();
  store.add('Alice');
  assert.throws(() => store.add('alice'));
  assert.equal(store.list().length, 1);
});
test('rename updates name', () => {
  const { store } = setup();
  const p = store.add('Alice');
  assert.equal(store.rename(p.id, 'Alicia').name, 'Alicia');
  assert.equal(store.get(p.id).name, 'Alicia');
});
test('rename to own name with different case is allowed', () => {
  const { store } = setup();
  const p = store.add('alice');
  assert.equal(store.rename(p.id, 'Alice').name, 'Alice');
});
test('rename rejects duplicates and unknown ids', () => {
  const { store } = setup();
  store.add('Alice');
  const bob = store.add('Bob');
  assert.throws(() => store.rename(bob.id, 'ALICE'));
  assert.throws(() => store.rename('nope', 'Carl'));
});
test('remove deletes player', () => {
  const { store } = setup();
  const a = store.add('Alice');
  store.add('Bob');
  assert.equal(store.remove(a.id), true);
  assert.deepEqual(store.list().map((p) => p.name), ['Bob']);
  assert.equal(store.remove('nope'), false);
});
test('get returns null for unknown id', () => {
  assert.equal(setup().store.get('nope'), null);
});
test('move changes throwing order and clamps index', () => {
  const { store } = setup();
  store.add('A'); store.add('B');
  const c = store.add('C');
  assert.deepEqual(store.move(c.id, 0).map((p) => p.name), ['C', 'A', 'B']);
  assert.deepEqual(store.move(c.id, 99).map((p) => p.name), ['A', 'B', 'C']);
  assert.throws(() => store.move('nope', 0));
});
test('corrupt storage data falls back to empty list', () => {
  assert.deepEqual(setup({ [PLAYERS_KEY]: '{not json' }).store.list(), []);
  assert.deepEqual(setup({ [PLAYERS_KEY]: '{"a":1}' }).store.list(), []);
});
test('invalid entries in storage are ignored', () => {
  const raw = JSON.stringify([{ id: 'x', name: 'Ok' }, { name: 'no id' }, null, { id: 'y', name: '' }]);
  assert.deepEqual(setup({ [PLAYERS_KEY]: raw }).store.list(), [{ id: 'x', name: 'Ok' }]);
});
test('default id generator produces unique ids', () => {
  const store = createPlayerStore({ storage: createMemoryStorage() });
  const a = store.add('A');
  const b = store.add('B');
  assert.ok(a.id && b.id && a.id !== b.id);
});

// --- game store ---
test('game store returns null when empty', () => {
  assert.equal(createGameStore({ storage: createMemoryStorage() }).load(), null);
});
test('game state round-trips and remains playable', () => {
  const storage = createMemoryStorage();
  const games = createGameStore({ storage });
  let g = createGame(createRules({ startScore: 301 }), [{ id: 'a', name: 'A' }]);
  g = throwDart(g, dart(20, 3));
  games.save(g);

  let loaded = createGameStore({ storage }).load();
  assert.equal(loaded.players[0].score, 241);
  loaded = throwDart(loaded, dart(19, 3));
  assert.equal(loaded.players[0].score, 184);
  assert.equal(undoDart(undoDart(loaded)).players[0].score, 301);
});
test('game store clear and corrupt data', () => {
  const storage = createMemoryStorage({ [GAME_KEY]: 'garbage' });
  const games = createGameStore({ storage });
  assert.equal(games.load(), null);
  games.save({ rules: {}, players: [], throws: [] });
  games.clear();
  assert.equal(games.load(), null);
});
