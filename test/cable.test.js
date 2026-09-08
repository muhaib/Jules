import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCable, baseAmpacity, ambientFactor, groupingFactor, selectBreaker,
  availableSizes, interpolate, SELECTION_CAVEATS,
} from '../src/engine/cable.js';
import { calculateVoltageDrop, resistancePerMetre, smallestSizeForDropLimit } from '../src/engine/voltagedrop.js';
import { CABLE_SIZES_MM2 } from '../src/engine/constants.js';
import { hasErrors } from '../src/engine/validation.js';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

test('the standard size range is exactly the 16 sizes from 1.5 to 300 mm2', () => {
  assert.deepEqual(CABLE_SIZES_MM2, [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300]);
});

test('aluminium starts at 16 mm2, copper at 1.5 mm2', () => {
  assert.equal(availableSizes('copper')[0], 1.5);
  assert.equal(availableSizes('aluminium')[0], 16);
});

test('base ampacity applies material, insulation and method factors', () => {
  // 25 mm2, 3-core PVC copper, method C: base table value.
  near(baseAmpacity(25, 'copper', 'pvc', 3, 'C'), 96, 1e-9);
  // XLPE raises it, aluminium lowers it, method A lowers it.
  assert.ok(baseAmpacity(25, 'copper', 'xlpe', 3, 'C') > baseAmpacity(25, 'copper', 'pvc', 3, 'C'));
  assert.ok(baseAmpacity(25, 'aluminium', 'pvc', 3, 'C') < baseAmpacity(25, 'copper', 'pvc', 3, 'C'));
  assert.ok(baseAmpacity(25, 'copper', 'pvc', 3, 'A') < baseAmpacity(25, 'copper', 'pvc', 3, 'C'));
  // Single-phase (2 loaded conductors) rates higher than three-phase.
  assert.ok(baseAmpacity(25, 'copper', 'pvc', 1, 'C') > baseAmpacity(25, 'copper', 'pvc', 3, 'C'));
});

test('correction factors interpolate and clamp', () => {
  assert.equal(ambientFactor(30, 'pvc'), 1);
  assert.equal(ambientFactor(40, 'pvc'), 0.87);
  near(ambientFactor(37.5, 'pvc'), (0.94 + 0.87) / 2, 1e-9);
  assert.equal(ambientFactor(-40, 'pvc'), 1.22, 'clamped at the bottom of the table');
  assert.equal(groupingFactor(1), 1);
  assert.equal(groupingFactor(4), 0.65);
  assert.equal(interpolate({ 0: 0, 10: 100 }, 5), 50);
});

test('breaker selection picks the next standard rating up and names the device type', () => {
  assert.deepEqual(selectBreaker(69), { ratingA: 80, type: 'MCB' });
  assert.deepEqual(selectBreaker(80), { ratingA: 80, type: 'MCB' });
  assert.deepEqual(selectBreaker(126), { ratingA: 160, type: 'MCCB' });
  assert.deepEqual(selectBreaker(99999), { ratingA: null, type: null });
});

test('conductor resistance rises with temperature', () => {
  // Copper at 70 C: 0.017241 x (1 + 0.00393 x 50) / 25 = 8.2515e-4 ohm/m
  near(resistancePerMetre(25, 'copper', 70), 8.2515e-4, 1e-7);
  assert.ok(resistancePerMetre(25, 'copper', 90) > resistancePerMetre(25, 'copper', 70));
  assert.ok(resistancePerMetre(25, 'aluminium', 70) > resistancePerMetre(25, 'copper', 70));
  assert.throws(() => resistancePerMetre(0, 'copper', 70), /greater than zero/);
});

test('voltage drop uses root3 for three phase and 2 for single phase', () => {
  const common = { currentA: 100, lengthM: 50, csaMm2: 50, material: 'copper', powerFactor: 1, insulation: 'pvc', reactancePerMetre: 0 };
  const three = calculateVoltageDrop({ ...common, phases: 3, voltage: 400 });
  const one = calculateVoltageDrop({ ...common, phases: 1, voltage: 230 });
  near(three.dropVolts / one.dropVolts, Math.sqrt(3) / 2, 1e-9);
  assert.match(three.formula, /√3/);
  assert.match(one.formula, /2 × I/);
});

test('voltage drop scales linearly with length and current, inversely with area', () => {
  const base = { currentA: 50, lengthM: 40, csaMm2: 25, material: 'copper', phases: 3, voltage: 400, powerFactor: 0.9, reactancePerMetre: 0 };
  const a = calculateVoltageDrop(base);
  near(calculateVoltageDrop({ ...base, lengthM: 80 }).dropVolts, a.dropVolts * 2, 1e-9);
  near(calculateVoltageDrop({ ...base, currentA: 100 }).dropVolts, a.dropVolts * 2, 1e-9);
  near(calculateVoltageDrop({ ...base, csaMm2: 50 }).dropVolts, a.dropVolts / 2, 1e-9);
});

test('paralleling cables halves the drop', () => {
  const base = { currentA: 200, lengthM: 60, csaMm2: 95, material: 'copper', phases: 3, voltage: 400, powerFactor: 0.9 };
  near(calculateVoltageDrop({ ...base, parallelRuns: 2 }).dropVolts,
    calculateVoltageDrop(base).dropVolts / 2, 1e-9);
});

test('voltage drop rejects a negative cable length', () => {
  assert.throws(() => calculateVoltageDrop({
    currentA: 10, lengthM: -5, csaMm2: 4, material: 'copper', phases: 1, voltage: 230, powerFactor: 1,
  }), /cannot be negative/);
});

test('smallestSizeForDropLimit walks up the standard sizes', () => {
  const input = { currentA: 100, lengthM: 200, material: 'copper', phases: 3, voltage: 400, powerFactor: 0.9 };
  const { csaMm2, result } = smallestSizeForDropLimit(input, 3, CABLE_SIZES_MM2);
  assert.ok(csaMm2 !== null);
  assert.ok(result.dropPercent <= 3);
  const oneSmaller = CABLE_SIZES_MM2[CABLE_SIZES_MM2.indexOf(csaMm2) - 1];
  assert.ok(calculateVoltageDrop({ ...input, csaMm2: oneSmaller }).dropPercent > 3,
    'the size below must fail the limit, i.e. the answer is genuinely the smallest');
});

const demoCable = {
  loadKW: 43, voltage: 400, phases: 3, powerFactor: 0.9,
  material: 'copper', insulation: 'pvc', cores: 4, installationMethod: 'C',
  lengthM: 50, ambientC: 40, groupedCircuits: 1, voltageDropLimitPercent: 3,
};

test('the demo case sizes to 25 mm2 behind an 80 A device', () => {
  const r = calculateCable(demoCable);
  assert.equal(hasErrors(r.issues), false);
  near(r.designCurrentA, 68.97);
  assert.equal(r.breaker.ratingA, 80);
  assert.equal(r.ambientFactor, 0.87);
  near(r.requiredTabulatedRatingA, 80 / 0.87);
  assert.equal(r.recommendedSizeMm2, 25);
  assert.equal(r.governedBy, 'thermal');
  assert.ok(r.voltageDrop.dropPercent < 3);
});

test('the cable carries the device rating, not merely the design current', () => {
  const r = calculateCable(demoCable);
  assert.ok(r.recommendedRatingA >= r.breaker.ratingA,
    'derated capacity must be at least the protective device rating');
});

test('a long run becomes voltage-drop governed rather than thermally governed', () => {
  const short = calculateCable(demoCable);
  const long = calculateCable({ ...demoCable, lengthM: 300 });
  assert.equal(long.governedBy, 'voltage drop');
  assert.ok(long.recommendedSizeMm2 > short.recommendedSizeMm2);
  assert.equal(long.thermalSizeMm2, short.thermalSizeMm2, 'the thermal size is unchanged by length');
});

test('derating for heat and grouping forces a larger conductor', () => {
  const base = calculateCable(demoCable);
  const derated = calculateCable({ ...demoCable, ambientC: 55, groupedCircuits: 4 });
  assert.ok(derated.totalDerating < base.totalDerating);
  assert.ok(derated.recommendedSizeMm2 > base.recommendedSizeMm2);
});

test('aluminium needs more copper area for the same duty', () => {
  const cu = calculateCable(demoCable);
  const al = calculateCable({ ...demoCable, material: 'aluminium' });
  assert.ok(al.recommendedSizeMm2 > cu.recommendedSizeMm2);
});

test('XLPE allows a smaller or equal conductor than PVC', () => {
  const pvc = calculateCable(demoCable);
  const xlpe = calculateCable({ ...demoCable, insulation: 'xlpe' });
  assert.ok(xlpe.recommendedSizeMm2 <= pvc.recommendedSizeMm2);
});

test('an explicit design current overrides the kW input', () => {
  const r = calculateCable({ ...demoCable, currentA: 150 });
  near(r.designCurrentA, 150, 1e-9);
  assert.equal(r.breaker.ratingA, 160);
});

test('invalid inputs are reported and no size is recommended', () => {
  const r = calculateCable({ ...demoCable, voltage: 0, powerFactor: 1.5, lengthM: -10 });
  assert.ok(hasErrors(r.issues));
  assert.equal(r.recommendedSizeMm2, null);
  const fields = r.issues.map((i) => i.field);
  assert.ok(fields.includes('voltage'));
  assert.ok(fields.includes('powerFactor'));
  assert.ok(fields.includes('lengthM'));
});

test('an impossible run warns instead of silently returning the largest cable', () => {
  const r = calculateCable({ ...demoCable, lengthM: 5000 });
  assert.ok(r.issues.some((i) => i.level === 'warning' && /voltage drop within/.test(i.message)));
});

test('every result ships the caveats that an ampacity number does not cover', () => {
  const r = calculateCable(demoCable);
  assert.deepEqual(r.caveats, SELECTION_CAVEATS);
  assert.ok(r.caveats.some((c) => /short-circuit/i.test(c)));
  assert.ok(r.caveats.some((c) => /derating|grouping/i.test(c)));
  assert.ok(r.caveats.some((c) => /installation method/i.test(c)));
});

test('candidate table covers every available size and flags both checks', () => {
  const r = calculateCable(demoCable);
  assert.equal(r.candidates.length, availableSizes('copper').length);
  assert.ok(r.candidates.every((c) => typeof c.thermalOk === 'boolean' && typeof c.dropOk === 'boolean'));
});
