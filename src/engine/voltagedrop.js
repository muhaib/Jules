/**
 * Voltage drop calculation from conductor physics rather than a lookup table,
 * so every term is visible and adjustable.
 *
 *   R_total = ρ₂₀ × [1 + α(θ − 20)] × L / A          (Ω, one-way)
 *   X_total = x × L                                   (Ω, one-way)
 *
 *   Single phase:  ΔV = 2 × I × L × (R′·cosφ + X′·sinφ)
 *   Three phase:   ΔV = √3 × I × L × (R′·cosφ + X′·sinφ)
 *
 * where R′ and X′ are per-metre values. The factor of 2 for single phase
 * accounts for the return conductor; √3 for three phase gives the line-to-line
 * drop of a balanced system.
 *
 * @module engine/voltagedrop
 */

import { sinPhi } from './units.js';
import { MATERIAL_FACTORS, INSULATION_TYPES, DEFAULT_REACTANCE_OHM_PER_M } from './constants.js';

/**
 * Conductor d.c. resistance per metre at the operating temperature.
 * @param {number} csaMm2 Cross-sectional area, mm².
 * @param {'copper'|'aluminium'} material
 * @param {number} conductorTempC Operating temperature, °C.
 * @returns {number} Ω per metre.
 */
export function resistancePerMetre(csaMm2, material, conductorTempC) {
  const m = MATERIAL_FACTORS[material];
  if (!m) throw new Error(`Unknown conductor material: ${material}`);
  if (!(csaMm2 > 0)) throw new Error('Conductor cross-sectional area must be greater than zero.');
  const rho = m.rho20 * (1 + m.alpha * (conductorTempC - 20));
  return rho / csaMm2;
}

/**
 * @typedef {Object} VoltageDropInput
 * @property {number} currentA          Design current.
 * @property {number} lengthM           One-way route length.
 * @property {number} csaMm2
 * @property {'copper'|'aluminium'} material
 * @property {1|3} phases
 * @property {number} voltage           Nominal voltage (L-N for 1-ph, L-L for 3-ph).
 * @property {number} powerFactor
 * @property {'pvc'|'xlpe'} [insulation='pvc'] Sets the assumed conductor temperature.
 * @property {number} [conductorTempC]  Overrides the insulation-derived temperature.
 * @property {number} [reactancePerMetre] Ω/m, defaults to DEFAULT_REACTANCE_OHM_PER_M.
 * @property {number} [parallelRuns=1]  Number of cables per phase in parallel.
 */

/**
 * @typedef {Object} VoltageDropResult
 * @property {number} resistancePerMetre  Ω/m for one conductor of the chosen size.
 * @property {number} reactancePerMetre   Ω/m.
 * @property {number} conductorTempC
 * @property {number} dropVolts
 * @property {number} dropPercent
 * @property {number} voltageAtLoad
 * @property {number} powerLossW          I²R loss in the run.
 * @property {string} formula             The formula actually used, as text.
 */

/**
 * @param {VoltageDropInput} input
 * @returns {VoltageDropResult}
 */
export function calculateVoltageDrop(input) {
  const {
    currentA, lengthM, csaMm2, material, phases, voltage, powerFactor,
    insulation = 'pvc', reactancePerMetre = DEFAULT_REACTANCE_OHM_PER_M,
    parallelRuns = 1,
  } = input;

  if (!(voltage > 0)) throw new Error('Voltage must be greater than zero.');
  if (lengthM < 0) throw new Error('Cable length cannot be negative.');
  if (!(parallelRuns >= 1)) throw new Error('Parallel runs must be at least 1.');

  const conductorTempC = input.conductorTempC
    ?? (INSULATION_TYPES[insulation]?.conductorTempC ?? 70);

  // Paralleling n identical cables divides both R and X by n.
  const rPerM = resistancePerMetre(csaMm2, material, conductorTempC) / parallelRuns;
  const xPerM = reactancePerMetre / parallelRuns;

  const cosPhi = powerFactor;
  const sPhi = sinPhi(powerFactor);
  const impedanceTerm = rPerM * cosPhi + xPerM * sPhi;

  const multiplier = phases === 3 ? Math.sqrt(3) : 2;
  const dropVolts = multiplier * currentA * lengthM * impedanceTerm;

  // Conductor loss: n_conductors × I² × R per conductor.
  const conductorsCarryingCurrent = phases === 3 ? 3 : 2;
  const powerLossW = conductorsCarryingCurrent * currentA * currentA * rPerM * lengthM;

  return {
    resistancePerMetre: rPerM,
    reactancePerMetre: xPerM,
    conductorTempC,
    dropVolts,
    dropPercent: (dropVolts / voltage) * 100,
    voltageAtLoad: voltage - dropVolts,
    powerLossW,
    formula: phases === 3
      ? 'ΔV = √3 × I × L × (R·cosφ + X·sinφ)'
      : 'ΔV = 2 × I × L × (R·cosφ + X·sinφ)',
  };
}

/**
 * Smallest standard size from `sizes` that keeps the drop within `limitPercent`.
 * @param {VoltageDropInput} input The csaMm2 field is ignored.
 * @param {number} limitPercent
 * @param {number[]} sizes Candidate cross-sectional areas, ascending.
 * @returns {{ csaMm2: number|null, result: VoltageDropResult|null }}
 */
export function smallestSizeForDropLimit(input, limitPercent, sizes) {
  for (const csaMm2 of sizes) {
    const result = calculateVoltageDrop({ ...input, csaMm2 });
    if (result.dropPercent <= limitPercent) return { csaMm2, result };
  }
  return { csaMm2: null, result: null };
}
