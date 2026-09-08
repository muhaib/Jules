import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInverter, nextStandardRating, INVERTER_CAVEATS } from '../src/engine/inverter.js';
import { INVERTER_RATINGS_KW } from '../src/engine/constants.js';
import { hasErrors } from '../src/engine/validation.js';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

test('nextStandardRating rounds up to the catalogue', () => {
  assert.equal(nextStandardRating(43), 50);
  assert.equal(nextStandardRating(50), 50);
  assert.equal(nextStandardRating(1e9), null);
});

test('inverter rating is PV capacity divided by the DC/AC ratio', () => {
  const r = calculateInverter({ pvCapacityKWp: 60, phases: 3 });
  assert.equal(hasErrors(r.issues), false);
  near(r.minInverterKW, 60 / 1.3);   // smallest inverter, highest ratio
  near(r.maxInverterKW, 60 / 1.0);   // largest inverter, lowest ratio
  near(r.targetInverterKW, 60 / 1.2);
});

test('a 60 kWp array lands in the 46-60 kW band, as an engineer would expect', () => {
  const r = calculateInverter({ pvCapacityKWp: 60, phases: 3 });
  assert.equal(r.rangeLabel, '46–60 kW');
  assert.ok(r.standardOptionsKW.includes(50));
  assert.ok(r.standardOptionsKW.includes(60));
  assert.equal(r.recommendedKW, 50);
});

test('the recommendation never falls outside the DC/AC band it reports', () => {
  for (const kWp of [5, 10.4, 25, 51.6, 60, 99, 150]) {
    const r = calculateInverter({ pvCapacityKWp: kWp, phases: 3 });
    assert.ok(r.standardOptionsKW.includes(r.recommendedKW),
      `${kWp} kWp recommended ${r.recommendedKW} kW, which is not in ${JSON.stringify(r.standardOptionsKW)}`);
  }
});

test('a grid-tied inverter is not sized by the site load', () => {
  const withLoad = calculateInverter({ pvCapacityKWp: 51.6, phases: 3, systemType: 'gridTied', maxDaytimeLoadKW: 43 });
  const withoutLoad = calculateInverter({ pvCapacityKWp: 51.6, phases: 3, systemType: 'gridTied' });
  assert.equal(withLoad.loadFloorKW, 0);
  assert.equal(withLoad.recommendedKW, withoutLoad.recommendedKW);
});

test('a hybrid inverter must also carry the load plus a surge allowance', () => {
  const r = calculateInverter({
    pvCapacityKWp: 51.6, phases: 3, systemType: 'hybrid', maxDaytimeLoadKW: 43, surgeFactor: 1.25,
  });
  near(r.loadFloorKW, 43 * 1.25, 1e-9);
  assert.ok(r.recommendedKW >= r.loadFloorKW, 'the inverter must cover the load floor');
  assert.ok(r.issues.some((i) => i.field === 'maxDaytimeLoadKW'),
    'it should say the load, not the array, is driving the size');
});

test('a custom DC/AC ratio changes the recommendation', () => {
  const wide = calculateInverter({ pvCapacityKWp: 100, phases: 3, dcAcRatioTarget: 1.5, dcAcRatioMin: 1.4, dcAcRatioMax: 1.6 });
  const tight = calculateInverter({ pvCapacityKWp: 100, phases: 3, dcAcRatioTarget: 1.0, dcAcRatioMin: 1.0, dcAcRatioMax: 1.1 });
  assert.ok(wide.recommendedKW < tight.recommendedKW);
});

test('actual DC/AC ratio is reported against the chosen rating', () => {
  const r = calculateInverter({ pvCapacityKWp: 51.6, phases: 3 });
  near(r.actualDcAcRatio, 51.6 / r.recommendedKW, 1e-9);
});

test('when no catalogue rating fits the band, it steps up and says so', () => {
  const r = calculateInverter({
    pvCapacityKWp: 51.6, phases: 3, systemType: 'offGrid', maxDaytimeLoadKW: 43,
  });
  assert.ok(r.issues.some((i) => i.level === 'warning' && /No standard inverter rating/.test(i.message)));
  assert.ok(INVERTER_RATINGS_KW.includes(r.recommendedKW));
  assert.ok(r.recommendedKW >= r.loadFloorKW);
});

test('invalid PV capacity is rejected', () => {
  const r = calculateInverter({ pvCapacityKWp: 0, phases: 3 });
  assert.ok(hasErrors(r.issues));
  assert.equal(r.recommendedKW, 0);
});

test('the result never claims a single size is universally correct', () => {
  const r = calculateInverter({ pvCapacityKWp: 60, phases: 3 });
  assert.deepEqual(r.caveats, INVERTER_CAVEATS);
  assert.ok(r.caveats.some((c) => /MPPT/i.test(c)));
  assert.ok(r.caveats.some((c) => /maximum DC input/i.test(c)));
  assert.ok(r.caveats.some((c) => /grid code|utility/i.test(c)));
  assert.ok(r.assumptions.some((a) => /not a model selection/i.test(a)));
  assert.match(r.rangeLabel, /–/, 'the headline answer is a range, not a single number');
});
