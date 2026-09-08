/**
 * The shipped demo project must reproduce the worked example the app is
 * documented against: a Multan bank branch at 400 V three phase whose maximum
 * demand lands at 43 kW and a power factor of 0.90, giving about 69 A.
 *
 * This also exercises store.js end to end — createDemoProject through
 * toEngineInputs into the engine — without a browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoProject, createProject, defaultSettings, toEngineInputs } from '../src/store.js';
import { calculateProject } from '../src/engine/index.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

const demo = createDemoProject(defaultSettings());
const result = calculateProject(toEngineInputs(demo));

test('the demo project is valid with no input errors', () => {
  const errors = result.issues.filter((i) => i.level === 'error');
  assert.deepEqual(errors, [], JSON.stringify(errors, null, 2));
});

test('demo maximum demand is 43 kW at 400 V three phase, PF 0.90, giving 69 A', () => {
  assert.equal(demo.inputs.load.systemVoltage, 400);
  assert.equal(demo.inputs.load.systemPhases, 3);
  near(result.load.maximumDemandKW, 43.0, 0.05);
  near(result.load.overallPowerFactor, 0.90, 0.005);
  near(result.load.demandCurrentA, 69.0, 0.3);
});

test('demo solar chain gives ~51.5 kWp, 86 modules at 600 W and a 50 kW inverter', () => {
  assert.equal(demo.inputs.panels.panelWattage, 600);
  assert.equal(demo.inputs.panels.panelWidthMm, 2278);
  assert.equal(demo.inputs.panels.panelHeightMm, 1134);
  assert.equal(demo.inputs.solar.cityKey, 'multan');
  assert.equal(demo.inputs.solar.targetPercent, 100);
  assert.equal(demo.inputs.solar.mode, 'instantaneous');

  near(result.solar.requiredPvKWp, 51.5, 0.2);
  assert.equal(result.panels.panelCount, 86);
  near(result.panels.installedCapacityKWp, 51.6, 0.01);
  assert.equal(result.inverter.recommendedKW, 50);
  assert.ok(result.panels.grossAreaSqft > 5000 && result.panels.grossAreaSqft < 7000);
});

test('demo cable sizes to 25 mm2 behind an 80 A device', () => {
  assert.equal(result.cable.recommendedSizeMm2, 25);
  assert.equal(result.cable.breaker.ratingA, 80);
  assert.equal(result.cable.breaker.type, 'MCB');
});

test('demo BOQ is complete and follows the module count', () => {
  assert.equal(result.boq.lines.length, 17);
  assert.equal(result.boq.lines.find((l) => l.id === 'pv-module').quantity, 86);
});

test('the schedule is a realistic mixed branch load, not a single lumped figure', () => {
  const loads = demo.inputs.load.loads;
  assert.ok(loads.length >= 8, 'the demo should show a real schedule');
  assert.ok(loads.some((l) => l.phase === 1) && loads.some((l) => l.phase === 3),
    'it should mix single- and three-phase loads');
  assert.ok(new Set(loads.map((l) => l.unit)).size >= 3,
    'it should exercise more than one power unit (W, kW, kVA, HP)');
  assert.ok(loads.some((l) => l.diversityFactor < 1),
    'diversity should actually be applied somewhere');
  assert.ok(result.load.connectedLoadKW > result.load.maximumDemandKW,
    'connected load must exceed maximum demand once diversity is applied');
  assert.ok(result.load.runningLoadKW < result.load.maximumDemandKW,
    'the 24 h average must sit below the demand');
});

test('a blank project is valid and calculates without throwing', () => {
  const blank = createProject(defaultSettings(), { name: 'Blank' });
  const r = calculateProject(toEngineInputs(blank));
  assert.equal(r.load.connectedLoadKW, 0);
  assert.ok(r.load.issues.some((i) => i.level === 'warning'), 'it should say there are no loads yet');
  assert.equal(r.boq.lines.length, 0, 'no BOQ without a module count');
});

test('store settings flow into a new project', () => {
  const settings = { ...defaultSettings(), defaultCityKey: 'quetta', defaultPanelWattage: 650, tariffPkrPerKwh: 72 };
  const p = createProject(settings, { name: 'Quetta site' });
  assert.equal(p.inputs.solar.cityKey, 'quetta');
  assert.equal(p.inputs.solar.peakSunHours, 5.7);
  assert.equal(p.inputs.panels.panelWattage, 650);
  assert.equal(p.inputs.solar.tariffPkrPerKwh, 72);
});
