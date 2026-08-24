import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_SKILLS,
  ATTRIBUTE_POINT_BUDGET,
  SKILL_POINT_BUDGET,
  createCyberpunkCharacter,
  deriveStats,
  emptyAttributes,
  maxSkillPool,
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
  assert.equal(c.attributes.body, 6); // clamped to MAX_ATTR
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

test('trims skills that exceed the point budget down to exactly the budget', () => {
  const skills: Record<string, number> = {};
  for (const s of ALL_SKILLS) skills[s] = 6; // 18 * 6 = 108 points
  const c = createCyberpunkCharacter({ name: 'Maxed', attributes: emptyAttributes(), skills }, ctx);
  const total = Object.values(c.skills).reduce((a, b) => a + b, 0);
  assert.equal(total, SKILL_POINT_BUDGET);
});

test('leaves under-budget skill sets untouched', () => {
  const c = createCyberpunkCharacter({ name: 'Lean', attributes: emptyAttributes(), skills: { Guns: 5, Stealth: 4 } }, ctx);
  assert.equal(c.skills.Guns, 5);
  assert.equal(c.skills.Stealth, 4);
});

test('trims attributes that exceed the point budget down to exactly the budget', () => {
  const c = createCyberpunkCharacter(
    { name: 'Maxed', attributes: { body: 6, cool: 6, intelligence: 6, reflexes: 6, tech: 6, empathy: 6 }, skills: {} },
    ctx,
  );
  const total = Object.values(c.attributes).reduce((a, b) => a + b, 0);
  assert.equal(total, ATTRIBUTE_POINT_BUDGET);
});

test('attribute trimming never drops an attribute below the minimum', () => {
  const c = createCyberpunkCharacter(
    { name: 'Skewed', attributes: { body: 6, cool: 6, intelligence: 6, reflexes: 6, tech: 6, empathy: 1 }, skills: {} },
    ctx,
  );
  const total = Object.values(c.attributes).reduce((a, b) => a + b, 0);
  assert.equal(total, ATTRIBUTE_POINT_BUDGET); // 30 trimmed to 27
  assert.equal(c.attributes.empathy, 1); // already at minimum, untouched
});

test('leaves under-budget attribute sets untouched', () => {
  const c = createCyberpunkCharacter(
    { name: 'Lean', attributes: { ...emptyAttributes(), body: 5, cool: 4 }, skills: {} },
    ctx,
  );
  assert.equal(c.attributes.body, 5);
  assert.equal(c.attributes.cool, 4);
});

test('maxSkillPool is governing attribute plus skill rating', () => {
  const c = createCyberpunkCharacter(
    { name: 'X', attributes: { ...emptyAttributes(), cool: 4 }, skills: { Guns: 5 } },
    ctx,
  );
  assert.equal(maxSkillPool(c, 'Guns'), 9); // Cool 4 + Guns 5
});

test('maxSkillPool caps at the theoretical max and falls back for unknown skills', () => {
  const attrs = { ...emptyAttributes(), body: 6 };
  assert.equal(maxSkillPool({ attributes: attrs, skills: { Melee: 6 } }, 'Melee'), 12); // Body 6 + Melee 6
  assert.equal(maxSkillPool({ attributes: attrs, skills: {} }, 'Unknown Skill'), 0); // no rating → 0
});
