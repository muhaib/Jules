/**
 * Cable sizing.
 *
 * The selection follows the conventional LV sequence:
 *
 *   1. Design current            Ib  (from the load)
 *   2. Protective device rating  In  ≥ Ib, from the standard range
 *   3. Required tabulated rating It  ≥ In / (Ca × Cg × Ci × Cf)
 *   4. Thermal size              smallest csa whose base rating ≥ It
 *   5. Voltage-drop size         smallest csa meeting the drop limit
 *   6. Recommended size          the larger of 4 and 5
 *
 * Step 4 alone does NOT make a cable safe. See `SELECTION_CAVEATS`.
 *
 * @module engine/cable
 */

import {
  CABLE_SIZES_MM2, BREAKER_RATINGS_A, MCB_MAX_RATING_A, AMPACITY_BASE,
  MATERIAL_FACTORS, INSULATION_TYPES, INSTALLATION_METHODS, AMBIENT_FACTORS,
  GROUPING_FACTORS, DEFAULT_REACTANCE_OHM_PER_M,
} from './constants.js';
import { calculateVoltageDrop } from './voltagedrop.js';
import { calculateCurrent } from './load.js';
import { checkNumber, checkPowerFactor, checkVoltage, hasErrors, error, warn } from './validation.js';

/**
 * Everything that a bare ampacity number does not account for. These are
 * surfaced in the UI next to every cable recommendation — an ampacity check on
 * its own is not a basis for saying a cable is safe.
 */
export const SELECTION_CAVEATS = [
  'Installation method and the actual routing (conduit fill, trunking, buried depth, soil thermal resistivity).',
  'Derating for ambient temperature, grouping with other circuits, and thermal insulation contact.',
  'Short-circuit withstand: the conductor must survive the prospective fault current for the protective device\'s disconnection time (adiabatic check, k²S² ≥ I²t).',
  'Earth-fault loop impedance and the disconnection times required by the applicable wiring rules.',
  'Voltage drop at the far end of the circuit, including any upstream drop already used up.',
  'Protective conductor (CPC/earth) sizing, which is a separate calculation.',
  'Harmonic content — triplen harmonics load the neutral and may require a larger neutral or a further derating.',
  'Mechanical protection, fire performance, cable type and the manufacturer\'s own published ratings.',
];

/**
 * Base tabulated rating for a size before any correction factors.
 * @param {number} csaMm2
 * @param {'copper'|'aluminium'} material
 * @param {'pvc'|'xlpe'} insulation
 * @param {1|3} phases
 * @param {'A'|'B'|'C'|'D'|'E'|'F'} method
 * @returns {number} Amperes, or NaN if the size is not tabulated.
 */
export function baseAmpacity(csaMm2, material, insulation, phases, method) {
  const table = phases === 3 ? AMPACITY_BASE.threeCore : AMPACITY_BASE.twoCore;
  const base = table[csaMm2];
  if (base === undefined) return NaN;
  const mat = MATERIAL_FACTORS[material];
  const ins = INSULATION_TYPES[insulation];
  const inst = INSTALLATION_METHODS[method];
  if (!mat || !ins || !inst) throw new Error('Unknown material, insulation or installation method.');
  return base * mat.ampacityFactor * ins.ampacityFactor * inst.factor;
}

/**
 * Linear interpolation over a numeric-keyed lookup, clamped at both ends.
 * @param {Record<number, number>} table
 * @param {number} x
 * @returns {number}
 */
export function interpolate(table, x) {
  const keys = Object.keys(table).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (keys.length === 0) return NaN;
  if (x <= keys[0]) return table[keys[0]];
  if (x >= keys.at(-1)) return table[keys.at(-1)];
  for (let i = 0; i < keys.length - 1; i += 1) {
    const lo = keys[i];
    const hi = keys[i + 1];
    if (x >= lo && x <= hi) {
      const t = (x - lo) / (hi - lo);
      return table[lo] + t * (table[hi] - table[lo]);
    }
  }
  return NaN;
}

/**
 * Ambient temperature correction factor Ca.
 * @param {number} ambientC
 * @param {'pvc'|'xlpe'} insulation
 * @returns {number}
 */
export const ambientFactor = (ambientC, insulation) =>
  interpolate(AMBIENT_FACTORS[insulation] ?? AMBIENT_FACTORS.pvc, ambientC);

/**
 * Grouping correction factor Cg.
 * @param {number} circuits
 * @returns {number}
 */
export function groupingFactor(circuits) {
  const n = Math.max(1, Math.round(circuits));
  const table = GROUPING_FACTORS.values;
  if (table[n] !== undefined) return table[n];
  return interpolate(table, n);
}

/**
 * Smallest standard protective device rating at or above the design current.
 * @param {number} designCurrentA
 * @returns {{ ratingA: number|null, type: 'MCB'|'MCCB'|null }}
 */
export function selectBreaker(designCurrentA) {
  const rating = BREAKER_RATINGS_A.find((r) => r >= designCurrentA);
  if (rating === undefined) return { ratingA: null, type: null };
  return { ratingA: rating, type: rating <= MCB_MAX_RATING_A ? 'MCB' : 'MCCB' };
}

/**
 * Sizes available for a given conductor material.
 * @param {'copper'|'aluminium'} material
 * @returns {number[]}
 */
export const availableSizes = (material) =>
  CABLE_SIZES_MM2.filter((s) => s >= (MATERIAL_FACTORS[material]?.minSizeMm2 ?? 1.5));

/**
 * @typedef {Object} CableInput
 * @property {number} [loadKW]        Provide either loadKW or currentA.
 * @property {number} [currentA]
 * @property {number} voltage
 * @property {1|3} phases
 * @property {number} powerFactor
 * @property {'copper'|'aluminium'} material
 * @property {'pvc'|'xlpe'} insulation
 * @property {number} cores           2, 3, 4 or 5 — informational, phases drives the rating column.
 * @property {'A'|'B'|'C'|'D'|'E'|'F'} installationMethod
 * @property {number} lengthM
 * @property {number} ambientC
 * @property {number} [groupedCircuits=1]
 * @property {number} [derateOther=1] Any further user-supplied derating factor.
 * @property {number} [voltageDropLimitPercent=3]
 * @property {number} [parallelRuns=1]
 * @property {number} [reactancePerMetre]
 */

/**
 * @typedef {Object} CableCandidate
 * @property {number} csaMm2
 * @property {number} baseRatingA        Tabulated, before derating.
 * @property {number} deratedRatingA     After Ca × Cg × Ci.
 * @property {number} dropVolts
 * @property {number} dropPercent
 * @property {boolean} thermalOk
 * @property {boolean} dropOk
 */

/**
 * @typedef {Object} CableResult
 * @property {number} designCurrentA
 * @property {{ratingA:number|null, type:string|null}} breaker
 * @property {number} ambientFactor
 * @property {number} groupingFactor
 * @property {number} otherFactor
 * @property {number} totalDerating
 * @property {number} requiredTabulatedRatingA
 * @property {number|null} thermalSizeMm2
 * @property {number|null} dropSizeMm2
 * @property {number|null} recommendedSizeMm2
 * @property {'thermal'|'voltage drop'|null} governedBy
 * @property {number|null} recommendedRatingA  Derated ampacity of the recommended size.
 * @property {import('./voltagedrop.js').VoltageDropResult|null} voltageDrop
 * @property {CableCandidate[]} candidates
 * @property {import('./validation.js').Issue[]} issues
 * @property {string[]} assumptions
 * @property {string[]} caveats
 */

/**
 * Size a cable.
 * @param {CableInput} input
 * @returns {CableResult}
 */
export function calculateCable(input) {
  /** @type {import('./validation.js').Issue[]} */
  const issues = [];
  const voltage = checkVoltage(issues, 'voltage', input.voltage);
  const powerFactor = checkPowerFactor(issues, 'powerFactor', input.powerFactor);
  const lengthM = checkNumber(issues, 'lengthM', input.lengthM, { label: 'Cable length', min: 0 });
  const ambientC = checkNumber(issues, 'ambientC', input.ambientC, { label: 'Ambient temperature', min: -20, max: 90 });
  const groupedCircuits = checkNumber(issues, 'groupedCircuits', input.groupedCircuits ?? 1, {
    label: 'Grouped circuits', min: 1, integer: true,
  });
  const parallelRuns = checkNumber(issues, 'parallelRuns', input.parallelRuns ?? 1, {
    label: 'Parallel runs per phase', min: 1, integer: true,
  });
  const dropLimit = checkNumber(issues, 'voltageDropLimitPercent', input.voltageDropLimitPercent ?? 3, {
    label: 'Voltage-drop limit', exclusiveMin: 0, max: 25,
  });
  const derateOther = input.derateOther ?? 1;
  if (!(derateOther > 0 && derateOther <= 1)) {
    issues.push(error('derateOther', 'Additional derating factor must be within (0, 1].'));
  }
  const phases = input.phases === 3 ? 3 : 1;

  if (!MATERIAL_FACTORS[input.material]) issues.push(error('material', 'Select a conductor material.'));
  if (!INSULATION_TYPES[input.insulation]) issues.push(error('insulation', 'Select an insulation type.'));
  if (!INSTALLATION_METHODS[input.installationMethod]) {
    issues.push(error('installationMethod', 'Select an installation method.'));
  }

  // Design current: from an explicit current, or derived from a kW figure.
  let designCurrentA = NaN;
  if (input.currentA !== undefined && input.currentA !== null && input.currentA !== '') {
    designCurrentA = checkNumber(issues, 'currentA', input.currentA, { label: 'Design current', min: 0 });
  } else if (input.loadKW !== undefined) {
    const kW = checkNumber(issues, 'loadKW', input.loadKW, { label: 'Load', min: 0 });
    if (!Number.isNaN(kW) && !Number.isNaN(voltage) && !Number.isNaN(powerFactor)) {
      designCurrentA = calculateCurrent(kW, voltage, powerFactor, phases);
    }
  } else {
    issues.push(error('currentA', 'Enter either a load in kW or a design current in amperes.'));
  }

  if (hasErrors(issues) || Number.isNaN(designCurrentA)) {
    return emptyCableResult(issues);
  }

  const ca = ambientFactor(ambientC, input.insulation);
  const cg = groupingFactor(groupedCircuits);
  const totalDerating = ca * cg * derateOther;

  const breaker = selectBreaker(designCurrentA);
  if (breaker.ratingA === null) {
    issues.push(warn('currentA', `Design current of ${designCurrentA.toFixed(1)} A exceeds the largest device in the standard range (${BREAKER_RATINGS_A.at(-1)} A). Consider paralleling circuits or a busbar trunking system.`));
  }

  // The cable must carry the device rating, not merely the design current, so
  // that the protection actually protects the cable.
  const currentToCarry = breaker.ratingA ?? designCurrentA;
  const requiredTabulatedRatingA = currentToCarry / totalDerating / parallelRuns;

  const sizes = availableSizes(input.material);
  /** @type {CableCandidate[]} */
  const candidates = [];
  let thermalSizeMm2 = null;
  let dropSizeMm2 = null;

  for (const csaMm2 of sizes) {
    const base = baseAmpacity(csaMm2, input.material, input.insulation, phases, input.installationMethod);
    const derated = base * totalDerating * parallelRuns;
    const vd = calculateVoltageDrop({
      currentA: designCurrentA,
      lengthM,
      csaMm2,
      material: input.material,
      phases,
      voltage,
      powerFactor,
      insulation: input.insulation,
      reactancePerMetre: input.reactancePerMetre ?? DEFAULT_REACTANCE_OHM_PER_M,
      parallelRuns,
    });
    const thermalOk = derated >= currentToCarry;
    const dropOk = vd.dropPercent <= dropLimit;
    if (thermalOk && thermalSizeMm2 === null) thermalSizeMm2 = csaMm2;
    if (dropOk && dropSizeMm2 === null) dropSizeMm2 = csaMm2;
    candidates.push({
      csaMm2,
      baseRatingA: base,
      deratedRatingA: derated,
      dropVolts: vd.dropVolts,
      dropPercent: vd.dropPercent,
      thermalOk,
      dropOk,
    });
  }

  let recommendedSizeMm2 = null;
  /** @type {'thermal'|'voltage drop'|null} */
  let governedBy = null;
  if (thermalSizeMm2 !== null && dropSizeMm2 !== null) {
    recommendedSizeMm2 = Math.max(thermalSizeMm2, dropSizeMm2);
    governedBy = dropSizeMm2 > thermalSizeMm2 ? 'voltage drop' : 'thermal';
  } else if (thermalSizeMm2 !== null) {
    recommendedSizeMm2 = thermalSizeMm2;
    governedBy = 'thermal';
    issues.push(warn('lengthM', `No cable in the standard range keeps the voltage drop within ${dropLimit}% over ${lengthM} m. Shorten the route, use parallel runs, or accept a higher drop.`));
  } else {
    issues.push(warn('currentA', 'No single cable in the standard range can carry this current with the stated derating. Use parallel runs or busbar trunking.'));
  }

  const recommended = candidates.find((c) => c.csaMm2 === recommendedSizeMm2) ?? null;
  const voltageDrop = recommendedSizeMm2
    ? calculateVoltageDrop({
      currentA: designCurrentA,
      lengthM,
      csaMm2: recommendedSizeMm2,
      material: input.material,
      phases,
      voltage,
      powerFactor,
      insulation: input.insulation,
      reactancePerMetre: input.reactancePerMetre ?? DEFAULT_REACTANCE_OHM_PER_M,
      parallelRuns,
    })
    : null;

  return {
    designCurrentA,
    breaker,
    ambientFactor: ca,
    groupingFactor: cg,
    otherFactor: derateOther,
    totalDerating,
    requiredTabulatedRatingA,
    thermalSizeMm2,
    dropSizeMm2,
    recommendedSizeMm2,
    governedBy,
    recommendedRatingA: recommended ? recommended.deratedRatingA : null,
    voltageDrop,
    candidates,
    issues,
    assumptions: [
      AMPACITY_BASE._basis,
      `Conductor: ${MATERIAL_FACTORS[input.material].label} (ampacity factor ${MATERIAL_FACTORS[input.material].ampacityFactor} vs the copper base table).`,
      `Insulation: ${INSULATION_TYPES[input.insulation].label} (factor ${INSULATION_TYPES[input.insulation].ampacityFactor}, conductor operating temperature ${INSULATION_TYPES[input.insulation].conductorTempC} °C).`,
      `Installation: ${INSTALLATION_METHODS[input.installationMethod].label} (factor ${INSTALLATION_METHODS[input.installationMethod].factor}).`,
      `Ambient correction Ca = ${ca.toFixed(3)} at ${ambientC} °C; grouping correction Cg = ${cg.toFixed(3)} for ${groupedCircuits} circuit(s); further derating ${derateOther}.`,
      `Required tabulated rating It ≥ In / (Ca × Cg × Ci) = ${currentToCarry.toFixed(1)} / ${totalDerating.toFixed(3)}${parallelRuns > 1 ? ` / ${parallelRuns} parallel runs` : ''} = ${requiredTabulatedRatingA.toFixed(1)} A.`,
      `Cable is sized to carry the protective device rating (${currentToCarry.toFixed(0)} A), not just the design current (${designCurrentA.toFixed(1)} A).`,
      `Voltage drop limit applied: ${dropLimit}% of ${voltage} V = ${((dropLimit / 100) * voltage).toFixed(1)} V.`,
      `Conductor resistance is calculated at the insulation's maximum operating temperature; reactance is taken as ${((input.reactancePerMetre ?? DEFAULT_REACTANCE_OHM_PER_M) * 1000).toFixed(3)} mΩ/m.`,
    ],
    caveats: SELECTION_CAVEATS,
  };
}

/**
 * @param {import('./validation.js').Issue[]} issues
 * @returns {CableResult}
 */
function emptyCableResult(issues) {
  return {
    designCurrentA: NaN,
    breaker: { ratingA: null, type: null },
    ambientFactor: NaN,
    groupingFactor: NaN,
    otherFactor: NaN,
    totalDerating: NaN,
    requiredTabulatedRatingA: NaN,
    thermalSizeMm2: null,
    dropSizeMm2: null,
    recommendedSizeMm2: null,
    governedBy: null,
    recommendedRatingA: null,
    voltageDrop: null,
    candidates: [],
    issues,
    assumptions: [],
    caveats: SELECTION_CAVEATS,
  };
}
