/**
 * Player management panel: add, rename, remove, reorder and select the players for the next game.
 * The player store and storage are injected; the selection is persisted under SELECTED_KEY.
 */
import { createPlayerStore, getDefaultStorage, MAX_NAME_LENGTH } from '../storage/players.js';

export const SELECTED_KEY = 'rotordarts.selected';

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

export function createPlayerManager({
  store = createPlayerStore(),
  storage = getDefaultStorage(),
  onChange = () => {},
} = {}) {
  let editingId = null;
  let error = '';

  function loadSelected() {
    try {
      const ids = JSON.parse(storage.getItem(SELECTED_KEY));
      return Array.isArray(ids) ? ids : null;
    } catch {
      return null;
    }
  }
  // null = never chosen: everybody is selected by default.
  let selected = loadSelected();

  /** Selected players in throwing order, ignoring ids of removed players. */
  function getSelected() {
    const players = store.list();
    return selected === null ? players : players.filter((p) => selected.includes(p.id));
  }

  function setSelected(ids) {
    selected = ids;
    storage.setItem(SELECTED_KEY, JSON.stringify(ids));
  }

  function attempt(action) {
    try {
      action();
      error = '';
      return true;
    } catch (e) {
      error = e.message;
      return false;
    } finally {
      render();
      onChange(getSelected());
    }
  }

  const element = el('section', { className: 'player-manager' });

  function render() {
    const players = store.list();
    const chosen = new Set(getSelected().map((p) => p.id));

    const input = el('input', {
      type: 'text', name: 'name', placeholder: 'Add player', maxLength: MAX_NAME_LENGTH,
      autocomplete: 'off', ariaLabel: 'New player name',
    });
    const form = el('form', { className: 'pm-add' }, input, el('button', { type: 'submit', textContent: 'Add' }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value;
      const ok = attempt(() => {
        const p = store.add(name);
        if (selected !== null) setSelected([...selected, p.id]);
      });
      if (ok) element.querySelector('input[name="name"]')?.focus();
    });

    const list = el('ul', { className: 'pm-list' });
    players.forEach((p, i) => {
      const li = el('li', { className: 'pm-player' });
      li.dataset.id = p.id;

      const check = el('input', { type: 'checkbox', checked: chosen.has(p.id), ariaLabel: `Play: ${p.name}` });
      check.addEventListener('change', () => {
        const ids = players.map((q) => q.id).filter((id) => (id === p.id ? check.checked : chosen.has(id)));
        attempt(() => setSelected(ids));
      });
      li.append(check);

      if (editingId === p.id) {
        const edit = el('input', { type: 'text', className: 'pm-rename', value: p.name, maxLength: MAX_NAME_LENGTH });
        const finish = (save) => {
          editingId = null;
          if (save) attempt(() => store.rename(p.id, edit.value));
          else render();
        };
        edit.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') finish(true);
          if (e.key === 'Escape') finish(false);
        });
        edit.addEventListener('blur', () => editingId === p.id && finish(true));
        li.append(edit);
        queueMicrotask(() => edit.focus());
      } else {
        li.append(el('span', { className: 'pm-name', textContent: p.name }));
      }

      const btn = (label, text, handler, disabled = false) => {
        const b = el('button', { type: 'button', textContent: text, title: label, ariaLabel: `${label} ${p.name}`, disabled });
        b.addEventListener('click', handler);
        return b;
      };
      li.append(
        el('span', { className: 'pm-actions' },
          btn('Move up', '↑', () => attempt(() => store.move(p.id, i - 1)), i === 0),
          btn('Move down', '↓', () => attempt(() => store.move(p.id, i + 1)), i === players.length - 1),
          btn('Rename', '✎', () => { editingId = p.id; render(); }),
          btn('Remove', '✕', () => attempt(() => store.remove(p.id))),
        ),
      );
      list.append(li);
    });

    const status = el('p', { className: 'pm-error', role: 'alert', textContent: error });
    const hint = players.length === 0 ? el('p', { className: 'pm-empty', textContent: 'No players yet – add one above.' }) : '';
    element.replaceChildren(el('h2', { textContent: 'Players' }), form, status, hint, list);
  }

  render();

  return {
    element,
    getSelected,
    refresh: render,
    destroy: () => element.remove(),
  };
}
