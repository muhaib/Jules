import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mmToM, mToFt, sqmToSqft, sqftToSqm, rectangleFromMm, toKW, round, sinPhi, fmt,
} from '../src/engine/units.js';

test('length conversions round-trip', () => {
  assert.equal(mmToM(2278), 2.278);
  assert.ok(Math.abs(mToFt(1) - 3.28084) < 1e-4);
  assert.ok(Math.abs(sqftToSqm(sqmToSqft(7.5)) - 7.5) < 1e-9);
});

test('a 2278 x 1134 mm module is 2.583 m2 / 27.81 sq ft', () => {
  const r = rectangleFromMm(2278, 1134);
  assert.equal(round(r.sqm, 3), 2.583);
  assert.equal(round(r.sqft, 2), 27.81);
  assert.equal(round(r.widthFt, 2), 7.47);
});

test('toKW handles every supported unit', () => {
  assert.equal(toKW(500, 'W'), 0.5);
  assert.equal(toKW(2, 'kW'), 2);
  assert.equal(toKW(10, 'HP'), 7.46);
  assert.equal(toKW(1000, 'VA', 0.9), 0.9);
  assert.equal(toKW(10, 'kVA', 0.8), 8);
  assert.throws(() => toKW(1, 'MW'), /Unknown power unit/);
});

test('sinPhi is the complement of the power factor and is clamped', () => {
  assert.ok(Math.abs(sinPhi(0.8) - 0.6) < 1e-12);
  assert.equal(sinPhi(1), 0);
  assert.equal(sinPhi(1.5), 0, 'a PF above 1 is clamped rather than producing NaN');
});

test('round and fmt behave predictably', () => {
  assert.equal(round(1.005, 2), 1.01);
  assert.equal(round(2.675, 2), 2.68);
  assert.equal(fmt(1234.5, 1), '1,234.5');
  assert.equal(fmt(NaN), '—');
});
