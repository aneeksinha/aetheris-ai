import test from 'node:test';
import assert from 'node:assert/strict';
import { pickStarterPrompts, STARTER_PROMPT_POOL } from './suggestions';

test('STARTER_PROMPT_POOL has at least 16 unique prompts', () => {
  assert.ok(STARTER_PROMPT_POOL.length >= 16);
  const ids = new Set(STARTER_PROMPT_POOL.map((item) => item.id));
  assert.equal(ids.size, STARTER_PROMPT_POOL.length);
});

test('pickStarterPrompts returns requested count of distinct items', () => {
  const picked = pickStarterPrompts(4);
  assert.equal(picked.length, 4);
  const ids = new Set(picked.map((p) => p.id));
  assert.equal(ids.size, 4);
});

test('pickStarterPrompts handles edge counts cleanly', () => {
  assert.deepEqual(pickStarterPrompts(0), []);
  assert.deepEqual(pickStarterPrompts(4, []), []);
  assert.equal(pickStarterPrompts(999).length, STARTER_PROMPT_POOL.length);
});

test('pickStarterPrompts varies output based on RNG sequence', () => {
  const seedA = (() => {
    const seq = [0.05, 0.12, 0.25, 0.4];
    let i = 0;
    return () => seq[i++ % seq.length];
  })();
  const seedB = (() => {
    const seq = [0.92, 0.78, 0.61, 0.45];
    let i = 0;
    return () => seq[i++ % seq.length];
  })();

  const first = pickStarterPrompts(4, STARTER_PROMPT_POOL, seedA).map((p) => p.id);
  const second = pickStarterPrompts(4, STARTER_PROMPT_POOL, seedB).map((p) => p.id);
  assert.notDeepEqual(first, second);
});
