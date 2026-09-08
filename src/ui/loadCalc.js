/**
 * Load Calculator view.
 * @module ui/loadCalc
 */

import {
  el, card, field, numberInput, textInput, select, segmented, stat, table,
  button, issueList, disclaimer, detailsList, barChart, fmt,
} from './components.js';
import { getActiveProject, setField, updateActiveProject, toEngineInputs } from '../store.js';
import { calculateLoadSchedule, createLoadItem } from '../engine/load.js';
import { EQUIPMENT_CATEGORIES, SYSTEM_VOLTAGES } from '../engine/constants.js';

const CATEGORY_OPTIONS = EQUIPMENT_CATEGORIES.map((c) => ({ value: c.key, label: c.label }));
const UNIT_OPTIONS = ['W', 'kW', 'HP', 'VA', 'kVA'].map((u) => ({ value: u, label: u }));

/**
 * Field-level error text for a given load row and property.
 * @param {import('../engine/validation.js').Issue[]} issues
 * @param {number} index
 * @param {string} prop
 * @returns {string|undefined}
 */
const rowError = (issues, index, prop) =>
  issues.find((i) => i.level === 'error' && i.field === `loads[${index}].${prop}`)?.message;

/**
 * @param {import('../engine/validation.js').Issue[]} issues
 * @param {string} fieldKey
 * @returns {string|undefined}
 */
const fieldError = (issues, fieldKey) =>
  issues.find((i) => i.level === 'error' && i.field === fieldKey)?.message;

/** @returns {HTMLElement} */
export function renderLoadCalculator() {
  const project = getActiveProject();
  if (!project) return el('p', { text: 'No project selected.' });

  const input = toEngineInputs(project).load;
  const result = calculateLoadSchedule(input);
  const loads = project.inputs.load.loads;

  const page = el('div');
  page.appendChild(el('div.page-head', null, [
    el('h1.page-title', { text: 'Load Calculator' }),
    el('p.page-desc', {
      text: 'Build the load schedule. Connected load, maximum demand and the 24-hour '
        + 'running load are reported separately — they are different quantities and '
        + 'sizing against the wrong one is the usual cause of an oversized supply.',
    }),
  ]));

  // ---- System ----
  page.appendChild(card({ title: 'System' }, [
    el('div.form-grid', null, [
      field({ label: 'System voltage', hint: 'Pakistani LV defaults: 230 V single phase, 400 V three phase.' },
        select({
          value: `${project.inputs.load.systemVoltage}-${project.inputs.load.systemPhases}`,
          options: SYSTEM_VOLTAGES.map((v) => ({ value: v.key, label: v.label })),
          onChange: (key) => {
            const v = SYSTEM_VOLTAGES.find((s) => s.key === key);
            if (!v) return;
            updateActiveProject((p) => {
              p.inputs.load.systemVoltage = v.volts;
              p.inputs.load.systemPhases = v.phases;
              p.inputs.cable.cores = v.phases === 3 ? 4 : 2;
            });
          },
        })),
      field({
        label: 'Custom voltage',
        hint: 'Overrides the selection above.',
        error: fieldError(result.issues, 'systemVoltage'),
      }, numberInput({
        value: project.inputs.load.systemVoltage,
        min: 0,
        suffix: 'V',
        invalid: Boolean(fieldError(result.issues, 'systemVoltage')),
        onInput: (v) => setField('inputs.load.systemVoltage', v),
      })),
      field({ label: 'Phases' }, segmented({
        value: project.inputs.load.systemPhases,
        options: [{ value: 1, label: 'Single phase' }, { value: 3, label: 'Three phase' }],
        onChange: (v) => updateActiveProject((p) => {
          p.inputs.load.systemPhases = Number(v);
          p.inputs.cable.cores = Number(v) === 3 ? 4 : 2;
        }),
      })),
      field({
        label: 'Overall diversity factor',
        hint: 'Applied to the whole installation, after each item\'s own factor.',
        error: fieldError(result.issues, 'overallDiversity'),
      }, numberInput({
        value: project.inputs.load.overallDiversity,
        step: 0.05, min: 0, max: 1,
        invalid: Boolean(fieldError(result.issues, 'overallDiversity')),
        onInput: (v) => setField('inputs.load.overallDiversity', v),
      })),
      field({
        label: 'Spare capacity for future load',
        hint: 'Added to the maximum demand.',
        error: fieldError(result.issues, 'spareCapacityPercent'),
      }, numberInput({
        value: project.inputs.load.spareCapacityPercent,
        step: 5, min: 0, suffix: '%',
        invalid: Boolean(fieldError(result.issues, 'spareCapacityPercent')),
        onInput: (v) => setField('inputs.load.spareCapacityPercent', v),
      })),
    ]),
  ]));

  // ---- Load schedule ----
  const headers = ['#', 'Load', 'Category', { label: 'Qty', align: 'right' },
    { label: 'Rated', align: 'right' }, 'Unit', 'Phase', { label: 'PF', align: 'right' },
    { label: 'Diversity', align: 'right' }, { label: 'h/day', align: 'right' },
    { label: 'Connected kW', align: 'right' }, { label: 'Demand kW', align: 'right' },
    { label: 'Current A', align: 'right' }, { label: 'kWh/day', align: 'right' }, ''];

  const rows = loads.map((item, index) => {
    const calc = result.items.find((r) => r.item.id === item.id);
    const set = (prop, value) => updateActiveProject((p) => {
      p.inputs.load.loads[index][prop] = value;
    });

    return [
      el('td', { text: String(index + 1) }),
      el('td.cell-input', null, textInput({
        value: item.name, placeholder: 'Load name',
        onInput: (v) => set('name', v),
      })),
      el('td.cell-input', null, select({
        value: item.category,
        options: CATEGORY_OPTIONS,
        onChange: (v) => updateActiveProject((p) => {
          const preset = EQUIPMENT_CATEGORIES.find((c) => c.key === v);
          const row = p.inputs.load.loads[index];
          row.category = v;
          // Carry the category's typical values across, which the user can override.
          if (preset) {
            row.powerFactor = preset.defaultPf;
            row.diversityFactor = preset.defaultDiversity;
            row.hoursPerDay = preset.defaultHours;
          }
        }),
      })),
      el('td.cell-input.num', null, numberInput({
        value: item.quantity, min: 1, step: 1,
        invalid: Boolean(rowError(result.issues, index, 'quantity')),
        onInput: (v) => set('quantity', v),
      })),
      el('td.cell-input.num', null, numberInput({
        value: item.ratedPower, min: 0,
        invalid: Boolean(rowError(result.issues, index, 'ratedPower')),
        onInput: (v) => set('ratedPower', v),
      })),
      el('td.cell-input', null, select({
        value: item.unit, options: UNIT_OPTIONS, onChange: (v) => set('unit', v),
      })),
      el('td.cell-input', null, select({
        value: item.phase,
        options: [{ value: 1, label: '1-ph' }, { value: 3, label: '3-ph' }],
        onChange: (v) => set('phase', Number(v)),
      })),
      el('td.cell-input.num', null, numberInput({
        value: item.powerFactor, step: 0.01, min: 0, max: 1,
        invalid: Boolean(rowError(result.issues, index, 'powerFactor')),
        onInput: (v) => set('powerFactor', v),
      })),
      el('td.cell-input.num', null, numberInput({
        value: item.diversityFactor, step: 0.05, min: 0, max: 1,
        invalid: Boolean(rowError(result.issues, index, 'diversityFactor')),
        onInput: (v) => set('diversityFactor', v),
      })),
      el('td.cell-input.num', null, numberInput({
        value: item.hoursPerDay, step: 0.5, min: 0, max: 24,
        invalid: Boolean(rowError(result.issues, index, 'hoursPerDay')),
        onInput: (v) => set('hoursPerDay', v),
      })),
      el('td.num', { text: calc ? fmt(calc.connectedKW, 3) : '—' }),
      el('td.num', { text: calc ? fmt(calc.demandKW, 3) : '—' }),
      el('td.num', { text: calc ? fmt(calc.currentA, 1) : '—' }),
      el('td.num', { text: calc ? fmt(calc.dailyEnergyKWh, 1) : '—' }),
      el('td', null, el('div.row-actions', null, [
        button({
          label: '⧉', small: true, variant: 'subtle', title: 'Duplicate this row',
          onClick: () => updateActiveProject((p) => {
            const copy = { ...p.inputs.load.loads[index], id: `load_${Math.random().toString(36).slice(2, 10)}` };
            p.inputs.load.loads.splice(index + 1, 0, copy);
          }),
        }),
        button({
          label: '✕', small: true, variant: 'danger', title: 'Remove this row',
          onClick: () => updateActiveProject((p) => { p.inputs.load.loads.splice(index, 1); }),
        }),
      ])),
    ];
  });

  page.appendChild(card({
    title: 'Load schedule',
    subtitle: `${loads.length} load${loads.length === 1 ? '' : 's'}. Selecting a category fills in typical power factor, diversity and running hours — override any of them.`,
    actions: [
      button({
        label: '+ Add load', variant: 'primary', small: true,
        onClick: () => updateActiveProject((p) => { p.inputs.load.loads.push(createLoadItem()); }),
      }),
      loads.length
        ? button({
          label: 'Clear all', variant: 'danger', small: true,
          onClick: () => {
            if (confirm('Remove every load from this schedule?')) {
              updateActiveProject((p) => { p.inputs.load.loads = []; });
            }
          },
        })
        : null,
    ].filter(Boolean),
  }, [
    table({ headers, rows, empty: 'No loads yet. Add the first one to start the schedule.' }),
  ]));

  // ---- Results ----
  const errorIssues = result.issues.filter((i) => i.level === 'error');
  const resultBody = [];
  if (errorIssues.length) resultBody.push(issueList(result.issues));
  else {
    resultBody.push(el('div.stat-grid', null, [
      stat({ label: 'Connected load', value: fmt(result.connectedLoadKW, 2), unit: 'kW', note: 'Everything installed, no diversity' }),
      stat({ label: 'Maximum demand', value: fmt(result.maximumDemandKW, 2), unit: 'kW', tone: 'accent', note: 'Size the supply on this' }),
      stat({ label: 'Running load', value: fmt(result.runningLoadKW, 2), unit: 'kW', note: '24-hour average, not a peak' }),
      stat({ label: 'Demand current', value: fmt(result.demandCurrentA, 1), unit: 'A', note: input.systemPhases === 3 ? 'I = P / (√3 × V × PF)' : 'I = P / (V × PF)' }),
      stat({ label: 'Power factor', value: fmt(result.overallPowerFactor, 3), note: 'Total kW ÷ total kVA' }),
      stat({ label: 'Apparent demand', value: fmt(result.maximumDemandKVA, 2), unit: 'kVA' }),
      stat({ label: 'Reactive demand', value: fmt(result.maximumDemandKVAr, 2), unit: 'kVAr' }),
      stat({ label: 'Daily energy', value: fmt(result.dailyEnergyKWh, 1), unit: 'kWh' }),
    ]));

    resultBody.push(el('div.divider'));
    resultBody.push(el('div.section-label', { text: 'Demand by load' }));
    resultBody.push(barChart(
      result.items
        .map((i) => ({ label: i.item.name || '(unnamed)', value: i.demandKW }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12),
      { unit: 'kW', decimals: 2 },
    ));

    const single = result.singlePhaseDemandKW;
    const three = result.threePhaseDemandKW;
    if (single > 0 && three > 0) {
      resultBody.push(el('p.note', {
        text: `${fmt(single, 2)} kW of single-phase load and ${fmt(three, 2)} kW of three-phase load. `
          + 'Single-phase loads are assumed balanced across the three phases — check the actual '
          + 'phase allocation on the distribution board schedule.',
      }));
    }
  }

  resultBody.push(detailsList('Engineering assumptions', result.assumptions));
  resultBody.push(disclaimer());

  page.appendChild(card({ title: 'Results' }, resultBody));

  const warnings = result.issues.filter((i) => i.level === 'warning');
  if (warnings.length && !errorIssues.length) {
    page.appendChild(issueList(warnings));
  }

  return page;
}
