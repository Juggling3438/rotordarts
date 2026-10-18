/**
 * Clickable SVG dartboard.
 * Geometry (hitTest, sectorPath) is pure and unit tested; createDartboard builds the DOM.
 * Hits are resolved from the click coordinates, not from the clicked element, so the
 * area outside the board counts as a miss and boundaries are always consistent.
 */
import { dart, dartLabel, BULL, MISS } from '../engine/darts-engine.js';

/** Numbers clockwise starting at the top. */
export const SEGMENT_ORDER = Object.freeze([20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]);
const SEGMENT_ANGLE = 360 / SEGMENT_ORDER.length;

/** Radii in board units. Triple/double rings are enlarged compared to a real board for easier clicking. */
export const RADII = Object.freeze({
  doubleBull: 16,
  singleBull: 41,
  tripleInner: 85,
  tripleOuter: 107,
  doubleInner: 150,
  doubleOuter: 170,
  // Numbers sit inside the (larger) outer single ring so the board can fill the screen on phones.
  numbers: (107 + 150) / 2,
  surround: 178,
});

const RINGS = Object.freeze([
  { kind: 'single', multiplier: 1, inner: RADII.singleBull, outer: RADII.tripleInner },
  { kind: 'triple', multiplier: 3, inner: RADII.tripleInner, outer: RADII.tripleOuter },
  { kind: 'single', multiplier: 1, inner: RADII.tripleOuter, outer: RADII.doubleInner },
  { kind: 'double', multiplier: 2, inner: RADII.doubleInner, outer: RADII.doubleOuter },
]);

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Point at radius r and angle (degrees clockwise from 12 o'clock), in SVG coordinates (y down). */
export function polar(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), -r * Math.cos(a)];
}

const fmt = (n) => Number(n.toFixed(3));

/** SVG path for a ring sector between two radii and two angles. */
export function sectorPath(rInner, rOuter, startDeg, endDeg) {
  const [x1, y1] = polar(rOuter, startDeg);
  const [x2, y2] = polar(rOuter, endDeg);
  const [x3, y3] = polar(rInner, endDeg);
  const [x4, y4] = polar(rInner, startDeg);
  return [
    `M ${fmt(x1)} ${fmt(y1)}`,
    `A ${rOuter} ${rOuter} 0 0 1 ${fmt(x2)} ${fmt(y2)}`,
    `L ${fmt(x3)} ${fmt(y3)}`,
    `A ${rInner} ${rInner} 0 0 0 ${fmt(x4)} ${fmt(y4)}`,
    'Z',
  ].join(' ');
}

/** Number for a board coordinate, by angle only. */
export function segmentAtAngle(x, y) {
  const deg = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
  const index = Math.floor(((deg + SEGMENT_ANGLE / 2) % 360) / SEGMENT_ANGLE);
  return SEGMENT_ORDER[index];
}

/** Map a board coordinate (origin at center, y down) to a dart. */
export function hitTest(x, y) {
  const r = Math.hypot(x, y);
  if (r <= RADII.doubleBull) return dart(BULL, 2);
  if (r <= RADII.singleBull) return dart(BULL, 1);
  if (r > RADII.doubleOuter) return dart(MISS);
  const ring = RINGS.find((ringDef) => r <= ringDef.outer);
  return dart(segmentAtAngle(x, y), ring.multiplier);
}

function el(doc, name, attrs = {}, children = []) {
  const node = doc.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function titled(doc, d) {
  return el(doc, 'title', {}, [`${dartLabel(d)} (${d.value})`]);
}

/** Overlay button (miss / undo) drawn inside the board at the given board coordinates. */
function buildButton(doc, name, label, x, y) {
  return el(doc, 'g', {
    class: `board-button board-button--${name}`,
    role: 'button',
    tabindex: '0',
    'aria-label': label,
    transform: `translate(${x} ${y})`,
  }, [
    el(doc, 'circle', { class: 'board-button-bg', r: 20 }),
    el(doc, 'text', { class: 'board-button-label', x: 0, y: 0 }, [label]),
  ]);
}

function buildSvg(doc) {
  const { surround } = RADII;
  const svg = el(doc, 'svg', {
    viewBox: `${-surround} ${-surround} ${surround * 2} ${surround * 2}`,
    class: 'dartboard',
    role: 'group',
    'aria-label': 'Dartboard',
  });

  svg.append(el(doc, 'circle', { class: 'board-surround', r: surround }));

  const segments = el(doc, 'g', { class: 'segments' });
  SEGMENT_ORDER.forEach((segment, index) => {
    const center = index * SEGMENT_ANGLE;
    const shade = index % 2 === 0 ? 'dark' : 'light';
    RINGS.forEach((ring) => {
      const d = dart(segment, ring.multiplier);
      segments.append(
        el(doc, 'path', {
          d: sectorPath(ring.inner, ring.outer, center - SEGMENT_ANGLE / 2, center + SEGMENT_ANGLE / 2),
          class: `segment ${ring.kind} ${shade}`,
          'data-segment': segment,
          'data-multiplier': ring.multiplier,
        }, [titled(doc, d)]),
      );
    });
  });
  svg.append(segments);

  svg.append(
    el(doc, 'circle', { class: 'segment bull single-bull', r: RADII.singleBull, 'data-segment': BULL, 'data-multiplier': 1 }, [titled(doc, dart(BULL, 1))]),
    el(doc, 'circle', { class: 'segment bull double-bull', r: RADII.doubleBull, 'data-segment': BULL, 'data-multiplier': 2 }, [titled(doc, dart(BULL, 2))]),
  );

  const numbers = el(doc, 'g', { class: 'numbers', 'aria-hidden': 'true' });
  SEGMENT_ORDER.forEach((segment, index) => {
    const [x, y] = polar(RADII.numbers, index * SEGMENT_ANGLE);
    numbers.append(el(doc, 'text', { class: 'number', x: fmt(x), y: fmt(y) }, [String(segment)]));
  });
  svg.append(numbers);

  const markers = el(doc, 'g', { class: 'markers', 'aria-hidden': 'true' });
  svg.append(markers);

  // Corner buttons: miss (lower-left) and undo (lower-right).
  const buttons = el(doc, 'g', { class: 'board-buttons' });
  buttons.append(
    buildButton(doc, 'miss', '✕', -145, 145),
    buildButton(doc, 'undo', '↺', 145, 145),
  );
  svg.append(buttons);

  return { svg, markers, buttons };
}

/**
 * Create a dartboard element.
 * @param {object} options
 * @param {(dart: object, point: {x:number,y:number}) => void} options.onThrow called for every click
 * @param {() => void} [options.onMiss] called when the miss button is pressed
 * @param {() => void} [options.onUndo] called when the undo button is pressed
 * @param {Document} [options.document]
 * @returns {{ element: SVGSVGElement, setDisabled(b:boolean):void, addMarker(p):void, clearMarkers():void, destroy():void }}
 */
export function createDartboard({ onThrow, onMiss, onUndo, document: doc = globalThis.document } = {}) {
  const { svg, markers } = buildSvg(doc);
  let disabled = false;

  function toBoardPoint(clientX, clientY) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function flash(target) {
    const segment = target?.closest?.('[data-segment]');
    if (!segment) return;
    segment.classList.remove('hit');
    // Force reflow so the animation restarts on repeated hits.
    void segment.getBoundingClientRect();
    segment.classList.add('hit');
  }

  function addMarker({ x, y }) {
    markers.append(el(doc, 'circle', { class: 'marker', cx: fmt(x), cy: fmt(y), r: 4 }));
  }

  function clearMarkers() {
    markers.replaceChildren();
  }

  function handleClick(event) {
    if (disabled) return;
    const button = event.target?.closest?.('.board-button');
    if (button) {
      if (button.classList.contains('board-button--miss')) onMiss?.();
      else if (button.classList.contains('board-button--undo')) onUndo?.();
      return;
    }
    const point = toBoardPoint(event.clientX, event.clientY);
    if (!point) return;
    const d = hitTest(point.x, point.y);
    flash(event.target);
    addMarker(point);
    onThrow?.(d, point);
  }

  function handleKeydown(event) {
    if (disabled) return;
    const button = event.target?.closest?.('.board-button');
    if (!button) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (button.classList.contains('board-button--miss')) onMiss?.();
    else if (button.classList.contains('board-button--undo')) onUndo?.();
  }

  function setDisabled(value) {
    disabled = Boolean(value);
    svg.classList.toggle('is-disabled', disabled);
    svg.setAttribute('aria-disabled', String(disabled));
  }

  /** Highlight a single segment as the recommended next dart. */
  function setHint(segment, multiplier) {
    clearHint();
    if (segment == null) return;
    const els = svg.querySelectorAll(`[data-segment="${segment}"][data-multiplier="${multiplier}"]`);
    // For singles there are two rings (inner and outer); highlight both.
    // For doubles/triples there is only one element.
    els.forEach((el) => el.classList.add('hint'));
  }

  function clearHint() {
    svg.querySelectorAll('.hint').forEach((el) => el.classList.remove('hint'));
  }

  svg.addEventListener('click', handleClick);
  svg.addEventListener('keydown', handleKeydown);

  return {
    element: svg,
    setDisabled,
    setHint,
    clearHint,
    addMarker,
    clearMarkers,
    destroy() {
      svg.removeEventListener('click', handleClick);
      svg.removeEventListener('keydown', handleKeydown);
      svg.remove();
    },
  };
}
