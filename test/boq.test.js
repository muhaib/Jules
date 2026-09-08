import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBoq, stringConfiguration, boqTotal } from '../src/engine/boq.js';

const demo = {
  panelCount: 86, panelWattage: 600, installedCapacityKWp: 51.6,
  inverterKW: 50, phases: 3, acCableSizeMm2: 25,
};

test('string configuration rounds up to whole strings', () => {
  assert.deepEqual(stringConfiguration(86, 20), { strings: 5, remainder: 6 });
  assert.deepEqual(stringConfiguration(40, 20), { strings: 2, remainder: 0 });
  assert.throws(() => stringConfiguration(10, 0), /greater than zero/);
});

test('the BOQ contains every item the spec lists', () => {
  const { lines } = generateBoq(demo);
  const ids = lines.map((l) => l.id);
  for (const required of [
    'pv-module', 'inverter', 'dc-cable', 'ac-cable', 'dc-isolator', 'ac-isolator',
    'dc-spd', 'ac-spd', 'earth-cable', 'earth-electrode', 'mc4', 'cable-tray',
    'mounting', 'combiner', 'acdb', 'labels', 'installation',
  ]) {
    assert.ok(ids.includes(required), `BOQ is missing "${required}"`);
  }
});

test('every line carries qty, unit, description, brand, remarks and its basis', () => {
  const { lines } = generateBoq(demo);
  for (const l of lines) {
    assert.equal(typeof l.quantity, 'number');
    assert.ok(Number.isFinite(l.quantity) && l.quantity > 0, `${l.id} has no quantity`);
    assert.ok(l.unit && l.description && l.item, `${l.id} is missing text fields`);
    assert.equal(l.brand, '', 'brand is left blank for the user');
    assert.ok(l.remarks.length > 0, `${l.id} has no remarks`);
    assert.ok(l.basis.length > 0, `${l.id} does not say how its quantity was derived`);
  }
});

test('quantities are derived from the sizing, not hard-coded', () => {
  const small = generateBoq({ ...demo, panelCount: 20, installedCapacityKWp: 12, inverterKW: 10 });
  const big = generateBoq({ ...demo, panelCount: 400, installedCapacityKWp: 240, inverterKW: 200 });
  const qty = (b, id) => b.lines.find((l) => l.id === id).quantity;

  assert.equal(qty(small, 'pv-module'), 20);
  assert.equal(qty(big, 'pv-module'), 400);
  assert.ok(qty(big, 'dc-cable') > qty(small, 'dc-cable'));
  assert.ok(qty(big, 'mc4') > qty(small, 'mc4'));
  assert.ok(qty(big, 'earth-electrode') > qty(small, 'earth-electrode'));
  assert.equal(qty(small, 'earth-electrode'), 2, 'a minimum of two electrodes always applies');
});

test('DC cable covers positive and negative for every string', () => {
  const b = generateBoq({ ...demo, modulesPerString: 20, dcRunLengthM: 40 });
  // 5 strings x 40 m x 2 conductors = 400 m
  assert.equal(b.lines.find((l) => l.id === 'dc-cable').quantity, 400);
  assert.equal(b.summary.strings, 5);
});

test('MC4 connectors include the spares percentage', () => {
  const none = generateBoq({ ...demo, sparesPercent: 0 });
  const withSpares = generateBoq({ ...demo, sparesPercent: 10 });
  assert.equal(none.lines.find((l) => l.id === 'mc4').quantity, 10);  // 5 strings x 2
  assert.equal(withSpares.lines.find((l) => l.id === 'mc4').quantity, 11);
});

test('AC cable description carries the size from the cable calculator', () => {
  const sized = generateBoq({ ...demo, acCableSizeMm2: 25 });
  assert.match(sized.lines.find((l) => l.id === 'ac-cable').description, /25 mm²/);
  const unsized = generateBoq({ ...demo, acCableSizeMm2: undefined });
  assert.match(unsized.lines.find((l) => l.id === 'ac-cable').description, /cable calculator/);
});

test('single-phase and three-phase produce different AC equipment', () => {
  const three = generateBoq({ ...demo, phases: 3 });
  const one = generateBoq({ ...demo, phases: 1 });
  assert.match(three.lines.find((l) => l.id === 'ac-isolator').description, /4-pole/);
  assert.match(one.lines.find((l) => l.id === 'ac-isolator').description, /2-pole/);
  assert.match(three.lines.find((l) => l.id === 'ac-spd').description, /3P\+N/);
});

test('an empty sizing produces no BOQ and says why', () => {
  const b = generateBoq({ ...demo, panelCount: 0 });
  assert.equal(b.lines.length, 0);
  assert.match(b.notes[0], /solar sizing first/);
});

test('exclusions are stated rather than silently omitted', () => {
  const b = generateBoq(demo);
  assert.ok(b.notes.some((nt) => /net metering|excluded/i.test(nt)));
  assert.ok(b.notes.some((nt) => /estimates|re-measure/i.test(nt)));
});

test('boqTotal prices only the lines that have a rate', () => {
  const { lines } = generateBoq(demo);
  assert.deepEqual(boqTotal(lines), { total: 0, pricedLines: 0, unpricedLines: lines.length });

  const priced = lines.map((l) => (l.id === 'pv-module' ? { ...l, rate: 25000 } : l));
  const t = boqTotal(priced);
  assert.equal(t.total, 86 * 25000);
  assert.equal(t.pricedLines, 1);
  assert.equal(t.unpricedLines, lines.length - 1);
});
