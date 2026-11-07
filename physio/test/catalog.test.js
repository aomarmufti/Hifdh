import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, getCondition, planItems, minutes } from '../src/data/catalog.js';
import { EXERCISES } from '../src/data/exercises.js';

test('every plan references a real exercise with a sensible dose', () => {
  for (const area of AREAS) {
    assert.ok(area.conditions.length >= 2, `${area.id} has conditions`);
    for (const c of area.conditions) {
      assert.ok(getCondition(c.id), c.id);
      for (const it of planItems(c)) {
        assert.ok(it.sets >= 1 && it.sets <= 5);
        if (it.ex.type === 'reps') assert.ok(it.reps >= 5 && it.reps <= 20, `${c.id}/${it.ex.id}`);
        else assert.ok(it.hold >= 10 && it.hold <= 60);
      }
      assert.ok(minutes(planItems(c)) < 40);
    }
  }
});

test('condition ids are unique', () => {
  const ids = AREAS.flatMap((a) => a.conditions.map((c) => c.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('every exercise is used by at least one programme', () => {
  const used = new Set(AREAS.flatMap((a) => a.conditions.flatMap((c) => c.plan.map((p) => p.id))));
  for (const id of Object.keys(EXERCISES)) assert.ok(used.has(id), id);
});
