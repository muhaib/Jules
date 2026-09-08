/**
 * PV module count, array footprint and row spacing.
 * @module engine/panels
 */

import { rectangleFromMm, mmToM, sqmToSqft, mToFt, toRadians } from './units.js';
import { checkNumber, hasErrors, warn } from './validation.js';
import { MOUNTING_TYPES, SOLAR_DECLINATION_DEG, PAKISTAN_CITIES } from './constants.js';

/**
 * @typedef {Object} PanelInput
 * @property {number} requiredPvKWp
 * @property {number} panelWattage
 * @property {number} panelWidthMm      Long edge of the module.
 * @property {number} panelHeightMm     Short edge of the module.
 * @property {'portrait'|'landscape'} [orientation='portrait'] How the module sits in the row.
 * @property {keyof typeof MOUNTING_TYPES} [mountingType='flatTilted']
 * @property {number} [tiltDeg]         Overrides the mounting default.
 * @property {number} [accessMarginPercent=10] Walkway / maintenance / inverter-area allowance.
 * @property {number} [latitude]        Used for the default design solar altitude.
 * @property {string} [cityKey]
 * @property {number} [designSolarAltitudeDeg] Sun altitude used for row-spacing shadow length.
 */

/**
 * @typedef {Object} PanelResult
 * @property {number} panelCount
 * @property {number} installedCapacityKWp
 * @property {number} capacityDifferenceKWp   Installed minus required.
 * @property {number} panelAreaSqm            One module.
 * @property {number} panelAreaSqft
 * @property {{widthM:number,heightM:number,widthFt:number,heightFt:number}} panelDimensions
 * @property {number} moduleFootprintSqm      panelCount × panelAreaSqm
 * @property {number} moduleFootprintSqft
 * @property {number} grossAreaSqm            Footprint ÷ GCR, plus the access margin.
 * @property {number} grossAreaSqft
 * @property {number} groundCoverageRatio
 * @property {number} tiltDeg
 * @property {number} designSolarAltitudeDeg
 * @property {number} rowPitchM               Centre-to-centre spacing between rows.
 * @property {number} rowGapM                 Clear gap between the back of one row and the next.
 * @property {number} collectorSlopeLengthM   Module dimension along the slope.
 * @property {number} areaPerKWpSqm
 * @property {number} areaPerKWpSqft
 * @property {number} accessMarginPercent
 * @property {import('./validation.js').Issue[]} issues
 * @property {string[]} assumptions
 */

/**
 * Winter-solstice solar noon altitude for a latitude — the conventional
 * worst-case-for-the-year reference when spacing rows.
 *   α = 90° − latitude − 23.45°
 * @param {number} latitudeDeg
 * @returns {number} degrees
 */
export const winterNoonSolarAltitude = (latitudeDeg) =>
  90 - Math.abs(latitudeDeg) - SOLAR_DECLINATION_DEG;

/**
 * Minimum row pitch to avoid inter-row shading at a given sun altitude.
 *
 *   pitch = L·cos(β) + L·sin(β) / tan(α)
 *
 * where L is the module length along the slope, β the tilt, α the design sun
 * altitude. The first term is the row's own horizontal projection; the second
 * is the shadow it casts.
 *
 * @param {number} collectorLengthM
 * @param {number} tiltDeg
 * @param {number} solarAltitudeDeg
 * @returns {{ pitchM: number, gapM: number, shadowM: number, projectionM: number }}
 */
export function rowSpacing(collectorLengthM, tiltDeg, solarAltitudeDeg) {
  const beta = toRadians(tiltDeg);
  const alpha = toRadians(solarAltitudeDeg);
  const projectionM = collectorLengthM * Math.cos(beta);
  const heightM = collectorLengthM * Math.sin(beta);
  const shadowM = solarAltitudeDeg > 0 ? heightM / Math.tan(alpha) : Infinity;
  const pitchM = projectionM + shadowM;
  return { pitchM, gapM: shadowM, shadowM, projectionM };
}

/**
 * Number of modules required. Always rounded UP — a fractional module does not
 * exist, and rounding down would leave the array short of the target.
 * @param {number} requiredPvKWp
 * @param {number} panelWattage
 * @returns {number}
 */
export function panelCount(requiredPvKWp, panelWattage) {
  if (!(panelWattage > 0)) throw new Error('Panel wattage must be greater than zero.');
  return Math.ceil((requiredPvKWp * 1000) / panelWattage);
}

/**
 * @param {PanelInput} input
 * @returns {PanelResult}
 */
export function calculatePanels(input) {
  /** @type {import('./validation.js').Issue[]} */
  const issues = [];
  const requiredPvKWp = checkNumber(issues, 'requiredPvKWp', input.requiredPvKWp, {
    label: 'Required PV capacity', exclusiveMin: 0,
  });
  const panelWattage = checkNumber(issues, 'panelWattage', input.panelWattage, {
    label: 'Panel wattage', exclusiveMin: 0, max: 2000,
  });
  const widthMm = checkNumber(issues, 'panelWidthMm', input.panelWidthMm, {
    label: 'Panel length', exclusiveMin: 0, max: 5000,
  });
  const heightMm = checkNumber(issues, 'panelHeightMm', input.panelHeightMm, {
    label: 'Panel width', exclusiveMin: 0, max: 5000,
  });
  const accessMarginPercent = checkNumber(issues, 'accessMarginPercent', input.accessMarginPercent ?? 10, {
    label: 'Access / maintenance margin', min: 0, max: 100,
  });

  const mounting = MOUNTING_TYPES[input.mountingType ?? 'flatTilted'] ?? MOUNTING_TYPES.flatTilted;
  const tiltDeg = checkNumber(issues, 'tiltDeg', input.tiltDeg ?? mounting.tiltDeg, {
    label: 'Tilt angle', min: 0, max: 60,
  });

  if (hasErrors(issues)) return emptyPanelResult(issues);

  const latitude = input.latitude
    ?? PAKISTAN_CITIES.find((c) => c.key === input.cityKey)?.latitude
    ?? PAKISTAN_CITIES[0].latitude;
  const designSolarAltitudeDeg = input.designSolarAltitudeDeg ?? winterNoonSolarAltitude(latitude);

  const count = panelCount(requiredPvKWp, panelWattage);
  const installedCapacityKWp = (count * panelWattage) / 1000;

  const rect = rectangleFromMm(widthMm, heightMm);
  const moduleFootprintSqm = count * rect.sqm;

  // On a flat/tilted array the modules tilt back, so the footprint shrinks by
  // cos(tilt) while the row gap adds it back. GCR captures the net effect.
  const gcr = mounting.gcr;
  const arrayAreaSqm = moduleFootprintSqm / gcr;
  const grossAreaSqm = arrayAreaSqm * (1 + accessMarginPercent / 100);

  // Portrait: the long edge runs up the slope. Landscape: the short edge does.
  const orientation = input.orientation ?? 'portrait';
  const collectorSlopeLengthM = orientation === 'portrait' ? mmToM(widthMm) : mmToM(heightMm);
  const spacing = rowSpacing(collectorSlopeLengthM, tiltDeg, designSolarAltitudeDeg);

  if (tiltDeg === 0) {
    issues.push(warn('tiltDeg', 'At 0° tilt there is no inter-row shading, but soiling accumulates faster and rainfall no longer self-cleans the modules effectively.'));
  }
  if (designSolarAltitudeDeg <= 5) {
    issues.push(warn('designSolarAltitudeDeg', 'A very low design sun altitude produces impractically large row spacing. Most designs accept some shading outside a 9 am – 3 pm window.'));
  }

  return {
    panelCount: count,
    installedCapacityKWp,
    capacityDifferenceKWp: installedCapacityKWp - requiredPvKWp,
    panelAreaSqm: rect.sqm,
    panelAreaSqft: rect.sqft,
    panelDimensions: {
      widthM: rect.widthM, heightM: rect.heightM, widthFt: rect.widthFt, heightFt: rect.heightFt,
    },
    moduleFootprintSqm,
    moduleFootprintSqft: sqmToSqft(moduleFootprintSqm),
    grossAreaSqm,
    grossAreaSqft: sqmToSqft(grossAreaSqm),
    groundCoverageRatio: gcr,
    tiltDeg,
    designSolarAltitudeDeg,
    rowPitchM: spacing.pitchM,
    rowGapM: spacing.gapM,
    collectorSlopeLengthM,
    areaPerKWpSqm: installedCapacityKWp > 0 ? grossAreaSqm / installedCapacityKWp : NaN,
    areaPerKWpSqft: installedCapacityKWp > 0 ? sqmToSqft(grossAreaSqm) / installedCapacityKWp : NaN,
    accessMarginPercent,
    issues,
    assumptions: [
      `Module count = required capacity ÷ module wattage = ${requiredPvKWp.toFixed(2)} kWp ÷ ${panelWattage} W = ${((requiredPvKWp * 1000) / panelWattage).toFixed(2)}, rounded UP to ${count} modules.`,
      `Installed capacity is therefore ${installedCapacityKWp.toFixed(2)} kWp, ${installedCapacityKWp >= requiredPvKWp ? 'above' : 'below'} the required ${requiredPvKWp.toFixed(2)} kWp.`,
      `Module ${widthMm} × ${heightMm} mm = ${rect.sqm.toFixed(3)} m² (${rect.sqft.toFixed(2)} sq ft) each; ${count} modules = ${moduleFootprintSqm.toFixed(1)} m² of module glass.`,
      `Mounting: ${mounting.label} at ${tiltDeg}° tilt, ground coverage ratio ${gcr}. ${mounting.note}`,
      `Gross array area = module area ÷ GCR × (1 + ${accessMarginPercent}% access margin) = ${grossAreaSqm.toFixed(1)} m² (${sqmToSqft(grossAreaSqm).toFixed(0)} sq ft).`,
      `Row spacing from pitch = L·cos β + L·sin β / tan α, with L = ${collectorSlopeLengthM.toFixed(3)} m (${orientation}), β = ${tiltDeg}°, α = ${designSolarAltitudeDeg.toFixed(1)}° (winter solar noon at latitude ${latitude.toFixed(2)}°).`,
      `Minimum row pitch ≈ ${spacing.pitchM.toFixed(2)} m (${mToFt(spacing.pitchM).toFixed(2)} ft), of which ${spacing.gapM.toFixed(2)} m is clear gap behind each row.`,
      'Area figures are a planning envelope only. Actual roof usable area depends on parapets, water tanks, stairwells, plant, setbacks required by the fire code, and the structural capacity of the roof.',
      'Structural adequacy of the roof for the additional dead load and wind uplift must be confirmed by a structural engineer.',
    ],
  };
}

/**
 * @param {import('./validation.js').Issue[]} issues
 * @returns {PanelResult}
 */
function emptyPanelResult(issues) {
  return {
    panelCount: 0,
    installedCapacityKWp: 0,
    capacityDifferenceKWp: 0,
    panelAreaSqm: 0,
    panelAreaSqft: 0,
    panelDimensions: { widthM: 0, heightM: 0, widthFt: 0, heightFt: 0 },
    moduleFootprintSqm: 0,
    moduleFootprintSqft: 0,
    grossAreaSqm: 0,
    grossAreaSqft: 0,
    groundCoverageRatio: NaN,
    tiltDeg: NaN,
    designSolarAltitudeDeg: NaN,
    rowPitchM: NaN,
    rowGapM: NaN,
    collectorSlopeLengthM: NaN,
    areaPerKWpSqm: NaN,
    areaPerKWpSqft: NaN,
    accessMarginPercent: NaN,
    issues,
    assumptions: [],
  };
}
