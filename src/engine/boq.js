/**
 * Bill of Quantities generation for a rooftop / ground-mount PV system.
 *
 * Quantities are derived from the sizing results, never hard-coded. Every line
 * carries the rule that produced its quantity in `basis`, so a reviewer can see
 * why a number is what it is and change the driver rather than the number.
 *
 * @module engine/boq
 */

import { CABLE_SIZES_MM2 } from './constants.js';

/**
 * @typedef {Object} BoqLine
 * @property {string} id
 * @property {string} item          Short name.
 * @property {string} description   Specification text.
 * @property {number} quantity
 * @property {string} unit
 * @property {string} brand         Left blank for the user to fill in.
 * @property {string} remarks
 * @property {string} basis         How the quantity was derived.
 * @property {number} [rate]        Optional unit rate, PKR.
 * @property {boolean} [userAdded]
 */

/**
 * @typedef {Object} BoqInput
 * @property {number} panelCount
 * @property {number} panelWattage
 * @property {number} installedCapacityKWp
 * @property {number} inverterKW
 * @property {number} [inverterCount=1]
 * @property {1|3} phases
 * @property {number} [modulesPerString=20]
 * @property {number} [dcRunLengthM=40]     Average one-way DC run per string.
 * @property {number} [acRunLengthM=30]     Inverter to distribution board.
 * @property {number} [acCableSizeMm2]      From the cable calculator.
 * @property {number} [dcCableSizeMm2=6]
 * @property {number} [earthCableSizeMm2=16]
 * @property {number} [mountingType]
 * @property {number} [stringsPerMppt=2]
 * @property {number} [sparesPercent=10]    Applied to connectors only.
 */

/** Round up to a whole unit. @param {number} n @returns {number} */
const ceil = (n) => Math.ceil(n - 1e-9);

/** Round a length up to the next 5 m, the way cable is actually ordered. */
const roundCableM = (n) => Math.ceil(n / 5) * 5;

/**
 * Number of series strings, and how many modules are left over.
 * @param {number} panelCount
 * @param {number} modulesPerString
 * @returns {{ strings: number, remainder: number }}
 */
export function stringConfiguration(panelCount, modulesPerString) {
  if (!(modulesPerString > 0)) throw new Error('Modules per string must be greater than zero.');
  const strings = Math.ceil(panelCount / modulesPerString);
  const remainder = panelCount % modulesPerString;
  return { strings, remainder };
}

/**
 * Build a BOQ from the sizing results.
 * @param {BoqInput} input
 * @returns {{ lines: BoqLine[], summary: Record<string, number|string>, notes: string[] }}
 */
export function generateBoq(input) {
  const {
    panelCount, panelWattage, installedCapacityKWp, inverterKW,
    inverterCount = 1, phases = 3,
    modulesPerString = 20, dcRunLengthM = 40, acRunLengthM = 30,
    acCableSizeMm2, dcCableSizeMm2 = 6, earthCableSizeMm2 = 16,
    stringsPerMppt = 2, sparesPercent = 10,
  } = input;

  if (!(panelCount > 0)) {
    return { lines: [], summary: {}, notes: ['Complete the solar sizing first — a BOQ needs a module count.'] };
  }

  const { strings } = stringConfiguration(panelCount, modulesPerString);
  const mpptGroups = Math.max(1, Math.ceil(strings / Math.max(1, stringsPerMppt)));
  const spares = 1 + sparesPercent / 100;

  // DC cable: positive + negative for every string, at the stated average run.
  const dcCableM = roundCableM(strings * dcRunLengthM * 2);
  // AC cable: (phases + neutral) conductors is a multicore run, so route length
  // is what is ordered, plus a 10 % installation allowance.
  const acCableM = roundCableM(acRunLengthM * inverterCount * 1.1);
  // Earthing: array frame bonding runs roughly the DC route once, plus the
  // inverter-to-earth-pit run.
  const earthCableM = roundCableM(strings * dcRunLengthM * 0.6 + acRunLengthM * 1.5);
  const earthElectrodes = Math.max(2, ceil(installedCapacityKWp / 25));
  // Two MC4 pairs per string (array end and combiner/inverter end).
  const mc4Pairs = ceil(strings * 2 * spares);
  const trayM = roundCableM((strings * dcRunLengthM * 0.5 + acRunLengthM) * 0.8);

  const acCableDesc = acCableSizeMm2
    ? `${acCableSizeMm2} mm², ${phases === 3 ? '4-core (3P+N)' : '2-core'} copper, XLPE/PVC`
    : `Sized from the cable calculator, ${phases === 3 ? '4-core (3P+N)' : '2-core'} copper`;

  /** @type {BoqLine[]} */
  const lines = [
    line('pv-module', 'Solar PV module', `Monocrystalline PV module, ${panelWattage} Wp, Tier-1, IEC 61215 / IEC 61730 certified, 12-year product and 25-year performance warranty`, panelCount, 'No.',
      `Module count from the solar sizing: ${installedCapacityKWp.toFixed(2)} kWp ÷ ${panelWattage} W.`,
      'Confirm the exact model, dimensions and warranty terms against the supplier quotation.'),

    line('inverter', 'Solar inverter', `${inverterKW} kW ${phases === 3 ? 'three-phase' : 'single-phase'} grid-tied string inverter, IEC 62109 certified, with integrated MPPT and DC switch`, inverterCount, 'No.',
      `Rating from the inverter sizing for a ${installedCapacityKWp.toFixed(2)} kWp array.`,
      'Verify MPPT voltage/current window and maximum DC input against the final string design.'),

    line('mounting', 'Mounting structure', 'Hot-dip galvanised / aluminium mounting structure with rails, mid and end clamps, and fixings, designed for site wind loading', installedCapacityKWp, 'kWp',
      'Priced per installed kWp; structure is a designed item.',
      'Wind load design and roof structural check by a structural engineer.'),

    line('dc-cable', 'DC cable', `${dcCableSizeMm2} mm² single-core solar DC cable, tinned copper, XLPO insulated, UV and ozone resistant, 1500 V DC rated (EN 50618 / IEC 62930)`, dcCableM, 'm',
      `${strings} string(s) × ${dcRunLengthM} m average run × 2 (positive + negative), rounded up to the next 5 m.`,
      'Verify the actual routed lengths on site; DC voltage drop should be kept under about 2 %.'),

    line('ac-cable', 'AC cable', acCableDesc, acCableM, 'm',
      `${acRunLengthM} m inverter-to-DB run × ${inverterCount} inverter(s) + 10 % installation allowance.`,
      'Size confirmed by the cable calculator including derating and voltage drop.'),

    line('earth-cable', 'Earthing cable', `${earthCableSizeMm2} mm² bare/green-yellow copper earthing conductor for array frame bonding and equipment earthing`, earthCableM, 'm',
      'Array frame bonding taken as 60 % of the DC route length, plus 1.5 × the AC run for the equipment earth.',
      'Final earthing design must satisfy the applicable earthing and lightning-protection requirements.'),

    line('earth-electrode', 'Earthing electrode', 'Copper-bonded earth rod with clamp, inspection pit and cover; chemical earthing where soil resistivity requires it', earthElectrodes, 'No.',
      `One electrode per 25 kWp, minimum 2 — ${installedCapacityKWp.toFixed(1)} kWp installed.`,
      'Quantity must be confirmed by a soil resistivity test and the target earth resistance value.'),

    line('dc-isolator', 'DC isolator', `${phases === 3 ? '1000/1500' : '1000'} V DC rated load-break isolator, lockable, IP65 enclosure`, mpptGroups, 'No.',
      `One per MPPT group: ${strings} string(s) at ${stringsPerMppt} string(s) per MPPT.`,
      'Some inverters include an integrated DC switch — delete this line if so.'),

    line('ac-isolator', 'AC isolator', `${phases === 3 ? '4-pole' : '2-pole'} AC load-break isolator, rated above the inverter output current, IP65 enclosure`, inverterCount, 'No.',
      'One per inverter, at the inverter AC output.',
      'Rating to be at least the inverter maximum continuous output current.'),

    line('dc-spd', 'DC surge protection device', 'Type 2 DC SPD, 1000/1500 V DC, with status indication (IEC 61643-31)', mpptGroups, 'No.',
      'One per MPPT group / combiner enclosure.',
      'Type 1+2 required where a lightning protection system is present on the building.'),

    line('ac-spd', 'AC surge protection device', `Type 2 AC SPD, ${phases === 3 ? '3P+N' : '1P+N'}, with status indication (IEC 61643-11)`, inverterCount, 'No.',
      'One per AC distribution board fed from an inverter.',
      'Coordinate with any Type 1 SPD at the main incomer.'),

    line('mc4', 'MC4 connectors', 'MC4-compatible DC connector pairs, 1000/1500 V DC, IP68, original manufacturer', mc4Pairs, 'Pair',
      `2 pairs per string × ${strings} string(s), plus ${sparesPercent}% spares.`,
      'Use one manufacturer throughout — mixing connector brands is a known fire risk and voids warranties.'),

    line('combiner', 'Array junction / combiner box', 'DC combiner box, IP65, with string fuses, busbars and provision for SPD and isolator', mpptGroups, 'No.',
      'One per MPPT group.',
      'Not required where strings terminate directly at the inverter MPPT inputs.'),

    line('acdb', 'AC distribution board', `AC combiner/distribution board, ${phases === 3 ? 'TP&N' : 'SP&N'}, with incomer, outgoing MCB/MCCB, SPD and metering provision`, 1, 'No.',
      'One board collecting the inverter output(s) before the point of connection.',
      'Schedule and short-circuit rating to be confirmed against the site fault level.'),

    line('cable-tray', 'Cable tray / conduit', 'Hot-dip galvanised perforated cable tray or UV-stabilised conduit with covers, supports and accessories', trayM, 'm',
      'Estimated at 80 % of the combined DC and AC route length.',
      'Measure the actual route; separate DC and AC containment is preferred.'),

    line('labels', 'Labels and signage', 'Engraved warning labels, circuit identification, dual-supply warning notices and array shutdown procedure signage', 1, 'Lot',
      'One lot for the installation.',
      'Wording and placement per the applicable wiring rules and the utility requirement.'),

    line('installation', 'Installation, testing and commissioning', 'Supply of labour, tools and consumables for mechanical installation, DC and AC wiring, earthing, testing (insulation resistance, polarity, string I-V, earth continuity), commissioning and handover documentation', 1, 'Lot',
      'One lot for the installation.',
      'Includes as-built drawings, test reports and O&M documentation.'),
  ];

  const notes = [
    'Quantities are derived from the sizing results and are estimates for budgeting. Re-measure against the final layout and single-line diagram before ordering.',
    'Cable lengths use average route assumptions. Actual lengths must come from the routing drawing.',
    'Brand columns are intentionally blank — fill them in from the approved vendor list.',
    'Net metering equipment, the bidirectional meter, utility application fees, structural strengthening, crane/hoisting and scaffolding are excluded unless added as separate lines.',
    'Rates are excluded by default. Add a rate against a line to build a priced BOQ.',
  ];

  return {
    lines,
    summary: {
      installedCapacityKWp,
      panelCount,
      strings,
      modulesPerString,
      mpptGroups,
      inverterKW,
      inverterCount,
      dcCableM,
      acCableM,
      earthCableM,
      lineCount: lines.length,
    },
    notes,
  };
}

/**
 * @param {string} id
 * @param {string} item
 * @param {string} description
 * @param {number} quantity
 * @param {string} unit
 * @param {string} basis
 * @param {string} remarks
 * @returns {BoqLine}
 */
function line(id, item, description, quantity, unit, basis, remarks) {
  return {
    id,
    item,
    description,
    quantity: Number.isFinite(quantity) ? Math.round(quantity * 100) / 100 : 0,
    unit,
    brand: '',
    remarks,
    basis,
    rate: null,
  };
}

/**
 * Priced total for a BOQ, ignoring lines with no rate.
 * @param {BoqLine[]} lines
 * @returns {{ total: number, pricedLines: number, unpricedLines: number }}
 */
export function boqTotal(lines) {
  let total = 0;
  let priced = 0;
  let unpriced = 0;
  for (const l of lines) {
    const rate = Number(l.rate);
    if (Number.isFinite(rate) && rate > 0) {
      total += rate * Number(l.quantity || 0);
      priced += 1;
    } else {
      unpriced += 1;
    }
  }
  return { total, pricedLines: priced, unpricedLines: unpriced };
}

/** Standard cable sizes, re-exported for the BOQ editor's dropdowns. */
export { CABLE_SIZES_MM2 };
