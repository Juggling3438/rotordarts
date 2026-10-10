/**
 * Rule set menu: start score (301/501) and out mode (double/straight).
 * The choice is persisted so the next visit starts with the same rules.
 */
import { createRules, START_SCORES, OUT_MODES } from '../engine/darts-engine.js';
import { getDefaultStorage } from '../storage/players.js';

export const RULES_KEY = 'rotordarts.rules';

const OUT_LABELS = { [OUT_MODES.DOUBLE]: 'Double out', [OUT_MODES.STRAIGHT]: 'Straight out' };

export function loadRules(storage) {
  try {
    return createRules(JSON.parse(storage.getItem(RULES_KEY)) ?? {});
  } catch {
    return createRules();
  }
}

function group(name, legend, options, current, onPick) {
  const fieldset = document.createElement('fieldset');
  const lg = document.createElement('legend');
  lg.textContent = legend;
  fieldset.append(lg);
  for (const { value, label } of options) {
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = String(value);
    input.checked = value === current;
    input.addEventListener('change', () => input.checked && onPick(value));
    const text = document.createElement('span');
    text.textContent = label;
    wrap.append(input, text);
    fieldset.append(wrap);
  }
  return fieldset;
}

export function createRulesMenu({ storage = getDefaultStorage(), onChange = () => {} } = {}) {
  let rules = loadRules(storage);
  const element = document.createElement('section');
  element.className = 'rules-menu';

  function update(patch) {
    rules = createRules({ ...rules, ...patch });
    storage.setItem(RULES_KEY, JSON.stringify(rules));
    onChange(rules);
  }

  const title = document.createElement('h2');
  title.textContent = 'Rules';
  element.append(
    title,
    group('startScore', 'Game', START_SCORES.map((v) => ({ value: v, label: String(v) })), rules.startScore,
      (v) => update({ startScore: v })),
    group('outMode', 'Finish', Object.values(OUT_MODES).map((v) => ({ value: v, label: OUT_LABELS[v] })), rules.outMode,
      (v) => update({ outMode: v })),
  );

  return { element, getRules: () => rules, destroy: () => element.remove() };
}

export function describeRules(rules) {
  return `${rules.startScore} · ${OUT_LABELS[rules.outMode]}`;
}
