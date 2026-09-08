import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePanels, panelCount, rowSpacing, winterNoonSolarAltitude,
} from '../src/engine/panels.js';
import { PANEL_WATTAGES, MOUNTING_TYPES } from '../src/engine/constants.js';
import { sqmToSqft } from '../src/engine/units.js';
import { hasErrors } from '../src/engine/validation.js';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

test('the panel wattage menu covers the sizes the spec calls for', () => {
  assert.deepEqual(PANEL_WATTAGES, [550, 580, 585, 600, 620, 650]);
});

test('panel count always rounds UP to a whole module', () => {
  assert.equal(panelCount(51.55, 600), 86);   // 85.92 -> 86
  assert.equal(panelCount(50, 600), 84);      // 83.33 -> 84
  assert.equal(panelCount(60, 600), 100);     // exactly 100, no spurious extra
  assert.equal(panelCount(0.1, 600), 1);
  assert.throws(() => panelCount(10, 0), /greater than zero/);
});

const demo = {
  requiredPvKWp: 51.55, panelWattage: 600,
  panelWidthMm: 2278, panelHeightMm: 1134,
  mountingType: 'flatTilted', cityKey: 'multan',
};

test('the demo module gives 86 panels and 51.6 kWp installed', () => {
  const r = calculatePanels(demo);
  assert.equal(hasErrors(r.issues), false);
  assert.equal(r.panelCount, 86);
  near(r.installedCapacityKWp, 51.6, 1e-9);
  assert.ok(r.capacityDifferenceKWp > 0, 'rounding up always meets or exceeds the requirement');
});

test('module area is reported in m2 and sq ft and in both dimensions', () => {
  const r = calculatePanels(demo);
  near(r.panelAreaSqm, 2.583252, 1e-6);
  near(r.panelAreaSqft, sqmToSqft(2.583252), 1e-6);
  near(r.panelDimensions.widthM, 2.278, 1e-9);
  near(r.panelDimensions.heightM, 1.134, 1e-9);
  near(r.panelDimensions.widthFt, 7.474, 0.001);
  near(r.moduleFootprintSqm, 86 * 2.583252, 1e-6);
});

test('gross area applies the ground coverage ratio and the access margin', () => {
  const r = calculatePanels({ ...demo, accessMarginPercent: 10 });
  const expected = (86 * 2.583252) / MOUNTING_TYPES.flatTilted.gcr * 1.1;
  near(r.grossAreaSqm, expected, 1e-6);
  near(r.grossAreaSqft, sqmToSqft(expected), 1e-4);
  assert.ok(r.grossAreaSqm > r.moduleFootprintSqm, 'gross area must exceed bare module area');
});

test('a flush pitched roof needs less area than tilted rows on a flat roof', () => {
  const flat = calculatePanels({ ...demo, mountingType: 'flatTilted' });
  const pitched = calculatePanels({ ...demo, mountingType: 'flushPitched' });
  assert.ok(pitched.grossAreaSqm < flat.grossAreaSqm);
});

test('winter solar noon altitude follows 90 - latitude - declination', () => {
  near(winterNoonSolarAltitude(30.2), 90 - 30.2 - 23.45, 1e-9);
  assert.ok(winterNoonSolarAltitude(35.9) < winterNoonSolarAltitude(24.9),
    'the sun sits lower at higher latitude, so northern sites need wider rows');
});

test('row pitch is the row projection plus its shadow', () => {
  const s = rowSpacing(2.278, 15, 36.35);
  near(s.projectionM, 2.278 * Math.cos(15 * Math.PI / 180), 1e-9);
  near(s.shadowM, (2.278 * Math.sin(15 * Math.PI / 180)) / Math.tan(36.35 * Math.PI / 180), 1e-9);
  near(s.pitchM, s.projectionM + s.shadowM, 1e-12);
  near(s.pitchM, 3.0, 0.01);
});

test('a flat array needs no inter-row gap; a steeper tilt needs more', () => {
  assert.equal(rowSpacing(2.278, 0, 36.35).shadowM, 0);
  assert.ok(rowSpacing(2.278, 30, 36.35).pitchM > rowSpacing(2.278, 15, 36.35).pitchM);
  assert.ok(rowSpacing(2.278, 15, 20).pitchM > rowSpacing(2.278, 15, 36.35).pitchM,
    'a lower design sun altitude widens the rows');
});

test('orientation selects which module edge runs up the slope', () => {
  const portrait = calculatePanels({ ...demo, orientation: 'portrait' });
  const landscape = calculatePanels({ ...demo, orientation: 'landscape' });
  near(portrait.collectorSlopeLengthM, 2.278, 1e-9);
  near(landscape.collectorSlopeLengthM, 1.134, 1e-9);
  assert.ok(landscape.rowPitchM < portrait.rowPitchM);
});

test('a bigger module wattage needs fewer panels for the same capacity', () => {
  const w600 = calculatePanels({ ...demo, panelWattage: 600 });
  const w650 = calculatePanels({ ...demo, panelWattage: 650 });
  assert.ok(w650.panelCount < w600.panelCount);
  assert.equal(w650.panelCount, panelCount(51.55, 650));
});

test('area per kWp is reported in both unit systems', () => {
  const r = calculatePanels(demo);
  near(r.areaPerKWpSqm, r.grossAreaSqm / r.installedCapacityKWp, 1e-9);
  near(r.areaPerKWpSqft, sqmToSqft(r.grossAreaSqm) / r.installedCapacityKWp, 1e-6);
});

test('invalid dimensions and wattage are rejected', () => {
  const r = calculatePanels({ ...demo, panelWattage: -600, panelWidthMm: 0 });
  assert.ok(hasErrors(r.issues));
  assert.equal(r.panelCount, 0);
});

test('a zero-tilt array warns about soiling', () => {
  const r = calculatePanels({ ...demo, tiltDeg: 0 });
  assert.ok(r.issues.some((i) => i.field === 'tiltDeg' && /soiling/i.test(i.message)));
});

test('the assumptions record the rounding, the GCR and the spacing formula', () => {
  const r = calculatePanels(demo);
  assert.ok(r.assumptions.some((a) => /rounded UP/.test(a)));
  assert.ok(r.assumptions.some((a) => /ground coverage ratio/i.test(a)));
  assert.ok(r.assumptions.some((a) => a.includes('L·cos β')));
  assert.ok(r.assumptions.some((a) => /structural/i.test(a)));
});
