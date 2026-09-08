/**
 * End-to-end checks on the demo case from the specification:
 * Multan, 43 kW at 400 V three phase, PF 0.90, 100 % daytime solar target,
 * 600 W modules measuring 2278 x 1134 mm.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProject } from '../src/engine/index.js';
import { createLoadItem } from '../src/engine/load.js';
import { hasErrors } from '../src/engine/validation.js';
import { ENGINEERING_DISCLAIMER } from '../src/engine/constants.js';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

const demoInputs = (overrides = {}) => ({
  load: {
    systemVoltage: 400,
    systemPhases: 3,
    loads: [createLoadItem({
      name: 'Branch total load', category: 'other', quantity: 1, ratedPower: 43,
      unit: 'kW', phase: 3, powerFactor: 0.9, diversityFactor: 1, hoursPerDay: 10,
    })],
    ...overrides.load,
  },
  solar: {
    mode: 'instantaneous', cityKey: 'multan', targetPercent: 100,
    systemLossPercent: 14, inverterEfficiency: 0.97, ...overrides.solar,
  },
  panels: {
    panelWattage: 600, panelWidthMm: 2278, panelHeightMm: 1134,
    mountingType: 'flatTilted', ...overrides.panels,
  },
  cable: { lengthM: 50, ambientC: 40, ...overrides.cable },
  inverter: { ...overrides.inverter },
  boq: { ...overrides.boq },
});

test('the demo project computes cleanly end to end', () => {
  const r = calculateProject(demoInputs());
  assert.equal(hasErrors(r.issues), false, JSON.stringify(r.issues, null, 2));
});

test('43 kW at 400 V three phase and PF 0.90 gives 69.0 A', () => {
  const r = calculateProject(demoInputs());
  near(r.load.connectedLoadKW, 43, 1e-9);
  near(r.load.maximumDemandKW, 43, 1e-9);
  near(r.load.demandCurrentA, 69.0, 0.05);
  near(r.load.overallPowerFactor, 0.9, 1e-9);
});

test('the solar chain produces PV capacity, modules, area and inverter together', () => {
  const r = calculateProject(demoInputs());
  near(r.solar.requiredPvKWp, 51.55, 0.02);
  assert.equal(r.panels.panelCount, 86);
  near(r.panels.installedCapacityKWp, 51.6, 1e-9);
  assert.ok(r.panels.grossAreaSqft > 4000 && r.panels.grossAreaSqft < 8000);
  assert.ok(r.inverter.recommendedKW >= 40 && r.inverter.recommendedKW <= 60);
  assert.ok(r.solar.dailyGenerationKWh > 200 && r.solar.dailyGenerationKWh < 250);
});

test('each stage feeds the next: the module count follows the required capacity', () => {
  const r = calculateProject(demoInputs());
  assert.equal(r.panels.panelCount, Math.ceil((r.solar.requiredPvKWp * 1000) / 600));
  assert.equal(r.inverter.pvCapacityKWp, r.panels.installedCapacityKWp);
  assert.equal(r.boq.lines.find((l) => l.id === 'pv-module').quantity, r.panels.panelCount);
  assert.equal(r.boq.lines.find((l) => l.id === 'inverter').description.startsWith(`${r.inverter.recommendedKW} kW`), true);
  assert.match(r.boq.lines.find((l) => l.id === 'ac-cable').description,
    new RegExp(`${r.cable.recommendedSizeMm2} mm²`));
});

test('nothing is hard-coded: doubling the load roughly doubles the array', () => {
  const base = calculateProject(demoInputs());
  const doubled = calculateProject(demoInputs({
    load: {
      loads: [createLoadItem({
        name: 'Branch total load', quantity: 1, ratedPower: 86, unit: 'kW',
        phase: 3, powerFactor: 0.9, diversityFactor: 1, hoursPerDay: 10,
      })],
    },
  }));
  near(doubled.load.demandCurrentA, base.load.demandCurrentA * 2, 0.01);
  near(doubled.solar.requiredPvKWp, base.solar.requiredPvKWp * 2, 0.01);
  assert.ok(doubled.panels.panelCount > base.panels.panelCount);
  assert.ok(doubled.cable.recommendedSizeMm2 > base.cable.recommendedSizeMm2);
  assert.ok(doubled.inverter.recommendedKW > base.inverter.recommendedKW);
  assert.ok(doubled.boq.lines.find((l) => l.id === 'dc-cable').quantity
    > base.boq.lines.find((l) => l.id === 'dc-cable').quantity);
});

test('changing the module wattage changes the count, area and BOQ', () => {
  const w600 = calculateProject(demoInputs());
  const w550 = calculateProject(demoInputs({ panels: { panelWattage: 550 } }));
  assert.ok(w550.panels.panelCount > w600.panels.panelCount);
  assert.ok(w550.panels.grossAreaSqm > w600.panels.grossAreaSqm);
  assert.equal(w550.boq.lines.find((l) => l.id === 'pv-module').quantity, w550.panels.panelCount);
  assert.match(w550.boq.lines.find((l) => l.id === 'pv-module').description, /550 Wp/);
});

test('changing the city changes the yield but not the Mode A array size', () => {
  const multan = calculateProject(demoInputs());
  const lahore = calculateProject(demoInputs({ solar: { cityKey: 'lahore' } }));
  near(lahore.solar.requiredPvKWp, multan.solar.requiredPvKWp, 1e-9);
  assert.ok(lahore.solar.dailyGenerationKWh < multan.solar.dailyGenerationKWh,
    'Mode A sizes on peak power, so only the energy yield changes with location');
});

test('Mode B sizes on daily energy and does change with the city', () => {
  const multan = calculateProject(demoInputs({ solar: { mode: 'dailyEnergy', dailyConsumptionKWh: 250 } }));
  const lahore = calculateProject(demoInputs({ solar: { mode: 'dailyEnergy', dailyConsumptionKWh: 250, cityKey: 'lahore' } }));
  near(multan.solar.requiredPvKWp, 57.63, 0.02);
  assert.ok(lahore.solar.requiredPvKWp > multan.solar.requiredPvKWp);
});

test('a single-phase system draws more current and needs a bigger cable', () => {
  const three = calculateProject(demoInputs());
  const single = calculateProject(demoInputs({ load: { systemVoltage: 230, systemPhases: 1 } }));
  assert.ok(single.load.demandCurrentA > three.load.demandCurrentA);
  assert.ok(single.cable.recommendedSizeMm2 > three.cable.recommendedSizeMm2);
  assert.equal(single.inverter.phases, 1);
});

test('invalid input anywhere surfaces as an error tagged with its stage', () => {
  const r = calculateProject(demoInputs({ load: { systemVoltage: 0 } }));
  assert.ok(hasErrors(r.issues));
  const bad = r.issues.filter((i) => i.level === 'error');
  assert.ok(bad.every((i) => i.field.includes('.')), 'issue fields are namespaced by stage');
  assert.ok(bad.some((i) => i.stage === 'load'));
});

test('the assumptions and the disclaimer travel with every result', () => {
  const r = calculateProject(demoInputs());
  assert.equal(r.disclaimer, ENGINEERING_DISCLAIMER);
  assert.ok(r.assumptions.length > 20, 'every stage contributes its assumptions');
  assert.ok(r.assumptions.some((a) => /I = P|√3/.test(a)));
  assert.ok(r.assumptions.some((a) => /PV capacity =/.test(a)));
  assert.ok(r.assumptions.some((a) => /rounded UP/.test(a)));
  assert.ok(r.assumptions.some((a) => /Ambient correction/.test(a)));
});
