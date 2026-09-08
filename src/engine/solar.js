/**
 * Solar PV sizing.
 *
 * Two sizing modes, because "how big a system do I need?" has two different
 * engineering answers depending on what the client actually wants:
 *
 *   Mode A — Instantaneous daytime load
 *     Size the array so that, at peak irradiance, it can supply a stated
 *     fraction of the daytime load directly. This answers "will the meter stop
 *     spinning at midday?" It does NOT mean the load is covered all day: PV
 *     output follows a bell curve and is a fraction of peak in the morning,
 *     late afternoon, and under cloud.
 *
 *   Mode B — Daily energy
 *     Size the array so that the energy it produces over an average day covers
 *     a stated fraction of the daily consumption. This answers "how much of my
 *     monthly units will solar replace?" It says nothing about whether output
 *     matches load at any given instant.
 *
 * Core relation:
 *   PV capacity (kWp) = Required energy (kWh/day) / (Peak sun hours × System efficiency)
 *   System efficiency = (1 − DC-side losses) × Inverter efficiency
 *
 * @module engine/solar
 */

import { checkNumber, checkFactor, hasErrors, warn } from './validation.js';
import { PAKISTAN_CITIES, DAYS_PER_MONTH, DEFAULT_TARIFF_PKR_PER_KWH } from './constants.js';

/**
 * @typedef {Object} SolarInput
 * @property {'instantaneous'|'dailyEnergy'} mode
 * @property {number} [daytimeLoadKW]        Mode A: the load to be supported at peak sun.
 * @property {number} [dailyConsumptionKWh]  Mode B: average daily energy use.
 * @property {string} [cityKey]              Key from PAKISTAN_CITIES.
 * @property {number} peakSunHours           kWh/m²/day. Defaults come from the city.
 * @property {number} targetPercent          Percentage of the load/energy to be met by solar (0–100+).
 * @property {number} systemLossPercent       DC-side losses: soiling, temperature, mismatch, wiring, shading.
 * @property {number} inverterEfficiency      0 < η ≤ 1.
 * @property {number} [futureLoadKW=0]        Extra allowance, Mode A.
 * @property {number} [futureEnergyKWh=0]     Extra allowance, Mode B.
 * @property {number} [tariffPkrPerKwh]       For the savings estimate.
 * @property {number} [exportFraction=0]      Share of generation exported rather than self-consumed.
 * @property {number} [exportTariffPkrPerKwh] Buy-back rate for the exported share.
 */

/**
 * @typedef {Object} SolarResult
 * @property {'instantaneous'|'dailyEnergy'} mode
 * @property {number} peakSunHours
 * @property {number} systemEfficiency
 * @property {number} dcLossFactor
 * @property {number} inverterEfficiency
 * @property {number} targetFraction
 * @property {number} requiredPvKWp
 * @property {number} [targetAcPowerKW]      Mode A only.
 * @property {number} [requiredEnergyKWh]    Mode B only.
 * @property {number} dailyGenerationKWh
 * @property {number} monthlyGenerationKWh
 * @property {number} annualGenerationKWh
 * @property {number} specificYieldKWhPerKWpYear
 * @property {number} monthlySavingsPkr
 * @property {number} annualSavingsPkr
 * @property {import('./validation.js').Issue[]} issues
 * @property {string[]} assumptions
 * @property {string[]} caveats
 */

export const SOLAR_CAVEATS = [
  'Peak sun hours are an annual average. Output in December is typically 30–40 % below the annual mean in Pakistan, and monsoon cloud cover reduces July–August yield.',
  'Module output falls with cell temperature. At 55–65 °C cell temperature — routine on a Pakistani rooftop in summer — a module delivers noticeably less than its STC rating; this is part of the DC loss allowance, not an extra.',
  'Shading from parapets, water tanks, adjacent buildings and cable trays is site-specific and is not modelled here. A shading study is required.',
  'Degradation reduces output by roughly 0.4–0.6 % per year; year-25 output is typically 80–85 % of year one.',
  'Grid-tied output is limited by the grid being present. Net-metering approval, allowed export capacity and the utility\'s sanctioned load all constrain the installed size.',
];

/**
 * Resolve the peak sun hours to use: explicit value wins, otherwise the city.
 * @param {string|undefined} cityKey
 * @param {number|undefined} explicit
 * @returns {number}
 */
export function resolvePeakSunHours(cityKey, explicit) {
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const city = PAKISTAN_CITIES.find((c) => c.key === cityKey);
  return city ? city.peakSunHours : PAKISTAN_CITIES[0].peakSunHours;
}

/**
 * Overall DC-to-AC system efficiency.
 * @param {number} systemLossPercent DC-side losses as a percentage.
 * @param {number} inverterEfficiency 0..1
 * @returns {number}
 */
export const systemEfficiency = (systemLossPercent, inverterEfficiency) =>
  (1 - systemLossPercent / 100) * inverterEfficiency;

/**
 * Required PV array capacity for a daily energy target.
 *   kWp = energy / (PSH × η)
 * @param {number} requiredEnergyKWh
 * @param {number} peakSunHours
 * @param {number} efficiency
 * @returns {number} kWp
 */
export function pvCapacityForEnergy(requiredEnergyKWh, peakSunHours, efficiency) {
  if (!(peakSunHours > 0)) throw new Error('Peak sun hours must be greater than zero.');
  if (!(efficiency > 0)) throw new Error('System efficiency must be greater than zero.');
  return requiredEnergyKWh / (peakSunHours * efficiency);
}

/**
 * Required PV array capacity to supply an a.c. power at peak irradiance.
 *   kWp = P_ac / η
 * @param {number} targetAcKW
 * @param {number} efficiency
 * @returns {number} kWp
 */
export function pvCapacityForPower(targetAcKW, efficiency) {
  if (!(efficiency > 0)) throw new Error('System efficiency must be greater than zero.');
  return targetAcKW / efficiency;
}

/** Representative day-of-year for each month (Klein's recommended values). */
export const REPRESENTATIVE_DAYS = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];

/** Solar constant, W/m². */
export const SOLAR_CONSTANT_W_M2 = 1367;

/**
 * Monthly shape of the solar resource from orbital geometry alone.
 *
 * Extraterrestrial daily irradiation on a horizontal surface (Duffie &
 * Beckman):
 *
 *   H0 = (24/pi) x Gsc x [1 + 0.033 cos(360n/365)]
 *        x [cos(phi) cos(delta) sin(ws) + (pi ws / 180) sin(phi) sin(delta)]
 *
 * with declination delta = 23.45 sin(360 (284 + n) / 365) and sunset hour angle
 * ws = arccos(-tan(phi) tan(delta)).
 *
 * This is astronomy, not weather: it captures day length and sun height through
 * the year, and captures NOTHING about monsoon cloud, dust or haze. It is
 * returned normalised so the twelve values average 1.0, giving a seasonal shape
 * that can scale an annual-average figure.
 *
 * @param {number} latitudeDeg
 * @returns {number[]} Twelve factors averaging 1.0.
 */
export function monthlyGeometryFactors(latitudeDeg) {
  const phi = (latitudeDeg * Math.PI) / 180;
  const h0 = REPRESENTATIVE_DAYS.map((n) => {
    const deltaDeg = 23.45 * Math.sin((2 * Math.PI * (284 + n)) / 365);
    const delta = (deltaDeg * Math.PI) / 180;
    // Clamp for polar cases; irrelevant in Pakistan but keeps the maths safe.
    const cosWs = Math.min(1, Math.max(-1, -Math.tan(phi) * Math.tan(delta)));
    const ws = Math.acos(cosWs);
    const eccentricity = 1 + 0.033 * Math.cos((2 * Math.PI * n) / 365);
    return (24 / Math.PI) * SOLAR_CONSTANT_W_M2 * eccentricity
      * (Math.cos(phi) * Math.cos(delta) * Math.sin(ws)
        + ws * Math.sin(phi) * Math.sin(delta));
  });
  const mean = h0.reduce((a, b) => a + b, 0) / h0.length;
  return h0.map((v) => v / mean);
}

/**
 * Monthly generation estimate: the annual-average daily figure reshaped by the
 * geometry factors above.
 * @param {number} dailyGenerationKWh Annual-average daily generation.
 * @param {number} latitudeDeg
 * @returns {number[]} Twelve monthly totals, kWh.
 */
export function monthlyGenerationProfile(dailyGenerationKWh, latitudeDeg) {
  const daysInMonth = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return monthlyGeometryFactors(latitudeDeg)
    .map((f, i) => dailyGenerationKWh * f * daysInMonth[i]);
}

/**
 * @param {SolarInput} input
 * @returns {SolarResult}
 */
export function calculateSolar(input) {
  /** @type {import('./validation.js').Issue[]} */
  const issues = [];

  const peakSunHours = checkNumber(issues, 'peakSunHours', resolvePeakSunHours(input.cityKey, input.peakSunHours), {
    label: 'Peak sun hours', exclusiveMin: 0, max: 12,
  });
  const targetPercent = checkNumber(issues, 'targetPercent', input.targetPercent, {
    label: 'Solar target', exclusiveMin: 0, max: 200,
  });
  const systemLossPercent = checkNumber(issues, 'systemLossPercent', input.systemLossPercent, {
    label: 'System losses', min: 0, max: 60,
  });
  const inverterEfficiency = checkFactor(issues, 'inverterEfficiency', input.inverterEfficiency, 'Inverter efficiency');
  const tariff = checkNumber(issues, 'tariffPkrPerKwh', input.tariffPkrPerKwh ?? DEFAULT_TARIFF_PKR_PER_KWH, {
    label: 'Electricity tariff', min: 0,
  });
  const exportFraction = checkNumber(issues, 'exportFraction', input.exportFraction ?? 0, {
    label: 'Exported share', min: 0, max: 1,
  });
  const exportTariff = checkNumber(issues, 'exportTariffPkrPerKwh', input.exportTariffPkrPerKwh ?? tariff, {
    label: 'Export tariff', min: 0,
  });

  const mode = input.mode === 'dailyEnergy' ? 'dailyEnergy' : 'instantaneous';
  let daytimeLoadKW = NaN;
  let dailyConsumptionKWh = NaN;
  let futureLoadKW = 0;
  let futureEnergyKWh = 0;

  if (mode === 'instantaneous') {
    daytimeLoadKW = checkNumber(issues, 'daytimeLoadKW', input.daytimeLoadKW, {
      label: 'Daytime load', exclusiveMin: 0,
    });
    futureLoadKW = checkNumber(issues, 'futureLoadKW', input.futureLoadKW ?? 0, {
      label: 'Future load allowance', min: 0,
    });
  } else {
    dailyConsumptionKWh = checkNumber(issues, 'dailyConsumptionKWh', input.dailyConsumptionKWh, {
      label: 'Daily consumption', exclusiveMin: 0,
    });
    futureEnergyKWh = checkNumber(issues, 'futureEnergyKWh', input.futureEnergyKWh ?? 0, {
      label: 'Future energy allowance', min: 0,
    });
  }

  if (hasErrors(issues)) return emptySolarResult(mode, issues);

  const dcLossFactor = 1 - systemLossPercent / 100;
  const efficiency = systemEfficiency(systemLossPercent, inverterEfficiency);
  const targetFraction = targetPercent / 100;

  /** @type {number} */
  let requiredPvKWp;
  /** @type {number|undefined} */
  let targetAcPowerKW;
  /** @type {number|undefined} */
  let requiredEnergyKWh;

  if (mode === 'instantaneous') {
    targetAcPowerKW = (daytimeLoadKW + futureLoadKW) * targetFraction;
    requiredPvKWp = pvCapacityForPower(targetAcPowerKW, efficiency);
  } else {
    requiredEnergyKWh = (dailyConsumptionKWh + futureEnergyKWh) * targetFraction;
    requiredPvKWp = pvCapacityForEnergy(requiredEnergyKWh, peakSunHours, efficiency);
  }

  const dailyGenerationKWh = requiredPvKWp * peakSunHours * efficiency;
  const annualGenerationKWh = dailyGenerationKWh * 365;
  const selfConsumed = dailyGenerationKWh * (1 - exportFraction);
  const exported = dailyGenerationKWh * exportFraction;
  const dailySavingsPkr = selfConsumed * tariff + exported * exportTariff;

  if (mode === 'instantaneous') {
    issues.push(warn('mode', 'Mode A sizes the array for peak irradiance only. Actual output follows the sun through the day, so the load is fully covered by solar for only part of the daylight window.'));
  }
  if (targetPercent > 100) {
    issues.push(warn('targetPercent', 'A target above 100 % oversizes the array beyond the stated load. Confirm that export or storage can absorb the surplus.'));
  }

  return {
    mode,
    peakSunHours,
    systemEfficiency: efficiency,
    dcLossFactor,
    inverterEfficiency,
    targetFraction,
    requiredPvKWp,
    targetAcPowerKW,
    requiredEnergyKWh,
    dailyGenerationKWh,
    monthlyGenerationKWh: dailyGenerationKWh * DAYS_PER_MONTH,
    annualGenerationKWh,
    specificYieldKWhPerKWpYear: requiredPvKWp > 0 ? annualGenerationKWh / requiredPvKWp : NaN,
    monthlySavingsPkr: dailySavingsPkr * DAYS_PER_MONTH,
    annualSavingsPkr: dailySavingsPkr * 365,
    issues,
    assumptions: [
      `Sizing mode: ${mode === 'instantaneous' ? 'A — instantaneous daytime load at peak irradiance' : 'B — daily energy over an average day'}.`,
      `Peak sun hours: ${peakSunHours} kWh/m²/day (annual average${input.cityKey ? `, ${PAKISTAN_CITIES.find((c) => c.key === input.cityKey)?.name ?? input.cityKey}` : ''}). Indicative planning figure — replace with site data for a real design.`,
      `DC-side losses ${systemLossPercent}% → factor ${dcLossFactor.toFixed(3)}; inverter efficiency ${inverterEfficiency}; combined system efficiency ${(efficiency * 100).toFixed(1)}%.`,
      mode === 'instantaneous'
        ? `PV capacity = target a.c. power / system efficiency = ${targetAcPowerKW.toFixed(2)} kW / ${efficiency.toFixed(3)} = ${requiredPvKWp.toFixed(2)} kWp.`
        : `PV capacity = required energy / (peak sun hours × system efficiency) = ${requiredEnergyKWh.toFixed(1)} kWh / (${peakSunHours} × ${efficiency.toFixed(3)}) = ${requiredPvKWp.toFixed(2)} kWp.`,
      `Solar target set to ${targetPercent}% of the stated ${mode === 'instantaneous' ? 'daytime load' : 'daily consumption'}.`,
      `Generation = kWp × peak sun hours × system efficiency; monthly figures use ${DAYS_PER_MONTH} days.`,
      `Savings assume a tariff of PKR ${tariff}/kWh${exportFraction > 0 ? ` for self-consumption and PKR ${exportTariff}/kWh for the ${(exportFraction * 100).toFixed(0)}% exported` : ''}. Set your own slab rate — Pakistani tariffs are slab-based and change periodically.`,
      'No battery storage is modelled. Night-time and cloudy-period load is assumed to come from the grid or another source.',
    ],
    caveats: SOLAR_CAVEATS,
  };
}

/**
 * @param {'instantaneous'|'dailyEnergy'} mode
 * @param {import('./validation.js').Issue[]} issues
 * @returns {SolarResult}
 */
function emptySolarResult(mode, issues) {
  return {
    mode,
    peakSunHours: NaN,
    systemEfficiency: NaN,
    dcLossFactor: NaN,
    inverterEfficiency: NaN,
    targetFraction: NaN,
    requiredPvKWp: 0,
    dailyGenerationKWh: 0,
    monthlyGenerationKWh: 0,
    annualGenerationKWh: 0,
    specificYieldKWhPerKWpYear: NaN,
    monthlySavingsPkr: 0,
    annualSavingsPkr: 0,
    issues,
    assumptions: [],
    caveats: SOLAR_CAVEATS,
  };
}
