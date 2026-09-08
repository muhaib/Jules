/**
 * Unit conversion and numeric formatting helpers.
 * Pure functions — no DOM, no side effects.
 * @module engine/units
 */

export const MM_PER_M = 1000;
export const FT_PER_M = 3.280839895013123;
export const SQFT_PER_SQM = 10.763910416709722;

/** @param {number} mm @returns {number} metres */
export const mmToM = (mm) => mm / MM_PER_M;

/** @param {number} m @returns {number} millimetres */
export const mToMm = (m) => m * MM_PER_M;

/** @param {number} m @returns {number} feet */
export const mToFt = (m) => m * FT_PER_M;

/** @param {number} ft @returns {number} metres */
export const ftToM = (ft) => ft / FT_PER_M;

/** @param {number} mm @returns {number} feet */
export const mmToFt = (mm) => mmToM(mm) * FT_PER_M;

/** @param {number} sqm @returns {number} square feet */
export const sqmToSqft = (sqm) => sqm * SQFT_PER_SQM;

/** @param {number} sqft @returns {number} square metres */
export const sqftToSqm = (sqft) => sqft / SQFT_PER_SQM;

/**
 * Convert a rated power into kW.
 * @param {number} value
 * @param {'W'|'kW'|'HP'|'VA'|'kVA'} unit
 * @param {number} [powerFactor] Only used for VA/kVA -> kW.
 * @returns {number} kW
 */
export function toKW(value, unit, powerFactor = 1) {
  switch (unit) {
    case 'W': return value / 1000;
    case 'kW': return value;
    // 1 metric/mechanical HP is taken as 0.746 kW of *output*; motor input
    // power is higher by the motor efficiency, which the caller must apply.
    case 'HP': return value * 0.746;
    case 'VA': return (value / 1000) * powerFactor;
    case 'kVA': return value * powerFactor;
    default: throw new Error(`Unknown power unit: ${unit}`);
  }
}

/**
 * Rectangle area from millimetre dimensions.
 * @param {number} widthMm
 * @param {number} heightMm
 * @returns {{ sqm: number, sqft: number, widthM: number, heightM: number, widthFt: number, heightFt: number }}
 */
export function rectangleFromMm(widthMm, heightMm) {
  const widthM = mmToM(widthMm);
  const heightM = mmToM(heightMm);
  const sqm = widthM * heightM;
  return {
    sqm,
    sqft: sqmToSqft(sqm),
    widthM,
    heightM,
    widthFt: mToFt(widthM),
    heightFt: mToFt(heightM),
  };
}

/**
 * Round to a fixed number of decimals without floating-point noise.
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {number}
 */
export function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON * Math.sign(value || 1)) * f) / f;
}

/** Degrees -> radians. @param {number} deg @returns {number} */
export const toRadians = (deg) => (deg * Math.PI) / 180;

/** Radians -> degrees. @param {number} rad @returns {number} */
export const toDegrees = (rad) => (rad * 180) / Math.PI;

/**
 * sin(phi) from a power factor (lagging assumed).
 * @param {number} powerFactor 0..1
 * @returns {number}
 */
export function sinPhi(powerFactor) {
  const pf = Math.min(1, Math.max(0, powerFactor));
  return Math.sqrt(Math.max(0, 1 - pf * pf));
}

/**
 * Format a number for display with thousands separators.
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {string}
 */
export function fmt(value, decimals = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
