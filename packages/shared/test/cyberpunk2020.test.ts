import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_SKILLS,
  createCyberpunkCharacter,
  deriveStats,
  emptyAttributes,
} from '../src/index.js';

const ctx = { roomId: 'r1', playerId: 'p1', id: () => 'c1' };

test('derives HP / Soak / Move from attributes', () => {
  const s = deriveStats({ ...emptyAttributes(), body: 4, reflexes: 5 });
  assert.equal(s.hpMax, 9); // body + 5
  assert.equal(s.soak, 2); // floor(4/2)
  assert.equal(s.move, 4); // 3 + (reflexes>=4)

  const s2 = deriveStats({ ...emptyAttributes(), reflexes: 3 });
  assert.equal(s2.move, 3);
});

test('createCharacter derives stats and starts at full HP', () => {
  const c = createCyberpunkCharacter(
    { name: 'Rache', attributes: { ...emptyAttributes(), body: 6 }, skills: { Guns: 4 } },
    ctx,
  );
  assert.equal(c.hp.max, 11);
  assert.equal(c.hp.current, 11);
  assert.equal(c.soak, 3);
  assert.equal(c.skills.Guns, 4);
  assert.equal(c.edgePool, 3); // default
  assert.equal(c.edd, 500); // default
});

test('clamps out-of-range attributes and skills', () => {
  const c = createCyberpunkCharacter(
    { name: 'X', attributes: { ...emptyAttributes(), body: 99 }, skills: { Guns: 99, Melee: -3 } },
    ctx,
  );
  assert.equal(c.attributes.body, 7); // clamped to MAX_ATTR
  assert.equal(c.skills.Guns, 6); // clamped to MAX_SKILL
  assert.equal(c.skills.Melee, 0); // clamped to MIN_SKILL
});

test('honours explicit edgePool and edd', () => {
  const c = createCyberpunkCharacter(
    { name: 'Y', attributes: emptyAttributes(), skills: {}, edgePool: 5, edd: 1200 },
    ctx,
  );
  assert.equal(c.edgePool, 5);
  assert.equal(c.edd, 1200);
});

test('rejects an empty character name', () => {
  assert.throws(() => createCyberpunkCharacter({ name: '   ', attributes: emptyAttributes(), skills: {} }, ctx));
});

test('skill catalogue is non-empty and unique', () => {
  assert.ok(ALL_SKILLS.length > 0);
  assert.equal(new Set(ALL_SKILLS).size, ALL_SKILLS.length);
});
