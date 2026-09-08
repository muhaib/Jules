/**
 * Reference data used by the calculation engine.
 *
 * IMPORTANT — READ BEFORE RELYING ON THESE NUMBERS
 * ------------------------------------------------
 * The cable, correction-factor and irradiation tables below are *indicative
 * values compiled for preliminary estimating*. They are shaped after the
 * IEC 60364-5-52 / BS 7671 family of tables and publicly published solar
 * resource data, but this file is NOT a reproduction of any standard and has
 * no standards-body status. Every value a design depends on must be checked
 * against the current edition of the applicable standard, the cable
 * manufacturer's datasheet, and site-measured data.
 *
 * Each table records its own basis in `_basis` so the UI can show the user
 * exactly what assumption produced a number.
 * @module engine/constants
 */

/** Standard copper/aluminium conductor cross-sectional areas (mm²). */
export const CABLE_SIZES_MM2 = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300,
];

/** Standard protective device ratings (A). */
export const BREAKER_RATINGS_A = [
  6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250,
  315, 400, 500, 630, 800, 1000, 1250, 1600,
];

/** Ratings at or below this are normally MCBs; above, MCCBs / ACBs. */
export const MCB_MAX_RATING_A = 125;

/**
 * Base current-carrying capacity, in amperes, for 70 °C thermoplastic (PVC)
 * insulated COPPER conductors, Reference Method C (clipped direct to a
 * non-metallic surface), 30 °C ambient, single circuit.
 *
 * All other cases (aluminium, XLPE, other installation methods, other
 * ambients, grouping) are derived from this base table by the documented
 * multipliers below, so that every step is visible to the user.
 */
export const AMPACITY_BASE = {
  _basis:
    '70 °C PVC insulated copper conductor, Reference Method C (clipped direct), '
    + '30 °C ambient air, one circuit, no grouping. Indicative values for preliminary '
    + 'estimating — verify against IEC 60364-5-52 / BS 7671 and the manufacturer datasheet.',
  /** 2 loaded conductors (single-phase a.c. or d.c.). */
  twoCore: {
    1.5: 19.5, 2.5: 27, 4: 36, 6: 46, 10: 63, 16: 85, 25: 112, 35: 138,
    50: 168, 70: 213, 95: 258, 120: 299, 150: 344, 185: 392, 240: 461, 300: 530,
  },
  /** 3 or 4 loaded conductors (three-phase a.c.). */
  threeCore: {
    1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 96, 35: 119,
    50: 144, 70: 184, 95: 223, 120: 259, 150: 299, 185: 341, 240: 403, 300: 464,
  },
};

/**
 * Conductor material factors applied to the copper base table.
 * Aluminium conductors are not commonly manufactured below 16 mm², so smaller
 * sizes are excluded from aluminium selection (see cable.js).
 */
export const MATERIAL_FACTORS = {
  copper: {
    key: 'copper',
    label: 'Copper',
    ampacityFactor: 1.0,
    /** Resistivity at 20 °C, Ω·mm²/m. */
    rho20: 0.017241,
    /** Temperature coefficient of resistance per °C at 20 °C. */
    alpha: 0.00393,
    minSizeMm2: 1.5,
  },
  aluminium: {
    key: 'aluminium',
    label: 'Aluminium',
    ampacityFactor: 0.78,
    rho20: 0.028264,
    alpha: 0.00403,
    minSizeMm2: 16,
  },
};

/** Insulation systems: rating factor vs the 70 °C PVC base, and operating temperature. */
export const INSULATION_TYPES = {
  pvc: {
    key: 'pvc',
    label: 'PVC (70 °C)',
    ampacityFactor: 1.0,
    conductorTempC: 70,
  },
  xlpe: {
    key: 'xlpe',
    label: 'XLPE / EPR (90 °C)',
    ampacityFactor: 1.28,
    conductorTempC: 90,
  },
};

/**
 * Installation (reference) methods, expressed as a factor on the Method C base
 * table. Using explicit factors keeps the derivation visible instead of hiding
 * eight separate tables.
 */
export const INSTALLATION_METHODS = {
  A: { key: 'A', label: 'A — In conduit in a thermally insulated wall', factor: 0.72 },
  B: { key: 'B', label: 'B — In conduit on a wall / in trunking', factor: 0.87 },
  C: { key: 'C', label: 'C — Clipped direct to a surface', factor: 1.0 },
  D: { key: 'D', label: 'D — Direct buried / in buried ducts', factor: 0.93 },
  E: { key: 'E', label: 'E — Multicore cable in free air / on tray', factor: 1.1 },
  F: { key: 'F', label: 'F — Single-core cables spaced in free air', factor: 1.2 },
};

/**
 * Ambient air temperature correction factors (Ca).
 * Keys are ambient temperature in °C; values interpolate linearly between keys.
 */
export const AMBIENT_FACTORS = {
  _basis: 'Ambient air temperature correction, IEC 60364-5-52 style, base 30 °C.',
  pvc: {
    10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06, 30: 1.0, 35: 0.94,
    40: 0.87, 45: 0.79, 50: 0.71, 55: 0.61, 60: 0.5,
  },
  xlpe: {
    10: 1.15, 15: 1.12, 20: 1.08, 25: 1.04, 30: 1.0, 35: 0.96, 40: 0.91,
    45: 0.87, 50: 0.82, 55: 0.76, 60: 0.71, 65: 0.65, 70: 0.58, 75: 0.5, 80: 0.41,
  },
};

/**
 * Grouping correction factor (Cg) for circuits bunched together.
 * Keys are the number of circuits in the group.
 */
export const GROUPING_FACTORS = {
  _basis: 'Grouping of more than one circuit, bunched and enclosed, IEC 60364-5-52 style.',
  values: {
    1: 1.0, 2: 0.8, 3: 0.7, 4: 0.65, 5: 0.6, 6: 0.57, 7: 0.54, 8: 0.52,
    9: 0.5, 10: 0.48, 12: 0.45, 14: 0.43, 16: 0.41, 18: 0.39, 20: 0.38,
  },
};

/**
 * Default conductor reactance used in the voltage-drop calculation, in Ω per
 * metre. Multicore LV cables sit close to this figure across the common size
 * range; it is user-adjustable because spacing dominates it for single-core
 * installations.
 */
export const DEFAULT_REACTANCE_OHM_PER_M = 0.00008;

/** Typical voltage-drop limits, as a percentage of nominal voltage. */
export const VOLTAGE_DROP_LIMITS = {
  lighting: { key: 'lighting', label: 'Lighting circuits', percent: 3 },
  power: { key: 'power', label: 'Power circuits', percent: 5 },
  solarAc: { key: 'solarAc', label: 'Solar a.c. (inverter → DB)', percent: 1 },
  solarDc: { key: 'solarDc', label: 'Solar d.c. (array → inverter)', percent: 2 },
};

/** Common Pakistani LV system voltages. */
export const SYSTEM_VOLTAGES = [
  { key: '230-1', label: '230 V, single phase (L-N)', volts: 230, phases: 1 },
  { key: '400-3', label: '400 V, three phase (L-L)', volts: 400, phases: 3 },
  { key: '415-3', label: '415 V, three phase (L-L)', volts: 415, phases: 3 },
  { key: '220-1', label: '220 V, single phase (L-N)', volts: 220, phases: 1 },
  { key: '380-3', label: '380 V, three phase (L-L)', volts: 380, phases: 3 },
];

/**
 * Indicative annual-average daily peak sun hours (kWh/m²/day on a fixed,
 * optimally tilted plane) for Pakistani cities, with latitude.
 *
 * These are planning-grade figures. For a real design, pull site-specific data
 * from the Global Solar Atlas, NASA POWER, Meteonorm or a measured dataset —
 * month-to-month variation in Pakistan is roughly ±30 % around the annual mean.
 */
export const PAKISTAN_CITIES = [
  { key: 'multan', name: 'Multan', latitude: 30.2, peakSunHours: 5.2 },
  { key: 'karachi', name: 'Karachi', latitude: 24.86, peakSunHours: 5.3 },
  { key: 'lahore', name: 'Lahore', latitude: 31.55, peakSunHours: 4.8 },
  { key: 'islamabad', name: 'Islamabad', latitude: 33.68, peakSunHours: 4.9 },
  { key: 'rawalpindi', name: 'Rawalpindi', latitude: 33.6, peakSunHours: 4.9 },
  { key: 'faisalabad', name: 'Faisalabad', latitude: 31.42, peakSunHours: 5.0 },
  { key: 'peshawar', name: 'Peshawar', latitude: 34.02, peakSunHours: 5.0 },
  { key: 'quetta', name: 'Quetta', latitude: 30.18, peakSunHours: 5.7 },
  { key: 'hyderabad', name: 'Hyderabad', latitude: 25.4, peakSunHours: 5.4 },
  { key: 'sukkur', name: 'Sukkur', latitude: 27.7, peakSunHours: 5.5 },
  { key: 'bahawalpur', name: 'Bahawalpur', latitude: 29.4, peakSunHours: 5.4 },
  { key: 'sargodha', name: 'Sargodha', latitude: 32.08, peakSunHours: 5.0 },
  { key: 'gujranwala', name: 'Gujranwala', latitude: 32.16, peakSunHours: 4.8 },
  { key: 'sialkot', name: 'Sialkot', latitude: 32.49, peakSunHours: 4.7 },
  { key: 'dgkhan', name: 'Dera Ghazi Khan', latitude: 30.05, peakSunHours: 5.3 },
  { key: 'rahimyarkhan', name: 'Rahim Yar Khan', latitude: 28.42, peakSunHours: 5.4 },
  { key: 'larkana', name: 'Larkana', latitude: 27.56, peakSunHours: 5.4 },
  { key: 'gwadar', name: 'Gwadar', latitude: 25.12, peakSunHours: 5.6 },
  { key: 'abbottabad', name: 'Abbottabad', latitude: 34.15, peakSunHours: 4.7 },
  { key: 'muzaffarabad', name: 'Muzaffarabad', latitude: 34.37, peakSunHours: 4.6 },
  { key: 'gilgit', name: 'Gilgit', latitude: 35.92, peakSunHours: 4.9 },
  { key: 'skardu', name: 'Skardu', latitude: 35.3, peakSunHours: 5.0 },
];

/** Commonly available PV module wattages in the Pakistani market. */
export const PANEL_WATTAGES = [550, 580, 585, 600, 620, 650];

/**
 * Typical module dimensions (mm) for the wattages above. Always confirm against
 * the actual datasheet — dimensions differ between manufacturers at the same
 * wattage.
 */
export const PANEL_DIMENSION_PRESETS = {
  550: { widthMm: 2278, heightMm: 1134 },
  580: { widthMm: 2278, heightMm: 1134 },
  585: { widthMm: 2278, heightMm: 1134 },
  600: { widthMm: 2278, heightMm: 1134 },
  620: { widthMm: 2382, heightMm: 1134 },
  650: { widthMm: 2384, heightMm: 1303 },
};

/** Mounting arrangements and their typical ground-coverage ratio (GCR). */
export const MOUNTING_TYPES = {
  flushPitched: {
    key: 'flushPitched',
    label: 'Flush on pitched roof',
    gcr: 0.85,
    note: 'Modules laid parallel to an existing sloped roof — no inter-row shading gap needed.',
    tiltDeg: 0,
  },
  flatTilted: {
    key: 'flatTilted',
    label: 'Tilted rows on flat roof',
    gcr: 0.45,
    note: 'Ballasted or bolted tilt frames on a flat roof, spaced to limit inter-row shading.',
    tiltDeg: 15,
  },
  groundMount: {
    key: 'groundMount',
    label: 'Ground mount',
    gcr: 0.4,
    note: 'Fixed-tilt ground array with vehicle/maintenance access between rows.',
    tiltDeg: 25,
  },
  carport: {
    key: 'carport',
    label: 'Carport / shed structure',
    gcr: 0.9,
    note: 'Modules form the roof surface itself — coverage is near-continuous.',
    tiltDeg: 10,
  },
};

/** Common three-phase and single-phase string/hybrid inverter ratings (kW). */
export const INVERTER_RATINGS_KW = [
  1, 1.5, 2, 3, 3.6, 4, 5, 6, 8, 10, 12, 15, 17, 20, 25, 30, 33, 36, 40,
  50, 60, 75, 80, 100, 110, 125, 150, 200, 250,
];

/** Solar irradiance at Standard Test Conditions, W/m². */
export const STC_IRRADIANCE_W_M2 = 1000;

/** Sun's declination at the solstices, degrees. */
export const SOLAR_DECLINATION_DEG = 23.45;

/** Default electricity tariff assumption, PKR per kWh. Users must set their own. */
export const DEFAULT_TARIFF_PKR_PER_KWH = 55;

/** Days used to scale a daily figure to a month. */
export const DAYS_PER_MONTH = 30.44;

/** The disclaimer that must appear on every calculation page. */
export const ENGINEERING_DISCLAIMER =
  'Calculations are preliminary engineering estimates. Final equipment and cable '
  + 'selection must be verified against manufacturer datasheets, site conditions, '
  + 'applicable electrical codes, protection coordination requirements, and '
  + 'qualified engineering review.';

/** Equipment categories offered in the load calculator. */
export const EQUIPMENT_CATEGORIES = [
  { key: 'hvac', label: 'HVAC / Air conditioning', defaultPf: 0.9, defaultDiversity: 0.8, defaultHours: 8 },
  { key: 'lighting', label: 'Lighting', defaultPf: 0.95, defaultDiversity: 0.9, defaultHours: 10 },
  { key: 'itEquipment', label: 'IT / Computers', defaultPf: 0.95, defaultDiversity: 0.8, defaultHours: 9 },
  { key: 'security', label: 'Security / CCTV', defaultPf: 0.9, defaultDiversity: 1.0, defaultHours: 24 },
  { key: 'motor', label: 'Motors / Pumps', defaultPf: 0.85, defaultDiversity: 0.7, defaultHours: 6 },
  { key: 'lift', label: 'Lifts / Hoists', defaultPf: 0.85, defaultDiversity: 0.5, defaultHours: 4 },
  { key: 'kitchen', label: 'Kitchen / Catering', defaultPf: 0.95, defaultDiversity: 0.6, defaultHours: 5 },
  { key: 'socket', label: 'Socket outlets / General power', defaultPf: 0.9, defaultDiversity: 0.6, defaultHours: 8 },
  { key: 'ups', label: 'UPS / Backup', defaultPf: 0.95, defaultDiversity: 1.0, defaultHours: 24 },
  { key: 'process', label: 'Process / Machinery', defaultPf: 0.85, defaultDiversity: 0.75, defaultHours: 8 },
  { key: 'other', label: 'Other', defaultPf: 0.9, defaultDiversity: 1.0, defaultHours: 8 },
];
