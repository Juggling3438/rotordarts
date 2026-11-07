import { test, assert } from './harness.js';
import { createSoundPlayer, soundEventForDart } from '../src/ui/sound-player.js';
import { createSoundStore, createMemoryStorage, SOUNDS_KEY } from '../src/storage/players.js';
import { createPlayerManager } from '../src/ui/player-manager.js';
import { createPlayerStore } from '../src/storage/players.js';
import { dart } from '../src/engine/darts-engine.js';

// --- event mapping ---
test('sound event: miss is "out", bull and bullseye are "bull", T20 is "t20"', () => {
  assert.equal(soundEventForDart(dart(0)), 'out');
  assert.equal(soundEventForDart(dart(25, 1)), 'bull');
  assert.equal(soundEventForDart(dart(25, 2)), 'bull');
  assert.equal(soundEventForDart(dart(20, 3)), 't20');
});

test('sound event: other darts trigger no sound', () => {
  assert.equal(soundEventForDart(dart(20, 1)), null);
  assert.equal(soundEventForDart(dart(20, 2)), null);
  assert.equal(soundEventForDart(dart(19, 3)), null);
});

// --- sound store ---
test('sound store returns no sound for unknown players', () => {
  const store = createSoundStore({ storage: createMemoryStorage() });
  assert.deepEqual(store.get('x'), { t20: null, bull: null, out: null });
});

test('sound store persists choices per player and event', () => {
  const storage = createMemoryStorage();
  const store = createSoundStore({ storage });
  store.set('a', 't20', 'horn');
  store.set('a', 'out', 'boo');
  store.set('b', 'bull', 'bell');
  const reloaded = createSoundStore({ storage });
  assert.deepEqual(reloaded.get('a'), { t20: 'horn', bull: null, out: 'boo' });
  assert.deepEqual(reloaded.get('b'), { t20: null, bull: 'bell', out: null });
});

test('sound store: empty choice means no sound, remove clears a player', () => {
  const store = createSoundStore({ storage: createMemoryStorage() });
  store.set('a', 't20', 'horn');
  store.set('a', 't20', '');
  assert.equal(store.get('a').t20, null);
  store.set('a', 'bull', 'bell');
  store.remove('a');
  assert.deepEqual(store.get('a'), { t20: null, bull: null, out: null });
});

test('sound store rejects unknown events and survives corrupt data', () => {
  assert.throws(() => createSoundStore({ storage: createMemoryStorage() }).set('a', 'd20', 'x'));
  const store = createSoundStore({ storage: createMemoryStorage({ [SOUNDS_KEY]: '{nope' }) });
  assert.deepEqual(store.get('a'), { t20: null, bull: null, out: null });
});

// --- sound player ---
function fakeAudioFactory() {
  const created = [];
  const createAudio = (src) => {
    const audio = {
      src, playing: false, currentTime: 0, plays: 0,
      play() { this.playing = true; this.plays += 1; return Promise.resolve(); },
      pause() { this.playing = false; },
    };
    created.push(audio);
    return audio;
  };
  return { created, createAudio };
}

const LIB = [{ id: 'a', src: 'a.mp3' }, { id: 'b', src: 'b.mp3' }];

test('sound player plays the chosen sound and ignores null / unknown ids', () => {
  const { created, createAudio } = fakeAudioFactory();
  const player = createSoundPlayer({ library: LIB, createAudio });
  player.play(null);
  player.play('nope');
  assert.equal(created.length, 0);
  player.play('a');
  assert.equal(created.length, 1);
  assert.ok(created[0].playing);
});

test('sound player stops the running sound when a new one starts', () => {
  const { created, createAudio } = fakeAudioFactory();
  const player = createSoundPlayer({ library: LIB, createAudio });
  player.play('a');
  created[0].currentTime = 1.5;
  player.play('b');
  assert.ok(!created[0].playing);
  assert.equal(created[0].currentTime, 0);
  assert.ok(created[1].playing);
});

test('sound player restarts the same sound from the beginning', () => {
  const { created, createAudio } = fakeAudioFactory();
  const player = createSoundPlayer({ library: LIB, createAudio });
  player.play('a');
  created[0].currentTime = 2;
  player.play('a');
  assert.equal(created.length, 1, 'audio element is reused');
  assert.equal(created[0].currentTime, 0);
  assert.equal(created[0].plays, 2);
});

test('sound player swallows rejected playback (autoplay blocked)', async () => {
  const player = createSoundPlayer({
    library: LIB,
    createAudio: () => ({ play: () => Promise.reject(new Error('blocked')), pause() {} }),
  });
  player.play('a');
  await Promise.resolve();
});

// --- player manager ---
test('manager: sound selects persist the choice per player', () => {
  const storage = createMemoryStorage();
  const store = createPlayerStore({ storage, idGenerator: () => 'p1' });
  const soundStore = createSoundStore({ storage });
  const library = [{ id: 'horn', label: 'Horn', src: 'horn.mp3' }];
  store.add('Anna');
  const pm = createPlayerManager({ store, storage, soundStore, soundLibrary: library });
  const select = pm.element.querySelector('select[aria-label="T20 sound for Anna"]');
  assert.equal(select.value, '', 'defaults to no sound');
  assert.equal(select.options.length, 2);
  select.value = 'horn';
  select.dispatchEvent(new Event('change'));
  assert.equal(soundStore.get('p1').t20, 'horn');
  assert.equal(pm.element.querySelectorAll('.pm-sounds select').length, 3);
  pm.refresh();
  assert.equal(pm.element.querySelector('select[aria-label="T20 sound for Anna"]').value, 'horn');
});

test('manager: removing a player removes their sound choice', () => {
  const storage = createMemoryStorage();
  const store = createPlayerStore({ storage, idGenerator: () => 'p1' });
  const soundStore = createSoundStore({ storage });
  store.add('Anna');
  soundStore.set('p1', 'bull', 'horn');
  const pm = createPlayerManager({ store, storage, soundStore, soundLibrary: [] });
  pm.element.querySelector('button[aria-label="Remove Anna"]').click();
  assert.deepEqual(soundStore.get('p1'), { t20: null, bull: null, out: null });
});

test('manager: sound selection is hidden until the sound toggle is pressed', () => {
  const storage = createMemoryStorage();
  const store = createPlayerStore({ storage, idGenerator: () => 'p1' });
  store.add('Anna');
  const pm = createPlayerManager({ store, storage, soundStore: createSoundStore({ storage }), soundLibrary: [] });
  const panel = () => pm.element.querySelector('.pm-sounds');
  const toggle = () => pm.element.querySelector('button[aria-label="Sounds Anna"]');
  assert.ok(panel().hidden, 'collapsed by default');
  assert.equal(toggle().getAttribute('aria-expanded'), 'false');
  toggle().click();
  assert.ok(!panel().hidden);
  assert.equal(toggle().getAttribute('aria-expanded'), 'true');
  pm.refresh();
  assert.ok(!panel().hidden, 'stays open after re-render');
  toggle().click();
  assert.ok(panel().hidden);
});
