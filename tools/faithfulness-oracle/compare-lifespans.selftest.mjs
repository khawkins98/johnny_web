#!/usr/bin/env node
// Standalone self-test for compare-lifespans.mjs.
// Run directly with: node tools/faithfulness-oracle/compare-lifespans.selftest.mjs
// (Not a vitest test — this lives in tools/, outside the vitest include globs.)

import assert from 'node:assert/strict';
import { compareLifespans } from './compare-lifespans.mjs';

let failures = 0;
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL - ${name}`);
    console.error(err && err.message ? err.message : err);
  }
}

// 1) All actors within range -> empty warnings + hard.
test('all actors within range -> no warnings, no hard', () => {
  const ref = {
    '1:7': { min: 10, max: 20 },
    '1:13': { min: 5, max: 8 },
  };
  const ours = {
    '1:7': 15,
    '1:13': 5,
  };
  const { warnings, hard } = compareLifespans(ours, ref);
  assert.deepEqual(warnings, []);
  assert.deepEqual(hard, []);
});

// 2) One actor mildly over refMax (within 3x) -> 1 warning, 0 hard.
test('mildly over refMax (within hardFactor) -> 1 warning, 0 hard', () => {
  const ref = {
    '1:7': { min: 10, max: 20 },
  };
  const ours = {
    '1:7': 23, // refMax + 3, within 3x of 20 (60)
  };
  const { warnings, hard } = compareLifespans(ours, ref);
  assert.equal(warnings.length, 1);
  assert.equal(hard.length, 0);
  assert.equal(warnings[0].actor, '1:7');
  assert.equal(warnings[0].ourTicks, 23);
});

// 3) One actor drawn ~4x refMax -> 1 hard.
test('drawn ~4x refMax -> 1 hard', () => {
  const ref = {
    '1:7': { min: 10, max: 20 },
  };
  const ours = {
    '1:7': 80, // 4x refMax
  };
  const { warnings, hard } = compareLifespans(ours, ref);
  assert.equal(warnings.length, 0);
  assert.equal(hard.length, 1);
  assert.equal(hard[0].actor, '1:7');
});

// 4) One actor drawn far too SHORT (<= refMin/3) -> 1 hard.
test('drawn far too short (<= refMin/hardFactor) -> 1 hard', () => {
  const ref = {
    '1:7': { min: 30, max: 40 },
  };
  const ours = {
    '1:7': 9, // <= 30 / 3 = 10
  };
  const { warnings, hard } = compareLifespans(ours, ref);
  assert.equal(warnings.length, 0);
  assert.equal(hard.length, 1);
  assert.equal(hard[0].actor, '1:7');
});

// 5) refLifespans undefined -> empty result (graceful handling of old refs).
test('refLifespans undefined -> empty result', () => {
  const ours = {
    '1:7': 999,
  };
  const { warnings, hard } = compareLifespans(ours, undefined);
  assert.deepEqual(warnings, []);
  assert.deepEqual(hard, []);
});

// 6) Actor only in ours (not in ref) -> ignored (vocab concern, out of scope).
test('actor only in ours -> ignored', () => {
  const ref = {
    '1:7': { min: 10, max: 20 },
  };
  const ours = {
    '1:7': 15,
    '2:99': 500, // not present in ref at all
  };
  const { warnings, hard } = compareLifespans(ours, ref);
  assert.deepEqual(warnings, []);
  assert.deepEqual(hard, []);
});

console.log(`\n${passed} passed, ${failures} failed`);
if (failures > 0) {
  process.exit(1);
}
