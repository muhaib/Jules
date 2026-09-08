/**
 * Electrical load calculation.
 *
 * Four distinct quantities are kept separate throughout, because conflating
 * them is the most common source of oversized (and expensive) designs:
 *
 *   Connected load   Σ (qty × rated power). Everything installed, all on.
 *   Maximum demand   Σ (qty × rated power × diversity factor). What the
 *                    supply and main cable are sized for.
 *   Running load     The 24-hour average power, i.e. daily energy ÷ 24 h.
 *                    Useful for generator loading and self-consumption studies.
 *   Daily energy     Σ (qty × rated power × diversity × operating hours).
 *
 * @module engine/load
 */

import { toKW, sinPhi } from './units.js';
import { checkNumber, checkPowerFactor, checkFactor, checkVoltage, hasErrors } from './validation.js';
import { EQUIPMENT_CATEGORIES } from './constants.js';

/**
 * @typedef {Object} LoadItem
 * @property {string} id
 * @property {string} name
 * @property {string} category      Key from EQUIPMENT_CATEGORIES.
 * @property {number} quantity
 * @property {number} ratedPower    Per unit, in `unit`.
 * @property {'W'|'kW'|'HP'|'VA'|'kVA'} unit
 * @property {1|3} phase            Single phase or three phase.
 * @property {number} powerFactor   0 < pf <= 1
 * @property {number} diversityFactor 0 < df <= 1
 * @property {number} hoursPerDay   0..24
 */

/**
 * @typedef {Object} LoadItemResult
 * @property {LoadItem} item
 * @property {number} connectedKW
 * @property {number} demandKW       Connected × diversity.
 * @property {number} connectedKVA
 * @property {number} demandKVA
 * @property {number} dailyEnergyKWh
 * @property {number} currentA       Current drawn by this item alone.
 */

/**
 * Build a load item with sensible defaults for its category.
 * @param {Partial<LoadItem>} [partial]
 * @returns {LoadItem}
 */
export function createLoadItem(partial = {}) {
  const category = partial.category || 'other';
  const preset = EQUIPMENT_CATEGORIES.find((c) => c.key === category) || EQUIPMENT_CATEGORIES.at(-1);
  return {
    id: partial.id || `load_${Math.random().toString(36).slice(2, 10)}`,
    name: partial.name ?? '',
    category,
    quantity: partial.quantity ?? 1,
    ratedPower: partial.ratedPower ?? 0,
    unit: partial.unit ?? 'kW',
    phase: partial.phase ?? 1,
    powerFactor: partial.powerFactor ?? preset.defaultPf,
    diversityFactor: partial.diversityFactor ?? preset.defaultDiversity,
    hoursPerDay: partial.hoursPerDay ?? preset.defaultHours,
  };
}

/**
 * Validate a single load item.
 * @param {LoadItem} item
 * @param {number} index Row index, used to build field keys.
 * @returns {import('./validation.js').Issue[]}
 */
export function validateLoadItem(item, index) {
  /** @type {import('./validation.js').Issue[]} */
  const issues = [];
  const f = (name) => `loads[${index}].${name}`;
  checkNumber(issues, f('quantity'), item.quantity, { label: 'Quantity', exclusiveMin: 0, integer: true });
  checkNumber(issues, f('ratedPower'), item.ratedPower, { label: 'Rated power', exclusiveMin: 0 });
  checkPowerFactor(issues, f('powerFactor'), item.powerFactor);
  checkFactor(issues, f('diversityFactor'), item.diversityFactor);
  checkNumber(issues, f('hoursPerDay'), item.hoursPerDay, { label: 'Operating hours per day', min: 0, max: 24 });
  if (item.phase !== 1 && item.phase !== 3) {
    issues.push({ field: f('phase'), level: 'error', message: 'Phase must be single (1) or three (3).' });
  }
  return issues;
}

/**
 * Line current for a given real power.
 *
 *   Single phase:  I = P / (V × PF)                 V = line-to-neutral
 *   Three phase:   I = P / (√3 × V × PF)            V = line-to-line
 *
 * @param {number} powerKW Real power, kW.
 * @param {number} voltage Volts (L-N for 1-ph, L-L for 3-ph).
 * @param {number} powerFactor
 * @param {1|3} phases
 * @returns {number} Amperes. Returns 0 when power is 0.
 */
export function calculateCurrent(powerKW, voltage, powerFactor, phases) {
  if (!(voltage > 0)) throw new Error('Voltage must be greater than zero to calculate current.');
  if (!(powerFactor > 0 && powerFactor <= 1)) throw new Error('Power factor must be within (0, 1].');
  const watts = powerKW * 1000;
  if (watts === 0) return 0;
  return phases === 3
    ? watts / (Math.sqrt(3) * voltage * powerFactor)
    : watts / (voltage * powerFactor);
}

/**
 * Apparent power from real power and power factor.
 * @param {number} kW
 * @param {number} powerFactor
 * @returns {number} kVA
 */
export const kvaFromKw = (kW, powerFactor) => (powerFactor > 0 ? kW / powerFactor : NaN);

/**
 * Reactive power from real power and power factor.
 * @param {number} kW
 * @param {number} powerFactor
 * @returns {number} kVAr
 */
export const kvarFromKw = (kW, powerFactor) => kvaFromKw(kW, powerFactor) * sinPhi(powerFactor);

/**
 * @typedef {Object} LoadSchedule
 * @property {LoadItem[]} loads
 * @property {number} systemVoltage    L-L for a three-phase system, L-N for single phase.
 * @property {1|3} systemPhases
 * @property {number} [singlePhaseVoltage=230] L-N voltage used for single-phase items.
 * @property {number} [overallDiversity=1] An extra whole-installation diversity factor.
 * @property {number} [spareCapacityPercent=0] Future-growth allowance added to the demand.
 */

/**
 * @typedef {Object} LoadResult
 * @property {LoadItemResult[]} items
 * @property {number} connectedLoadKW
 * @property {number} connectedLoadKVA
 * @property {number} maximumDemandKW      After per-item diversity, overall diversity and spare allowance.
 * @property {number} maximumDemandKVA
 * @property {number} maximumDemandKVAr
 * @property {number} runningLoadKW        24-hour average = daily energy / 24.
 * @property {number} dailyEnergyKWh
 * @property {number} monthlyEnergyKWh
 * @property {number} annualEnergyKWh
 * @property {number} overallPowerFactor   Demand kW / demand kVA.
 * @property {number} demandCurrentA       Whole-installation current at the system voltage.
 * @property {number} connectedCurrentA
 * @property {number} singlePhaseDemandKW
 * @property {number} threePhaseDemandKW
 * @property {import('./validation.js').Issue[]} issues
 * @property {string[]} assumptions
 */

/**
 * Calculate a complete load schedule.
 * @param {LoadSchedule} schedule
 * @returns {LoadResult}
 */
export function calculateLoadSchedule(schedule) {
  /** @type {import('./validation.js').Issue[]} */
  const issues = [];
  const loads = schedule.loads ?? [];

  const voltage = checkVoltage(issues, 'systemVoltage', schedule.systemVoltage);
  const phases = schedule.systemPhases === 3 ? 3 : 1;
  const singlePhaseVoltage = schedule.singlePhaseVoltage
    ?? (phases === 3 ? schedule.systemVoltage / Math.sqrt(3) : schedule.systemVoltage);
  const overallDiversity = checkFactor(
    issues, 'overallDiversity', schedule.overallDiversity ?? 1, 'Overall diversity factor',
  );
  const spare = checkNumber(issues, 'spareCapacityPercent', schedule.spareCapacityPercent ?? 0, {
    label: 'Spare capacity', min: 0, max: 200,
  });

  loads.forEach((item, i) => issues.push(...validateLoadItem(item, i)));

  const empty = emptyResult(issues);
  if (loads.length === 0) {
    issues.push({ field: 'loads', level: 'warning', message: 'No loads have been added yet.' });
    return empty;
  }
  if (hasErrors(issues)) return empty;

  /** @type {LoadItemResult[]} */
  const items = [];
  let connectedKW = 0;
  let connectedKVA = 0;
  let rawDemandKW = 0;
  let rawDemandKVA = 0;
  let dailyEnergyKWh = 0;
  let singlePhaseDemandKW = 0;
  let threePhaseDemandKW = 0;

  for (const item of loads) {
    const perUnitKW = toKW(Number(item.ratedPower), item.unit, Number(item.powerFactor));
    const itemConnectedKW = perUnitKW * Number(item.quantity);
    const itemDemandKW = itemConnectedKW * Number(item.diversityFactor);
    const itemConnectedKVA = kvaFromKw(itemConnectedKW, Number(item.powerFactor));
    const itemDemandKVA = kvaFromKw(itemDemandKW, Number(item.powerFactor));
    const itemVoltage = item.phase === 3 ? schedule.systemVoltage : singlePhaseVoltage;
    const itemEnergy = itemDemandKW * Number(item.hoursPerDay);

    connectedKW += itemConnectedKW;
    connectedKVA += itemConnectedKVA;
    rawDemandKW += itemDemandKW;
    rawDemandKVA += itemDemandKVA;
    dailyEnergyKWh += itemEnergy;
    if (item.phase === 3) threePhaseDemandKW += itemDemandKW;
    else singlePhaseDemandKW += itemDemandKW;

    items.push({
      item,
      connectedKW: itemConnectedKW,
      demandKW: itemDemandKW,
      connectedKVA: itemConnectedKVA,
      demandKVA: itemDemandKVA,
      dailyEnergyKWh: itemEnergy,
      currentA: calculateCurrent(itemDemandKW, itemVoltage, Number(item.powerFactor), item.phase),
    });
  }

  // Overall diversity and the future-growth allowance apply to the whole
  // installation, after the per-item diversity factors.
  const growth = 1 + spare / 100;
  const demandScale = overallDiversity * growth;
  const maximumDemandKW = rawDemandKW * demandScale;
  const maximumDemandKVA = rawDemandKVA * demandScale;

  // Aggregate power factor is the ratio of the summed real power to the summed
  // apparent power — never the arithmetic mean of the individual factors.
  const overallPowerFactor = maximumDemandKVA > 0 ? maximumDemandKW / maximumDemandKVA : NaN;
  const connectedPowerFactor = connectedKVA > 0 ? connectedKW / connectedKVA : NaN;

  const demandCurrentA = maximumDemandKW > 0
    ? calculateCurrent(maximumDemandKW, schedule.systemVoltage, overallPowerFactor, phases)
    : 0;
  const connectedCurrentA = connectedKW > 0
    ? calculateCurrent(connectedKW, schedule.systemVoltage, connectedPowerFactor, phases)
    : 0;

  return {
    items,
    connectedLoadKW: connectedKW,
    connectedLoadKVA: connectedKVA,
    maximumDemandKW,
    maximumDemandKVA,
    maximumDemandKVAr: maximumDemandKVA * sinPhi(overallPowerFactor),
    runningLoadKW: dailyEnergyKWh / 24,
    dailyEnergyKWh,
    monthlyEnergyKWh: dailyEnergyKWh * 30.44,
    annualEnergyKWh: dailyEnergyKWh * 365,
    overallPowerFactor,
    demandCurrentA,
    connectedCurrentA,
    singlePhaseDemandKW: singlePhaseDemandKW * demandScale,
    threePhaseDemandKW: threePhaseDemandKW * demandScale,
    issues,
    assumptions: buildAssumptions(schedule, {
      phases, voltage, singlePhaseVoltage, overallDiversity, spare, overallPowerFactor,
    }),
  };
}

/**
 * @param {import('./validation.js').Issue[]} issues
 * @returns {LoadResult}
 */
function emptyResult(issues) {
  return {
    items: [],
    connectedLoadKW: 0,
    connectedLoadKVA: 0,
    maximumDemandKW: 0,
    maximumDemandKVA: 0,
    maximumDemandKVAr: 0,
    runningLoadKW: 0,
    dailyEnergyKWh: 0,
    monthlyEnergyKWh: 0,
    annualEnergyKWh: 0,
    overallPowerFactor: NaN,
    demandCurrentA: 0,
    connectedCurrentA: 0,
    singlePhaseDemandKW: 0,
    threePhaseDemandKW: 0,
    issues,
    assumptions: [],
  };
}

/**
 * @param {LoadSchedule} schedule
 * @param {{phases:number, voltage:number, singlePhaseVoltage:number, overallDiversity:number, spare:number, overallPowerFactor:number}} ctx
 * @returns {string[]}
 */
function buildAssumptions(schedule, ctx) {
  const list = [
    `System: ${schedule.systemVoltage} V, ${ctx.phases === 3 ? 'three phase' : 'single phase'}.`,
    ctx.phases === 3
      ? `Three-phase current from I = P / (√3 × V_LL × PF); single-phase items referred to ${ctx.singlePhaseVoltage.toFixed(0)} V line-to-neutral.`
      : 'Single-phase current from I = P / (V × PF).',
    'Connected load is the sum of all rated powers with no diversity applied.',
    'Maximum demand applies each item\'s own diversity factor, then the overall diversity factor.',
    'Running load is the 24-hour average power, i.e. daily energy ÷ 24 h — not a peak value.',
    'Overall power factor is total kW ÷ total kVA, not the average of the individual power factors.',
    'Daily energy assumes each load runs at its diversified power for its stated operating hours.',
    'Monthly energy uses 30.44 days; annual energy uses 365 days.',
  ];
  if (ctx.overallDiversity !== 1) {
    list.push(`An overall installation diversity factor of ${ctx.overallDiversity} is applied to the maximum demand.`);
  }
  if (ctx.spare > 0) {
    list.push(`A ${ctx.spare}% spare-capacity allowance for future load is included in the maximum demand.`);
  }
  if (ctx.phases === 3) {
    list.push('Single-phase loads are assumed to be balanced across the three phases. Verify the actual phase allocation on the distribution board schedule.');
  }
  list.push('Motor inrush, harmonic content and non-linear load effects are not modelled.');
  return list;
}
