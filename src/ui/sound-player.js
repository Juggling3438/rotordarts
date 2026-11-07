/**
 * Player sounds: the sound catalog, which throw triggers which sound event, and playback.
 * Only one sound plays at a time; a new sound stops the previous one.
 */
import { BULL, MISS } from '../engine/darts-engine.js';

/**
 * Available sounds. Files live in /sounds; add one entry per file.
 * `id` is what gets stored per player, so don't rename ids once in use.
 */
const SOUND_FILES = [
  { id: 'bobr', label: 'Bobr', file: 'bobr.m4a' },
  { id: 'kurwa', label: 'Kurwa', file: 'kurwa.m4a' },
  { id: 'raketa', label: 'Raketa', file: 'raketa.m4a' },
  { id: 'rata', label: 'Rata', file: 'rata.m4a' },
];

export const SOUND_LIBRARY = Object.freeze(
  SOUND_FILES.map(({ id, label, file }) =>
    Object.freeze({ id, label, src: new URL(`../../sounds/${file}`, import.meta.url).href })),
);

/**
 * Which sound event a dart triggers, or null.
 * "out" = the dart missed the board (click outside the board or the miss button).
 * "bull" = single bull (25) or bullseye (50).
 * @param {{segment:number, multiplier:number}} d the thrown dart
 * @returns {'t20'|'bull'|'out'|null}
 */
export function soundEventForDart(d) {
  if (d.segment === MISS) return 'out';
  if (d.segment === BULL) return 'bull';
  if (d.segment === 20 && d.multiplier === 3) return 't20';
  return null;
}

/**
 * Create a sound player.
 * @param {object} [options]
 * @param {Array<{id:string,src:string}>} [options.library]
 * @param {(src:string) => HTMLAudioElement} [options.createAudio] injectable for tests
 * @returns {{ play(id:string|null):void, stop():void }}
 */
export function createSoundPlayer({
  library = SOUND_LIBRARY,
  createAudio = (src) => new Audio(src),
} = {}) {
  const cache = new Map();
  let current = null;

  function audioFor(id) {
    const entry = library.find((s) => s.id === id);
    if (!entry) return null;
    if (!cache.has(id)) {
      const audio = createAudio(entry.src);
      audio.preload = 'auto';
      cache.set(id, audio);
    }
    return cache.get(id);
  }

  function stop() {
    if (!current) return;
    current.pause();
    current.currentTime = 0;
    current = null;
  }

  function play(id) {
    const audio = id ? audioFor(id) : null;
    if (!audio) return;
    stop();
    current = audio;
    // play() rejects if the browser blocks audio or the file is missing; sound is optional, so ignore it.
    audio.play()?.catch?.(() => {});
  }

  return { play, stop };
}
