import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCurrent, calculateLoadSchedule, createLoadItem, kvaFromKw, kvarFromKw,
} from '../src/engine/load.js';
import { hasErrors } from '../src/engine/validation.js';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

test('three-phase current uses I = P / (root3 x V x PF)', () => {
  // 43 kW at 400 V, PF 0.90 -> 43000 / (1.7320508 x 400 x 0.9) = 68.97 A
  near(calculateCurrent(43, 400, 0.9, 3), 68.97);
});

test('single-phase current uses I = P / (V x PF)', () => {
  // 5 kW at 230 V, PF 0.95 -> 5000 / (230 x 0.95) = 22.88 A
  near(calculateCurrent(5, 230, 0.95, 1), 22.88);
});

test('current is zero at zero power, and errors at zero volts or bad PF', () => {
  assert.equal(calculateCurrent(0, 400, 0.9, 3), 0);
  assert.throws(() => calculateCurrent(10, 0, 0.9, 3), /Voltage must be greater than zero/);
  assert.throws(() => calculateCurrent(10, 400, 1.2, 3), /Power factor/);
});

test('kVA and kVAr derive from kW and power factor', () => {
  near(kvaFromKw(9, 0.9), 10);
  near(kvarFromKw(8, 0.8), 6); // 10 kVA, sin(phi) = 0.6
});

const specSchedule = {
  systemVoltage: 400,
  systemPhases: 3,
  loads: [
    createLoadItem({ name: 'AC', category: 'hvac', quantity: 6, ratedPower: 2, unit: 'kW', phase: 3, powerFactor: 0.9, diversityFactor: 1, hoursPerDay: 8 }),
    createLoadItem({ name: 'Lights', category: 'lighting', quantity: 40, ratedPower: 40, unit: 'W', phase: 1, powerFactor: 0.95, diversityFactor: 1, hoursPerDay: 10 }),
    createLoadItem({ name: 'Computers', category: 'itEquipment', quantity: 20, ratedPower: 150, unit: 'W', phase: 1, powerFactor: 0.95, diversityFactor: 1, hoursPerDay: 9 }),
    createLoadItem({ name: 'CCTV', category: 'security', quantity: 1, ratedPower: 500, unit: 'W', phase: 1, powerFactor: 0.9, diversityFactor: 1, hoursPerDay: 24 }),
  ],
};

test('the worked example totals 17.1 kW connected', () => {
  const r = calculateLoadSchedule(specSchedule);
  // 6x2 kW + 40x40 W + 20x150 W + 1x500 W = 12 + 1.6 + 3 + 0.5
  near(r.connectedLoadKW, 17.1, 1e-9);
  assert.equal(hasErrors(r.issues), false);
});

test('overall power factor is total kW / total kVA, not the mean of the factors', () => {
  const r = calculateLoadSchedule(specSchedule);
  // kVA = 12/0.9 + 1.6/0.95 + 3/0.95 + 0.5/0.9 = 18.7310
  near(r.maximumDemandKVA, 18.731, 0.001);
  near(r.overallPowerFactor, 17.1 / 18.731, 0.0005);
  const arithmeticMean = (0.9 + 0.95 + 0.95 + 0.9) / 4;
  assert.notEqual(Number(r.overallPowerFactor.toFixed(4)), Number(arithmeticMean.toFixed(4)));
});

test('daily energy sums power x diversity x hours per item', () => {
  const r = calculateLoadSchedule(specSchedule);
  // 12x8 + 1.6x10 + 3x9 + 0.5x24 = 96 + 16 + 27 + 12 = 151 kWh
  near(r.dailyEnergyKWh, 151, 1e-9);
  near(r.runningLoadKW, 151 / 24, 1e-9);
  near(r.monthlyEnergyKWh, 151 * 30.44, 1e-6);
});

test('connected, demand and running load stay distinct', () => {
  const r = calculateLoadSchedule({
    ...specSchedule,
    loads: specSchedule.loads.map((l) => ({ ...l, diversityFactor: 0.8 })),
  });
  near(r.connectedLoadKW, 17.1, 1e-9);
  near(r.maximumDemandKW, 17.1 * 0.8, 1e-9);
  assert.ok(r.runningLoadKW < r.maximumDemandKW, 'the 24 h average must be below the demand');
});

test('overall diversity and spare capacity scale the demand but not the connected load', () => {
  const r = calculateLoadSchedule({ ...specSchedule, overallDiversity: 0.9, spareCapacityPercent: 20 });
  near(r.connectedLoadKW, 17.1, 1e-9);
  near(r.maximumDemandKW, 17.1 * 0.9 * 1.2, 1e-6);
});

test('results change when any input changes - nothing is cached or hard-coded', () => {
  const base = calculateLoadSchedule(specSchedule);
  const more = calculateLoadSchedule({
    ...specSchedule,
    loads: [...specSchedule.loads, createLoadItem({ name: 'Pump', quantity: 1, ratedPower: 7.5, unit: 'kW', phase: 3, powerFactor: 0.85, diversityFactor: 1, hoursPerDay: 4 })],
  });
  assert.ok(more.connectedLoadKW > base.connectedLoadKW);
  assert.ok(more.demandCurrentA > base.demandCurrentA);
  assert.notEqual(more.overallPowerFactor, base.overallPowerFactor);

  const at230 = calculateLoadSchedule({ ...specSchedule, systemVoltage: 230, systemPhases: 1 });
  assert.ok(at230.demandCurrentA > base.demandCurrentA, 'the same load draws more current at 230 V single phase');
});

test('invalid rows produce errors and suppress the totals', () => {
  const r = calculateLoadSchedule({
    systemVoltage: 400,
    systemPhases: 3,
    loads: [createLoadItem({ name: 'Bad', quantity: 1, ratedPower: -5, unit: 'kW', phase: 3, powerFactor: 1.4, diversityFactor: 2, hoursPerDay: 30 })],
  });
  assert.ok(hasErrors(r.issues));
  assert.equal(r.connectedLoadKW, 0, 'no totals are reported while an input is invalid');
  const fields = r.issues.map((i) => i.field);
  assert.ok(fields.some((f) => f.endsWith('ratedPower')));
  assert.ok(fields.some((f) => f.endsWith('powerFactor')));
  assert.ok(fields.some((f) => f.endsWith('diversityFactor')));
  assert.ok(fields.some((f) => f.endsWith('hoursPerDay')));
});

test('an empty schedule warns instead of erroring', () => {
  const r = calculateLoadSchedule({ systemVoltage: 400, systemPhases: 3, loads: [] });
  assert.equal(hasErrors(r.issues), false);
  assert.equal(r.issues[0].level, 'warning');
});

test('every result carries its assumptions', () => {
  const r = calculateLoadSchedule(specSchedule);
  assert.ok(r.assumptions.length >= 5);
  assert.ok(r.assumptions.some((a) => a.includes('√3')));
});
