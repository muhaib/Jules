/**
 * Application state: projects, the active project, and user settings.
 *
 * Everything lives in localStorage, so the app works offline and no data
 * leaves the device. The store is deliberately dumb — it holds INPUTS only.
 * Results are never persisted; they are re-derived from the inputs on every
 * render by the engine, which is what keeps the numbers from going stale.
 *
 * @module store
 */

import { createLoadItem } from './engine/load.js';
import {
  PAKISTAN_CITIES, DEFAULT_TARIFF_PKR_PER_KWH, PANEL_DIMENSION_PRESETS,
} from './engine/constants.js';

const STORAGE_KEY = 'powercalc.pakistan.v1';
const SCHEMA_VERSION = 1;

/** @typedef {'Draft'|'In review'|'Issued'|'Archived'} ProjectStatus */

/** Project statuses, in workflow order. */
export const PROJECT_STATUSES = /** @type {ProjectStatus[]} */ ([
  'Draft', 'In review', 'Issued', 'Archived',
]);

/** Factory for the app-wide defaults a new project inherits. */
export function defaultSettings() {
  return {
    defaultCityKey: 'multan',
    defaultSystemVoltage: 400,
    defaultSystemPhases: 3,
    defaultPanelWattage: 600,
    defaultSystemLossPercent: 14,
    defaultInverterEfficiency: 0.97,
    defaultAmbientC: 40,
    defaultVoltageDropLimitPercent: 3,
    tariffPkrPerKwh: DEFAULT_TARIFF_PKR_PER_KWH,
    engineerName: '',
    organisation: '',
  };
}

/**
 * A blank project, seeded from the current settings.
 * @param {ReturnType<typeof defaultSettings>} settings
 * @param {Partial<{name:string, client:string, location:string}>} [meta]
 * @returns {object}
 */
export function createProject(settings, meta = {}) {
  const now = new Date().toISOString();
  const city = PAKISTAN_CITIES.find((c) => c.key === settings.defaultCityKey) ?? PAKISTAN_CITIES[0];
  const dims = PANEL_DIMENSION_PRESETS[settings.defaultPanelWattage] ?? { widthMm: 2278, heightMm: 1134 };

  return {
    id: `prj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: meta.name ?? 'Untitled project',
    client: meta.client ?? '',
    location: meta.location ?? city.name + ', Pakistan',
    engineer: settings.engineerName ?? '',
    status: /** @type {ProjectStatus} */ ('Draft'),
    notes: '',
    createdAt: now,
    updatedAt: now,
    inputs: {
      load: {
        systemVoltage: settings.defaultSystemVoltage,
        systemPhases: settings.defaultSystemPhases,
        overallDiversity: 1,
        spareCapacityPercent: 0,
        loads: [],
      },
      cable: {
        // 'load' takes the current from the load calculator; 'manual' uses the typed value.
        source: 'load',
        currentA: '',
        loadKW: '',
        material: 'copper',
        insulation: 'pvc',
        cores: settings.defaultSystemPhases === 3 ? 4 : 2,
        installationMethod: 'C',
        lengthM: 50,
        ambientC: settings.defaultAmbientC,
        groupedCircuits: 1,
        derateOther: 1,
        voltageDropLimitPercent: settings.defaultVoltageDropLimitPercent,
        parallelRuns: 1,
      },
      solar: {
        mode: 'instantaneous',
        loadSource: 'load',
        daytimeLoadKW: '',
        dailyConsumptionKWh: 250,
        cityKey: city.key,
        peakSunHours: city.peakSunHours,
        targetPercent: 100,
        systemLossPercent: settings.defaultSystemLossPercent,
        inverterEfficiency: settings.defaultInverterEfficiency,
        futureLoadKW: 0,
        futureEnergyKWh: 0,
        tariffPkrPerKwh: settings.tariffPkrPerKwh,
        exportFraction: 0,
        exportTariffPkrPerKwh: settings.tariffPkrPerKwh,
      },
      panels: {
        panelWattage: settings.defaultPanelWattage,
        panelWidthMm: dims.widthMm,
        panelHeightMm: dims.heightMm,
        orientation: 'portrait',
        mountingType: 'flatTilted',
        tiltDeg: 15,
        accessMarginPercent: 10,
        designSolarAltitudeDeg: '',
      },
      inverter: {
        systemType: 'gridTied',
        dcAcRatioTarget: 1.2,
        dcAcRatioMin: 1.0,
        dcAcRatioMax: 1.3,
        surgeFactor: 1.25,
      },
      boq: {
        modulesPerString: 20,
        stringsPerMppt: 2,
        dcRunLengthM: 40,
        acRunLengthM: 30,
        dcCableSizeMm2: 6,
        earthCableSizeMm2: 16,
        sparesPercent: 10,
        inverterCount: 1,
      },
    },
    /** User edits to the generated BOQ. null means "use the generated lines". */
    boqLines: null,
    ...meta,
  };
}

/** The demo project from the specification, used to seed a first run. */
export function createDemoProject(settings) {
  const p = createProject(settings, {
    name: 'UBL Multan Branch',
    client: 'United Bank Limited',
    location: 'Multan, Pakistan',
  });
  p.notes = 'Demo project shipped with the app. Bank branch: air conditioning, '
    + 'lighting, IT, CCTV and general power, with a rooftop PV system sized to '
    + 'cover the daytime load.';
  p.inputs.load.loads = [
    createLoadItem({ name: 'Split AC units', category: 'hvac', quantity: 6, ratedPower: 2, unit: 'kW', phase: 3, powerFactor: 0.9, diversityFactor: 0.9, hoursPerDay: 8 }),
    createLoadItem({ name: 'LED lighting', category: 'lighting', quantity: 40, ratedPower: 40, unit: 'W', phase: 1, powerFactor: 0.95, diversityFactor: 0.9, hoursPerDay: 10 }),
    createLoadItem({ name: 'Computers and terminals', category: 'itEquipment', quantity: 20, ratedPower: 150, unit: 'W', phase: 1, powerFactor: 0.95, diversityFactor: 0.8, hoursPerDay: 9 }),
    createLoadItem({ name: 'CCTV and access control', category: 'security', quantity: 1, ratedPower: 500, unit: 'W', phase: 1, powerFactor: 0.9, diversityFactor: 1, hoursPerDay: 24 }),
    createLoadItem({ name: 'Server room precision AC', category: 'hvac', quantity: 1, ratedPower: 5, unit: 'kW', phase: 3, powerFactor: 0.9, diversityFactor: 1, hoursPerDay: 24 }),
    createLoadItem({ name: 'UPS (branch systems)', category: 'ups', quantity: 1, ratedPower: 10, unit: 'kVA', phase: 3, powerFactor: 0.9, diversityFactor: 0.8, hoursPerDay: 10 }),
    createLoadItem({ name: 'General power sockets', category: 'socket', quantity: 30, ratedPower: 300, unit: 'W', phase: 1, powerFactor: 0.9, diversityFactor: 0.5, hoursPerDay: 8 }),
    createLoadItem({ name: 'Water pump', category: 'motor', quantity: 1, ratedPower: 3, unit: 'HP', phase: 3, powerFactor: 0.85, diversityFactor: 0.6, hoursPerDay: 3 }),
    createLoadItem({ name: 'Signage and facade lighting', category: 'lighting', quantity: 1, ratedPower: 1.2, unit: 'kW', phase: 1, powerFactor: 0.95, diversityFactor: 1, hoursPerDay: 6 }),
  ];
  return p;
}

/** @returns {{version:number, projects:object[], activeProjectId:string|null, settings:object}} */
function freshState() {
  const settings = defaultSettings();
  const demo = createDemoProject(settings);
  return {
    version: SCHEMA_VERSION,
    projects: [demo],
    activeProjectId: demo.id,
    settings,
  };
}

/** @returns {object} */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.projects)) return freshState();
    return {
      version: SCHEMA_VERSION,
      projects: parsed.projects,
      activeProjectId: parsed.activeProjectId ?? parsed.projects[0]?.id ?? null,
      // Merge so a settings key added in a later version still has a value.
      settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
    };
  } catch (err) {
    console.warn('Could not read saved projects; starting fresh.', err);
    return freshState();
  }
}

/** @type {ReturnType<typeof freshState>} */
let state = load();

/** @type {Set<() => void>} */
const listeners = new Set();

let persistFailed = false;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    persistFailed = false;
  } catch (err) {
    // Private browsing or a full quota. Say so rather than losing work silently.
    persistFailed = true;
    console.warn('Could not save to this browser.', err);
  }
}

function notify() {
  for (const fn of listeners) fn();
}

/**
 * Subscribe to state changes.
 * @param {() => void} fn
 * @returns {() => void} Unsubscribe.
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** @returns {boolean} True when the last save to localStorage failed. */
export const saveFailed = () => persistFailed;

/** @returns {object[]} */
export const getProjects = () => state.projects;

/** @returns {object} */
export const getSettings = () => state.settings;

/** @returns {object|null} */
export const getActiveProject = () =>
  state.projects.find((p) => p.id === state.activeProjectId) ?? state.projects[0] ?? null;

/** @param {string} id */
export function setActiveProject(id) {
  state.activeProjectId = id;
  persist();
  notify();
}

/**
 * Apply a mutation to the active project and re-render.
 * @param {(project: object) => void} mutator
 */
export function updateActiveProject(mutator) {
  const project = getActiveProject();
  if (!project) return;
  mutator(project);
  project.updatedAt = new Date().toISOString();
  persist();
  notify();
}

/**
 * Set a value at a dotted path inside the active project, e.g.
 * `setField('inputs.solar.targetPercent', 80)`.
 * @param {string} path
 * @param {unknown} value
 */
export function setField(path, value) {
  updateActiveProject((project) => {
    const keys = path.split('.');
    let node = project;
    for (const key of keys.slice(0, -1)) {
      if (node[key] === undefined || node[key] === null) node[key] = {};
      node = node[key];
    }
    node[keys.at(-1)] = value;
  });
}

/**
 * Read a value at a dotted path from the active project.
 * @param {string} path
 * @returns {unknown}
 */
export function getField(path) {
  const project = getActiveProject();
  if (!project) return undefined;
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), project);
}

/**
 * @param {Partial<{name:string, client:string, location:string}>} [meta]
 * @returns {object} The new project.
 */
export function addProject(meta) {
  const project = createProject(state.settings, meta);
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  persist();
  notify();
  return project;
}

/**
 * Deep-copy a project under a new id and name.
 * @param {string} id
 * @returns {object|null}
 */
export function duplicateProject(id) {
  const source = state.projects.find((p) => p.id === id);
  if (!source) return null;
  const copy = structuredClone(source);
  copy.id = `prj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  copy.name = `${source.name} (copy)`;
  copy.status = 'Draft';
  copy.createdAt = new Date().toISOString();
  copy.updatedAt = copy.createdAt;
  // Fresh ids for the load rows so editing the copy cannot touch the original.
  for (const l of copy.inputs.load.loads) {
    l.id = `load_${Math.random().toString(36).slice(2, 10)}`;
  }
  state.projects.unshift(copy);
  state.activeProjectId = copy.id;
  persist();
  notify();
  return copy;
}

/** @param {string} id */
export function deleteProject(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  if (state.activeProjectId === id) {
    state.activeProjectId = state.projects[0]?.id ?? null;
  }
  persist();
  notify();
}

/** @param {Partial<ReturnType<typeof defaultSettings>>} patch */
export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  persist();
  notify();
}

/** Restore the shipped demo project (used from Settings). */
export function restoreDemoProject() {
  const demo = createDemoProject(state.settings);
  state.projects.unshift(demo);
  state.activeProjectId = demo.id;
  persist();
  notify();
  return demo;
}

/** Delete everything and start over. */
export function resetAll() {
  state = freshState();
  persist();
  notify();
}

/** @returns {string} The whole store as pretty JSON, for backup. */
export const exportState = () => JSON.stringify(state, null, 2);

/**
 * Replace the store from a previously exported JSON backup.
 * @param {string} json
 * @returns {{ ok: boolean, message: string }}
 */
export function importState(json) {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.projects)) {
      return { ok: false, message: 'That file does not contain a PowerCalc project list.' };
    }
    state = {
      version: SCHEMA_VERSION,
      projects: parsed.projects,
      activeProjectId: parsed.activeProjectId ?? parsed.projects[0]?.id ?? null,
      settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
    };
    persist();
    notify();
    return { ok: true, message: `Imported ${state.projects.length} project(s).` };
  } catch (err) {
    return { ok: false, message: `Could not read that file: ${err.message}` };
  }
}

/**
 * Convert the stored inputs into the shape the engine expects, dropping the
 * UI-only fields and turning "linked" values back into undefined so the engine
 * derives them from the previous stage.
 * @param {object} project
 * @returns {import('./engine/index.js').ProjectInputs}
 */
export function toEngineInputs(project) {
  const i = project.inputs;
  const blank = (v) => v === '' || v === null || v === undefined;

  return {
    load: {
      systemVoltage: Number(i.load.systemVoltage),
      systemPhases: Number(i.load.systemPhases) === 3 ? 3 : 1,
      overallDiversity: Number(i.load.overallDiversity),
      spareCapacityPercent: Number(i.load.spareCapacityPercent),
      loads: i.load.loads,
    },
    cable: {
      material: i.cable.material,
      insulation: i.cable.insulation,
      cores: Number(i.cable.cores),
      installationMethod: i.cable.installationMethod,
      lengthM: Number(i.cable.lengthM),
      ambientC: Number(i.cable.ambientC),
      groupedCircuits: Number(i.cable.groupedCircuits),
      derateOther: Number(i.cable.derateOther),
      voltageDropLimitPercent: Number(i.cable.voltageDropLimitPercent),
      parallelRuns: Number(i.cable.parallelRuns),
      voltage: Number(i.load.systemVoltage),
      phases: Number(i.load.systemPhases) === 3 ? 3 : 1,
      // 'load' mode leaves both undefined so the engine uses the maximum demand.
      ...(i.cable.source === 'manual' && !blank(i.cable.currentA)
        ? { currentA: Number(i.cable.currentA) }
        : {}),
      ...(i.cable.source === 'manualKw' && !blank(i.cable.loadKW)
        ? { loadKW: Number(i.cable.loadKW) }
        : {}),
    },
    solar: {
      mode: i.solar.mode,
      cityKey: i.solar.cityKey,
      peakSunHours: Number(i.solar.peakSunHours),
      targetPercent: Number(i.solar.targetPercent),
      systemLossPercent: Number(i.solar.systemLossPercent),
      inverterEfficiency: Number(i.solar.inverterEfficiency),
      futureLoadKW: Number(i.solar.futureLoadKW),
      futureEnergyKWh: Number(i.solar.futureEnergyKWh),
      tariffPkrPerKwh: Number(i.solar.tariffPkrPerKwh),
      exportFraction: Number(i.solar.exportFraction),
      exportTariffPkrPerKwh: Number(i.solar.exportTariffPkrPerKwh),
      ...(i.solar.mode === 'instantaneous' && i.solar.loadSource === 'manual' && !blank(i.solar.daytimeLoadKW)
        ? { daytimeLoadKW: Number(i.solar.daytimeLoadKW) }
        : {}),
      ...(i.solar.mode === 'dailyEnergy'
        ? { dailyConsumptionKWh: Number(i.solar.dailyConsumptionKWh) }
        : {}),
    },
    panels: {
      panelWattage: Number(i.panels.panelWattage),
      panelWidthMm: Number(i.panels.panelWidthMm),
      panelHeightMm: Number(i.panels.panelHeightMm),
      orientation: i.panels.orientation,
      mountingType: i.panels.mountingType,
      tiltDeg: Number(i.panels.tiltDeg),
      accessMarginPercent: Number(i.panels.accessMarginPercent),
      cityKey: i.solar.cityKey,
      ...(blank(i.panels.designSolarAltitudeDeg)
        ? {}
        : { designSolarAltitudeDeg: Number(i.panels.designSolarAltitudeDeg) }),
    },
    inverter: {
      systemType: i.inverter.systemType,
      dcAcRatioTarget: Number(i.inverter.dcAcRatioTarget),
      dcAcRatioMin: Number(i.inverter.dcAcRatioMin),
      dcAcRatioMax: Number(i.inverter.dcAcRatioMax),
      surgeFactor: Number(i.inverter.surgeFactor),
      phases: Number(i.load.systemPhases) === 3 ? 3 : 1,
    },
    boq: {
      modulesPerString: Number(i.boq.modulesPerString),
      stringsPerMppt: Number(i.boq.stringsPerMppt),
      dcRunLengthM: Number(i.boq.dcRunLengthM),
      acRunLengthM: Number(i.boq.acRunLengthM),
      dcCableSizeMm2: Number(i.boq.dcCableSizeMm2),
      earthCableSizeMm2: Number(i.boq.earthCableSizeMm2),
      sparesPercent: Number(i.boq.sparesPercent),
      inverterCount: Number(i.boq.inverterCount),
    },
  };
}
