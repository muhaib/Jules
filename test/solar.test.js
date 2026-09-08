import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSolar, systemEfficiency, pvCapacityForEnergy, pvCapacityForPower,
  resolvePeakSunHours, SOLAR_CAVEATS,
} from '../src/engine/solar.js';
import { PAKISTAN_CITIES, DAYS_PER_MONTH } from '../src/engine/constants.js';
import { hasErrors } from '../src/engine/validation.js';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

test('Multan is the default location and every city carries a latitude', () => {
  assert.equal(PAKISTAN_CITIES[0].key, 'multan');
  assert.equal(resolvePeakSunHours('multan', undefined), 5.2);
  assert.equal(resolvePeakSunHours(undefined, undefined), 5.2, 'falls back to Multan');
  assert.equal(resolvePeakSunHours('multan', 6.1), 6.1, 'an explicit value overrides the city');
  assert.ok(PAKISTAN_CITIES.length >= 15);
  assert.ok(PAKISTAN_CITIES.every((c) => c.peakSunHours > 3 && c.peakSunHours < 8 && c.latitude > 20));
});

test('system efficiency multiplies DC losses by inverter efficiency', () => {
  near(systemEfficiency(14, 0.97), 0.86 * 0.97, 1e-12);
  near(systemEfficiency(0, 1), 1, 1e-12);
});

test('PV capacity formulas match the documented relations', () => {
  // kWp = energy / (PSH x efficiency)
  near(pvCapacityForEnergy(250, 5.2, 0.8342), 250 / (5.2 * 0.8342), 1e-9);
  // kWp = P_ac / efficiency
  near(pvCapacityForPower(43, 0.8342), 43 / 0.8342, 1e-9);
  assert.throws(() => pvCapacityForEnergy(100, 0, 0.8), /Peak sun hours/);
  assert.throws(() => pvCapacityForPower(10, 0), /System efficiency/);
});

const modeA = {
  mode: 'instantaneous', daytimeLoadKW: 43, cityKey: 'multan',
  targetPercent: 100, systemLossPercent: 14, inverterEfficiency: 0.97,
};

test('Mode A sizes 43 kW of daytime load to about 51.5 kWp', () => {
  const r = calculateSolar(modeA);
  assert.equal(hasErrors(r.issues), false);
  near(r.requiredPvKWp, 43 / (0.86 * 0.97), 0.001);
  near(r.requiredPvKWp, 51.55, 0.01);
  assert.equal(r.targetAcPowerKW, 43);
});

test('Mode A always warns that peak-irradiance sizing is not all-day cover', () => {
  const r = calculateSolar(modeA);
  const warning = r.issues.find((i) => i.field === 'mode');
  assert.ok(warning, 'Mode A must carry the peak-irradiance caveat');
  assert.match(warning.message, /peak irradiance/i);
});

test('Mode B sizes 250 kWh/day to about 57.6 kWp in Multan', () => {
  const r = calculateSolar({
    mode: 'dailyEnergy', dailyConsumptionKWh: 250, cityKey: 'multan',
    targetPercent: 100, systemLossPercent: 14, inverterEfficiency: 0.97,
  });
  near(r.requiredPvKWp, 250 / (5.2 * 0.86 * 0.97), 0.001);
  near(r.requiredPvKWp, 57.63, 0.01);
  assert.equal(r.requiredEnergyKWh, 250);
});

test('generation follows kWp x PSH x efficiency and scales to month and year', () => {
  const r = calculateSolar(modeA);
  near(r.dailyGenerationKWh, r.requiredPvKWp * r.peakSunHours * r.systemEfficiency, 1e-9);
  near(r.monthlyGenerationKWh, r.dailyGenerationKWh * DAYS_PER_MONTH, 1e-9);
  near(r.annualGenerationKWh, r.dailyGenerationKWh * 365, 1e-9);
  near(r.specificYieldKWhPerKWpYear, r.peakSunHours * r.systemEfficiency * 365, 1e-6);
});

test('a partial solar target scales the array proportionally', () => {
  const full = calculateSolar(modeA);
  const half = calculateSolar({ ...modeA, targetPercent: 50 });
  near(half.requiredPvKWp, full.requiredPvKWp / 2, 1e-9);
});

test('future load allowance increases the array', () => {
  const base = calculateSolar(modeA);
  const withFuture = calculateSolar({ ...modeA, futureLoadKW: 10 });
  near(withFuture.requiredPvKWp, (43 + 10) / (0.86 * 0.97), 0.001);
  assert.ok(withFuture.requiredPvKWp > base.requiredPvKWp);
});

test('higher losses and a different city change the answer', () => {
  const base = calculateSolar(modeA);
  assert.ok(calculateSolar({ ...modeA, systemLossPercent: 25 }).requiredPvKWp > base.requiredPvKWp);
  const quetta = calculateSolar({ ...modeA, mode: 'dailyEnergy', dailyConsumptionKWh: 250, cityKey: 'quetta' });
  const lahore = calculateSolar({ ...modeA, mode: 'dailyEnergy', dailyConsumptionKWh: 250, cityKey: 'lahore' });
  assert.ok(quetta.requiredPvKWp < lahore.requiredPvKWp, 'sunnier Quetta needs a smaller array than Lahore');
});

test('savings use the tariff and split self-consumption from export', () => {
  const r = calculateSolar({ ...modeA, tariffPkrPerKwh: 60 });
  near(r.monthlySavingsPkr, r.monthlyGenerationKWh * 60, 0.01);
  const exported = calculateSolar({ ...modeA, tariffPkrPerKwh: 60, exportFraction: 0.5, exportTariffPkrPerKwh: 20 });
  near(exported.monthlySavingsPkr, r.monthlyGenerationKWh * (0.5 * 60 + 0.5 * 20), 0.01);
  assert.ok(exported.monthlySavingsPkr < r.monthlySavingsPkr);
});

test('invalid solar inputs are rejected', () => {
  const r = calculateSolar({ ...modeA, daytimeLoadKW: -5, inverterEfficiency: 1.4, systemLossPercent: -3 });
  assert.ok(hasErrors(r.issues));
  assert.equal(r.requiredPvKWp, 0);
});

test('a target above 100 % warns about the surplus', () => {
  const r = calculateSolar({ ...modeA, targetPercent: 150 });
  assert.ok(r.issues.some((i) => i.field === 'targetPercent' && i.level === 'warning'));
});

test('caveats about seasonality, temperature and shading always travel with the result', () => {
  const r = calculateSolar(modeA);
  assert.deepEqual(r.caveats, SOLAR_CAVEATS);
  assert.ok(r.caveats.some((c) => /December|annual average/i.test(c)));
  assert.ok(r.caveats.some((c) => /temperature/i.test(c)));
  assert.ok(r.caveats.some((c) => /shading/i.test(c)));
  assert.ok(r.assumptions.some((a) => a.includes('PV capacity =')));
});
