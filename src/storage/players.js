/**
 * Player and game persistence.
 * Storage is injected (anything with getItem/setItem/removeItem), so it can be
 * tested with an in-memory fake and defaults to window.localStorage in the app.
 */

export const PLAYERS_KEY = 'rotordarts.players';
export const GAME_KEY = 'rotordarts.game';
export const MAX_NAME_LENGTH = 24;

/** Simple in-memory Storage implementation (tests, or fallback if localStorage is unavailable). */
export function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

/** Returns localStorage if usable (it can throw in private mode / disabled cookies), otherwise memory. */
export function getDefaultStorage() {
  try {
    const s = globalThis.localStorage;
    const probe = '__rotordarts_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return createMemoryStorage();
  }
}

/** crypto.randomUUID is only available in secure contexts (https/localhost), so fall back. */
function defaultIdGenerator() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback; // corrupt data should never crash the app
  }
}

function isValidPlayer(p) {
  return p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.length > 0;
}

/** Trim, collapse whitespace and validate a player name. Throws on invalid input. */
export function normalizeName(name) {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('Name must not be empty');
  if (clean.length > MAX_NAME_LENGTH) throw new Error(`Name must be at most ${MAX_NAME_LENGTH} characters`);
  return clean;
}

export function createPlayerStore({ storage = getDefaultStorage(), idGenerator = defaultIdGenerator } = {}) {
  function list() {
    const players = readJson(storage, PLAYERS_KEY, []);
    return Array.isArray(players) ? players.filter(isValidPlayer) : [];
  }

  function save(players) {
    storage.setItem(PLAYERS_KEY, JSON.stringify(players));
  }

  function assertUnique(players, name, exceptId = null) {
    const lower = name.toLowerCase();
    if (players.some((p) => p.id !== exceptId && p.name.toLowerCase() === lower)) {
      throw new Error(`Player "${name}" already exists`);
    }
  }

  function add(name) {
    const clean = normalizeName(name);
    const players = list();
    assertUnique(players, clean);
    const player = { id: idGenerator(), name: clean };
    save([...players, player]);
    return player;
  }

  function rename(id, name) {
    const clean = normalizeName(name);
    const players = list();
    if (!players.some((p) => p.id === id)) throw new Error(`Unknown player: ${id}`);
    assertUnique(players, clean, id);
    const updated = players.map((p) => (p.id === id ? { ...p, name: clean } : p));
    save(updated);
    return updated.find((p) => p.id === id);
  }

  function remove(id) {
    const players = list();
    const remaining = players.filter((p) => p.id !== id);
    if (remaining.length === players.length) return false;
    save(remaining);
    return true;
  }

  function get(id) {
    return list().find((p) => p.id === id) ?? null;
  }

  /** Move a player to a new position (throwing order). */
  function move(id, toIndex) {
    const players = list();
    const from = players.findIndex((p) => p.id === id);
    if (from === -1) throw new Error(`Unknown player: ${id}`);
    const [player] = players.splice(from, 1);
    const target = Math.max(0, Math.min(toIndex, players.length));
    players.splice(target, 0, player);
    save(players);
    return players;
  }

  return { list, add, rename, remove, get, move };
}

/** Persist the running game (engine state is plain JSON) so a reload doesn't lose it. */
export function createGameStore({ storage = getDefaultStorage() } = {}) {
  return {
    save(state) {
      storage.setItem(GAME_KEY, JSON.stringify(state));
    },
    load() {
      const state = readJson(storage, GAME_KEY, null);
      const looksValid =
        state && state.rules && Array.isArray(state.players) && Array.isArray(state.throws);
      return looksValid ? state : null;
    },
    clear() {
      storage.removeItem(GAME_KEY);
    },
  };
}
