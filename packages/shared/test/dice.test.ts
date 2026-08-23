import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRng,
  resolveOpposed,
  rollD10Pool,
  rollSucceeded,
  type RNG,
} from '../src/index.js';

/** Deterministic RNG that replays a fixed sequence of d10 values. */
function seqRng(values: number[]): RNG {
  let i = 0;
  return { nextInt: () => values[i++ % values.length] };
}

test('counts successes (5+) and sums dice', () => {
  const r = rollD10Pool(3, 'Guns', seqRng([5, 6, 4]));
  assert.deepEqual(r.dice, [5, 6, 4]);
  assert.equal(r.successes, 2);
  assert.equal(r.fumble, false);
  assert.equal(r.total, 15);
  assert.ok(rollSucceeded(r));
});

test('a fumble (any 1) is an automatic failure despite successes', () => {
  const r = rollD10Pool(2, 'Melee', seqRng([1, 9]));
  assert.equal(r.fumble, true);
  assert.equal(r.successes, 1);
  assert.ok(!rollSucceeded(r));
});

test('a single success with no fumble succeeds', () => {
  const r = rollD10Pool(4, 'Stealth', seqRng([2, 3, 4, 5]));
  assert.equal(r.successes, 1);
  assert.ok(rollSucceeded(r));
});

test('zero-die pool cannot succeed', () => {
  const r = rollD10Pool(0, 'nothing');
  assert.deepEqual(r.dice, []);
  assert.equal(r.successes, 0);
  assert.ok(!rollSucceeded(r));
});

test('seeded RNG is deterministic across calls', () => {
  const a = rollD10Pool(6, 'x', createRng(1234)).dice;
  const b = rollD10Pool(6, 'x', createRng(1234)).dice;
  assert.deepEqual(a, b);
});

test('opposed rolls: more successes wins, ties broken by total', () => {
  const a = rollD10Pool(2, 'a', seqRng([6, 6])); // 2 succ, total 12
  const b = rollD10Pool(2, 'b', seqRng([5, 5])); // 2 succ, total 10
  assert.equal(resolveOpposed(a, b), 'a');
});

test('opposed rolls: a fumbled side loses to a clean success', () => {
  const a = rollD10Pool(2, 'a', seqRng([1, 6])); // fumble -> treated as failure
  const b = rollD10Pool(1, 'b', seqRng([5])); // 1 succ
  assert.equal(resolveOpposed(a, b), 'b');
});
