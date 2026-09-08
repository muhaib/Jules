/**
 * Public surface of the calculation engine.
 *
 * The engine has no DOM dependency and no knowledge of the UI: every function
 * here takes plain data in and returns plain data out, so it can be exercised
 * directly from `node --test`.
 *
 * @module engine
 */

export * from './units.js';
export * from './validation.js';
export * from './constants.js';
export * from './load.js';
export * from './voltagedrop.js';
export * from './cable.js';
export * from './solar.js';
export * from './panels.js';
export * from './inverter.js';
export * from './boq.js';

import { calculateLoadSchedule } from './load.js';
import { calculateCable } from './cable.js';
import { calculateSolar } from './solar.js';
import { calculatePanels } from './panels.js';
import { calculateInverter } from './inverter.js';
import { generateBoq } from './boq.js';
import { ENGINEERING_DISCLAIMER } from './constants.js';

/**
 * @typedef {Object} ProjectInputs
 * @property {import('./load.js').LoadSchedule} load
 * @property {Partial<import('./cable.js').CableInput>} cable
 * @property {Partial<import('./solar.js').SolarInput>} solar
 * @property {Partial<import('./panels.js').PanelInput>} panels
 * @property {Partial<import('./inverter.js').InverterInput>} inverter
 * @property {Partial<import('./boq.js').BoqInput>} boq
 */

/**
 * Run every calculator in dependency order, feeding each stage's output into
 * the next. Nothing is cached and nothing is hard-coded: change any input and
 * the whole chain re-derives.
 *
 * @param {ProjectInputs} inputs
 * @returns {{
 *   load: import('./load.js').LoadResult,
 *   cable: import('./cable.js').CableResult,
 *   solar: import('./solar.js').SolarResult,
 *   panels: import('./panels.js').PanelResult,
 *   inverter: import('./inverter.js').InverterResult,
 *   boq: ReturnType<typeof generateBoq>,
 *   issues: import('./validation.js').Issue[],
 *   assumptions: string[],
 *   disclaimer: string
 * }}
 */
export function calculateProject(inputs) {
  const load = calculateLoadSchedule(inputs.load);

  // The solar stage inherits the load result unless the user overrode it.
  const solarInput = {
    mode: 'instantaneous',
    targetPercent: 100,
    systemLossPercent: 14,
    inverterEfficiency: 0.97,
    ...inputs.solar,
  };
  if (solarInput.mode === 'instantaneous' && solarInput.daytimeLoadKW === undefined) {
    solarInput.daytimeLoadKW = load.maximumDemandKW;
  }
  if (solarInput.mode === 'dailyEnergy' && solarInput.dailyConsumptionKWh === undefined) {
    solarInput.dailyConsumptionKWh = load.dailyEnergyKWh;
  }
  const solar = calculateSolar(solarInput);

  const panels = calculatePanels({
    panelWattage: 600,
    panelWidthMm: 2278,
    panelHeightMm: 1134,
    mountingType: 'flatTilted',
    cityKey: solarInput.cityKey,
    ...inputs.panels,
    requiredPvKWp: inputs.panels?.requiredPvKWp ?? solar.requiredPvKWp,
  });

  const inverter = calculateInverter({
    phases: inputs.load?.systemPhases === 3 ? 3 : 1,
    systemType: 'gridTied',
    maxDaytimeLoadKW: load.maximumDemandKW,
    ...inputs.inverter,
    pvCapacityKWp: inputs.inverter?.pvCapacityKWp ?? panels.installedCapacityKWp,
  });

  // The cable stage defaults to sizing the main incomer for the load.
  const cable = calculateCable({
    voltage: inputs.load?.systemVoltage,
    phases: inputs.load?.systemPhases === 3 ? 3 : 1,
    powerFactor: Number.isFinite(load.overallPowerFactor) ? load.overallPowerFactor : 0.9,
    material: 'copper',
    insulation: 'pvc',
    cores: inputs.load?.systemPhases === 3 ? 4 : 2,
    installationMethod: 'C',
    lengthM: 30,
    ambientC: 40,
    groupedCircuits: 1,
    voltageDropLimitPercent: 3,
    ...inputs.cable,
    loadKW: inputs.cable?.currentA !== undefined && inputs.cable?.currentA !== ''
      ? undefined
      : (inputs.cable?.loadKW ?? load.maximumDemandKW),
  });

  const boq = generateBoq({
    panelWattage: panels.panelCount > 0
      ? Math.round((panels.installedCapacityKWp * 1000) / panels.panelCount)
      : 0,
    phases: inputs.load?.systemPhases === 3 ? 3 : 1,
    acCableSizeMm2: cable.recommendedSizeMm2 ?? undefined,
    ...inputs.boq,
    panelCount: inputs.boq?.panelCount ?? panels.panelCount,
    installedCapacityKWp: inputs.boq?.installedCapacityKWp ?? panels.installedCapacityKWp,
    inverterKW: inputs.boq?.inverterKW ?? inverter.recommendedKW,
  });

  const issues = [
    ...tag(load.issues, 'load'),
    ...tag(solar.issues, 'solar'),
    ...tag(panels.issues, 'panels'),
    ...tag(inverter.issues, 'inverter'),
    ...tag(cable.issues, 'cable'),
  ];

  return {
    load,
    cable,
    solar,
    panels,
    inverter,
    boq,
    issues,
    assumptions: [
      ...load.assumptions,
      ...solar.assumptions,
      ...panels.assumptions,
      ...inverter.assumptions,
      ...cable.assumptions,
    ],
    disclaimer: ENGINEERING_DISCLAIMER,
  };
}

/**
 * Prefix issue field keys with their stage so the UI can route them.
 * @param {import('./validation.js').Issue[]} issues
 * @param {string} stage
 * @returns {import('./validation.js').Issue[]}
 */
const tag = (issues, stage) => issues.map((i) => ({ ...i, stage, field: `${stage}.${i.field}` }));
