/**
 * Inverter sizing.
 *
 * There is no single "correct" inverter for a given array. The output is a
 * defensible RANGE, bounded by the DC/AC ratio the designer is willing to
 * accept, together with a hard floor when the inverter must also carry the
 * site load (hybrid or off-grid). Final selection is a datasheet exercise —
 * see `INVERTER_CAVEATS`.
 *
 * @module engine/inverter
 */

import { checkNumber, hasErrors, warn } from './validation.js';
import { INVERTER_RATINGS_KW } from './constants.js';

export const INVERTER_CAVEATS = [
  'MPPT window: the string voltage at the coldest expected ambient must stay below the inverter\'s maximum DC input voltage, and at the hottest cell temperature must stay above the MPPT minimum. This is the constraint that most often forces a different inverter.',
  'Maximum DC input current and short-circuit current per MPPT limit how many strings can be paralleled onto each tracker.',
  'Maximum DC input power and the manufacturer\'s permitted DC/AC ratio are stated per model — some inverters allow 1.5, others 1.1.',
  'Grid code and utility requirements: anti-islanding, reactive power capability, LVRT, and the export limit granted under net metering.',
  'Phase configuration must match the site supply. A three-phase load on a single-phase inverter creates an unbalanced supply.',
  'Hybrid and off-grid inverters must additionally handle the surge/inrush of motor loads, typically 2–3× the running current for a few seconds.',
  'Ambient temperature derating: many inverters reduce output above 45–50 °C, which is routine in Pakistani summer plant rooms.',
];

/**
 * @typedef {Object} InverterInput
 * @property {number} pvCapacityKWp        Installed DC capacity.
 * @property {number} [maxDaytimeLoadKW=0] AC load the inverter must supply (hybrid/off-grid).
 * @property {1|3} phases
 * @property {number} [dcAcRatioTarget=1.2]
 * @property {number} [dcAcRatioMin=1.0]
 * @property {number} [dcAcRatioMax=1.3]
 * @property {'gridTied'|'hybrid'|'offGrid'} [systemType='gridTied']
 * @property {number} [surgeFactor=1.25]   Applied to the load floor for hybrid/off-grid.
 */

/**
 * @typedef {Object} InverterResult
 * @property {number} pvCapacityKWp
 * @property {number} minInverterKW        Upper DC/AC ratio bound.
 * @property {number} maxInverterKW        Lower DC/AC ratio bound.
 * @property {number} targetInverterKW     At the target DC/AC ratio.
 * @property {number} loadFloorKW          Minimum set by the AC load, 0 for grid-tied.
 * @property {number} recommendedKW        Nearest standard rating that satisfies the constraints.
 * @property {number[]} standardOptionsKW  Standard ratings inside the acceptable band.
 * @property {number} actualDcAcRatio      With the recommended rating.
 * @property {1|3} phases
 * @property {string} rangeLabel           e.g. "40–47 kW".
 * @property {import('./validation.js').Issue[]} issues
 * @property {string[]} assumptions
 * @property {string[]} caveats
 */

/**
 * Nearest standard rating at or above a value.
 * @param {number} kW
 * @returns {number|null}
 */
export const nextStandardRating = (kW) => INVERTER_RATINGS_KW.find((r) => r >= kW) ?? null;

/**
 * @param {InverterInput} input
 * @returns {InverterResult}
 */
export function calculateInverter(input) {
  /** @type {import('./validation.js').Issue[]} */
  const issues = [];
  const pvCapacityKWp = checkNumber(issues, 'pvCapacityKWp', input.pvCapacityKWp, {
    label: 'PV capacity', exclusiveMin: 0,
  });
  const maxDaytimeLoadKW = checkNumber(issues, 'maxDaytimeLoadKW', input.maxDaytimeLoadKW ?? 0, {
    label: 'Maximum daytime load', min: 0,
  });
  const dcAcRatioTarget = checkNumber(issues, 'dcAcRatioTarget', input.dcAcRatioTarget ?? 1.2, {
    label: 'DC/AC ratio', min: 0.8, max: 2,
  });
  const dcAcRatioMin = checkNumber(issues, 'dcAcRatioMin', input.dcAcRatioMin ?? 1.0, {
    label: 'Minimum DC/AC ratio', min: 0.8, max: 2,
  });
  const dcAcRatioMax = checkNumber(issues, 'dcAcRatioMax', input.dcAcRatioMax ?? 1.3, {
    label: 'Maximum DC/AC ratio', min: 0.8, max: 2,
  });
  const surgeFactor = checkNumber(issues, 'surgeFactor', input.surgeFactor ?? 1.25, {
    label: 'Surge allowance', min: 1, max: 3,
  });

  if (hasErrors(issues)) return emptyInverterResult(issues);
  if (dcAcRatioMin > dcAcRatioMax) {
    issues.push(warn('dcAcRatioMin', 'Minimum DC/AC ratio is above the maximum — the range has been swapped.'));
  }

  const lo = Math.min(dcAcRatioMin, dcAcRatioMax);
  const hi = Math.max(dcAcRatioMin, dcAcRatioMax);
  const phases = input.phases === 3 ? 3 : 1;
  const systemType = input.systemType ?? 'gridTied';

  // A higher DC/AC ratio means a smaller inverter for the same array.
  const minInverterKW = pvCapacityKWp / hi;
  const maxInverterKW = pvCapacityKWp / lo;
  const targetInverterKW = pvCapacityKWp / dcAcRatioTarget;

  // Hybrid and off-grid inverters must also carry the load, with headroom for
  // motor inrush.
  const loadFloorKW = systemType === 'gridTied' ? 0 : maxDaytimeLoadKW * surgeFactor;

  // The acceptable band: bounded by the DC/AC ratio, and never below the load
  // floor imposed by a hybrid or off-grid system.
  const bandLowerKW = Math.max(minInverterKW, loadFloorKW);
  const bandUpperKW = Math.max(maxInverterKW, loadFloorKW);

  let standardOptionsKW = INVERTER_RATINGS_KW.filter(
    (r) => r >= bandLowerKW - 1e-9 && r <= bandUpperKW + 1e-9,
  );
  if (standardOptionsKW.length === 0) {
    // No catalogue rating lands in the band — step up to the next one above it
    // rather than silently recommending something under-rated.
    const stepUp = nextStandardRating(bandLowerKW);
    standardOptionsKW = stepUp === null ? [] : [stepUp];
    issues.push(warn('pvCapacityKWp', `No standard inverter rating falls inside the ${lo}–${hi} DC/AC band for a ${pvCapacityKWp.toFixed(1)} kWp array${loadFloorKW > 0 ? ` with a ${loadFloorKW.toFixed(1)} kW load floor` : ''}. The next size up is shown instead — consider multiple inverters or a different ratio.`));
  }

  // Prefer the smallest option at or above the target; if the target sits above
  // every option in the band, take the largest one in the band.
  const desiredKW = Math.max(targetInverterKW, loadFloorKW);
  const recommendedKW = standardOptionsKW.find((r) => r >= desiredKW - 1e-9)
    ?? standardOptionsKW.at(-1)
    ?? nextStandardRating(bandLowerKW)
    ?? INVERTER_RATINGS_KW.at(-1);
  if (loadFloorKW > maxInverterKW) {
    issues.push(warn('maxDaytimeLoadKW', 'The AC load requirement exceeds what the DC/AC ratio band allows for this array. The inverter is being sized by the load, not by the PV capacity — verify this is intended.'));
  }
  if (phases === 3 && recommendedKW < 5) {
    issues.push(warn('phases', 'Three-phase inverters below about 5 kW are uncommon. Check availability before specifying.'));
  }

  const actualDcAcRatio = recommendedKW > 0 ? pvCapacityKWp / recommendedKW : NaN;
  if (actualDcAcRatio > hi) {
    issues.push(warn('recommendedKW', `The nearest standard rating gives a DC/AC ratio of ${actualDcAcRatio.toFixed(2)}, above the stated maximum of ${hi}. Expect clipping at peak irradiance.`));
  }

  return {
    pvCapacityKWp,
    minInverterKW,
    maxInverterKW,
    targetInverterKW,
    loadFloorKW,
    recommendedKW,
    standardOptionsKW,
    actualDcAcRatio,
    phases,
    rangeLabel: `${Math.round(bandLowerKW)}–${Math.round(Math.max(bandUpperKW, recommendedKW))} kW`,
    issues,
    assumptions: [
      `Array: ${pvCapacityKWp.toFixed(2)} kWp DC on a ${phases === 3 ? 'three-phase' : 'single-phase'} ${systemType === 'gridTied' ? 'grid-tied' : systemType === 'hybrid' ? 'hybrid' : 'off-grid'} system.`,
      `Inverter a.c. rating = PV capacity ÷ DC/AC ratio. At the acceptable band ${lo}–${hi} this gives ${minInverterKW.toFixed(1)}–${maxInverterKW.toFixed(1)} kW.`,
      `At the target ratio of ${dcAcRatioTarget}, the a.c. rating is ${targetInverterKW.toFixed(1)} kW.`,
      systemType === 'gridTied'
        ? 'Grid-tied: the inverter does not have to carry the site load, so no load floor is applied.'
        : `${systemType === 'hybrid' ? 'Hybrid' : 'Off-grid'}: the inverter must also carry ${maxDaytimeLoadKW} kW of load with a ${surgeFactor}× allowance for motor inrush, giving a floor of ${loadFloorKW.toFixed(1)} kW.`,
      `Nearest standard rating that satisfies both constraints: ${recommendedKW} kW, giving an actual DC/AC ratio of ${actualDcAcRatio.toFixed(2)}.`,
      'Deliberate DC oversizing (ratio above 1.0) is normal practice — it raises annual yield by keeping the inverter closer to full output for more of the day, at the cost of clipping a small amount of energy at peak irradiance.',
      'This is a capacity range, not a model selection. The final inverter must be chosen against its own datasheet.',
    ],
    caveats: INVERTER_CAVEATS,
  };
}

/**
 * @param {import('./validation.js').Issue[]} issues
 * @returns {InverterResult}
 */
function emptyInverterResult(issues) {
  return {
    pvCapacityKWp: 0,
    minInverterKW: 0,
    maxInverterKW: 0,
    targetInverterKW: 0,
    loadFloorKW: 0,
    recommendedKW: 0,
    standardOptionsKW: [],
    actualDcAcRatio: NaN,
    phases: 3,
    rangeLabel: '—',
    issues,
    assumptions: [],
    caveats: INVERTER_CAVEATS,
  };
}
