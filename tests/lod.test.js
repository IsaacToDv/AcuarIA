import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { lodWeights } from '../src/world/lod.js';

test('LOD uses geometry at all distances and transitions conserve weight', () => {
  assert.deepEqual(lodWeights(0), [1, 0, 0]);
  assert.deepEqual(lodWeights(5), [0, 1, 0]);
  assert.deepEqual(lodWeights(10), [0, 0, 1]);
  for (let d = 0; d < 12; d += 0.05) {
    const weights = lodWeights(d);
    assert.ok(weights.every(w => w >= 0 && w <= 1));
    assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-10);
  }
});
