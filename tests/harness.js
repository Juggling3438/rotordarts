/** Minimal zero-dependency test harness (runs in any browser). */
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export const assert = {
  equal(actual, expected, msg = '') {
    if (actual !== expected) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
  deepEqual(actual, expected, msg = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`);
  },
  ok(value, msg = 'expected truthy value') {
    if (!value) throw new Error(msg);
  },
  throws(fn, msg = 'expected function to throw') {
    try { fn(); } catch { return; }
    throw new Error(msg);
  },
};

export async function run() {
  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ name: t.name, passed: true });
    } catch (err) {
      results.push({ name: t.name, passed: false, error: err.message });
    }
  }
  return results;
}
