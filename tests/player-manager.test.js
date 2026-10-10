import { test, assert } from './harness.js';
import { createPlayerManager, SELECTED_KEY } from '../src/ui/player-manager.js';
import { createPlayerStore, createMemoryStorage } from '../src/storage/players.js';

function setup() {
  const storage = createMemoryStorage();
  let n = 0;
  const store = createPlayerStore({ storage, idGenerator: () => `id${++n}` });
  const changes = [];
  const pm = createPlayerManager({ store, storage, onChange: (s) => changes.push(s.map((p) => p.name)) });
  document.body.append(pm.element);
  return { pm, store, storage, changes, done: () => pm.destroy() };
}

function add(pm, name) {
  pm.element.querySelector('input[name="name"]').value = name;
  pm.element.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
}

const names = (pm) => [...pm.element.querySelectorAll('.pm-name')].map((n) => n.textContent);
const click = (pm, label) => pm.element.querySelector(`button[aria-label="${label}"]`).click();

test('manager: adding players renders them and selects them by default', () => {
  const { pm, store, done } = setup();
  add(pm, 'Anna');
  add(pm, ' Ben ');
  assert.deepEqual(names(pm), ['Anna', 'Ben']);
  assert.deepEqual(store.list().map((p) => p.name), ['Anna', 'Ben']);
  assert.deepEqual(pm.getSelected().map((p) => p.name), ['Anna', 'Ben']);
  done();
});

test('manager: invalid and duplicate names show an error', () => {
  const { pm, done } = setup();
  add(pm, 'Anna');
  add(pm, 'anna');
  assert.ok(pm.element.querySelector('.pm-error').textContent.includes('already exists'));
  add(pm, '   ');
  assert.ok(pm.element.querySelector('.pm-error').textContent.length > 0);
  assert.deepEqual(names(pm), ['Anna']);
  done();
});

test('manager: remove and reorder', () => {
  const { pm, done } = setup();
  ['A', 'B', 'C'].forEach((n) => add(pm, n));
  click(pm, 'Move up C');
  assert.deepEqual(names(pm), ['A', 'C', 'B']);
  click(pm, 'Move down A');
  assert.deepEqual(names(pm), ['C', 'A', 'B']);
  click(pm, 'Remove A');
  assert.deepEqual(names(pm), ['C', 'B']);
  done();
});

test('manager: rename via inline edit', () => {
  const { pm, store, done } = setup();
  add(pm, 'Anna');
  click(pm, 'Rename Anna');
  const edit = pm.element.querySelector('.pm-rename');
  edit.value = 'Anne';
  edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  assert.deepEqual(names(pm), ['Anne']);
  assert.equal(store.list()[0].name, 'Anne');
  done();
});

test('manager: unchecking a player removes them from the selection and persists it', () => {
  const { pm, storage, changes, done } = setup();
  ['A', 'B', 'C'].forEach((n) => add(pm, n));
  const box = pm.element.querySelector('input[aria-label="Play: B"]');
  box.checked = false;
  box.dispatchEvent(new Event('change'));
  assert.deepEqual(pm.getSelected().map((p) => p.name), ['A', 'C']);
  assert.deepEqual(changes.at(-1), ['A', 'C']);
  assert.equal(JSON.parse(storage.getItem(SELECTED_KEY)).length, 2);
  done();
});

test('manager: selection is restored from storage', () => {
  const storage = createMemoryStorage();
  const store = createPlayerStore({ storage });
  const a = store.add('A');
  store.add('B');
  storage.setItem(SELECTED_KEY, JSON.stringify([a.id]));
  const pm = createPlayerManager({ store, storage });
  assert.deepEqual(pm.getSelected().map((p) => p.name), ['A']);
});
