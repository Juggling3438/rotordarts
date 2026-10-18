/**
 * Rule set menu: start score (301/501) and out mode (double/straight).
 * The choice is persisted so the next visit starts with the same rules.
 */
import { createRules, START_SCORES, OUT_MODES } from '../engine/darts-engine.js';
import { getDefaultStorage } from '../storage/players.js';

export const RULES_KEY = 'rotordarts.rules';
export const HINTS_KEY = 'rotordarts.hints';

const OUT_LABELS = { [OUT_MODES.DOUBLE]: 'Double out', [OUT_MODES.STRAIGHT]: 'Straight out' };

const CUSTOM_RULES = [
  {
    key: 'faecher',
    label: 'Fächer',
    hint: 'If the board offset between the 3 darts is equal, all darts count the highest field (e.g. 20, 1, 18 → 20, 20, 20).',
  },
  {
    key: 'oppositeBull',
    label: 'Instant win',
    hint: 'Instant win: first two darts are doubles on opposite fields, third dart is the bull (e.g. D1 + D19 + BULL).',
  },
];

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
  let hintsEnabled = storage.getItem(HINTS_KEY) !== 'false';
  const element = document.createElement('section');
  element.className = 'rules-menu';

  function update(patch) {
    rules = createRules({ ...rules, ...patch });
    storage.setItem(RULES_KEY, JSON.stringify(rules));
    onChange(rules, hintsEnabled);
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

  const custom = document.createElement('fieldset');
  custom.className = 'custom-rules';
  const customLegend = document.createElement('legend');
  customLegend.textContent = 'Custom rules';
  custom.append(customLegend);
  for (const { key, label, hint } of CUSTOM_RULES) {
    const wrap = document.createElement('label');
    wrap.title = hint;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = rules[key];
    box.addEventListener('change', () => update({ [key]: box.checked }));
    const text = document.createElement('span');
    text.textContent = label;
    wrap.append(box, text);
    custom.append(wrap);
  }

  // Hints toggle – not a game rule, stored separately
  const hintsWrap = document.createElement('label');
  hintsWrap.title = 'Highlight the recommended next dart on the board for scores ≤ 170.';
  const hintsBox = document.createElement('input');
  hintsBox.type = 'checkbox';
  hintsBox.checked = hintsEnabled;
  hintsBox.addEventListener('change', () => {
    hintsEnabled = hintsBox.checked;
    storage.setItem(HINTS_KEY, String(hintsEnabled));
    onChange(rules, hintsEnabled);
  });
  const hintsText = document.createElement('span');
  hintsText.textContent = 'Checkout hints';
  hintsWrap.append(hintsBox, hintsText);
  custom.append(hintsWrap);

  element.append(custom);

  return {
    element,
    getRules: () => rules,
    getHintsEnabled: () => hintsEnabled,
    destroy: () => element.remove(),
  };
}

export function describeRules(rules) {
  const extras = CUSTOM_RULES.filter((r) => rules[r.key]).map((r) => ` · ${r.label}`).join('');
  return `${rules.startScore} · ${OUT_LABELS[rules.outMode]}${extras}`;
}
