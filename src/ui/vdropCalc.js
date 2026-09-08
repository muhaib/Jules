/**
 * Standalone Voltage Drop Calculator.
 *
 * Kept separate from the cable calculator because engineers routinely need to
 * check the drop on a cable size that has already been chosen — for an existing
 * installation, a submain, or a DC string run — without re-running a selection.
 * @module ui/vdropCalc
 */

import {
  el, card, field, numberInput, select, segmented, stat, table,
  disclaimer, detailsList, fmt,
} from './components.js';
import { getActiveProject, setField, updateActiveProject } from '../store.js';
import { calculateVoltageDrop } from '../engine/voltagedrop.js';
import {
  CABLE_SIZES_MM2, MATERIAL_FACTORS, INSULATION_TYPES,
  DEFAULT_REACTANCE_OHM_PER_M, VOLTAGE_DROP_LIMITS,
} from '../engine/constants.js';

/** Defaults for the standalone tool, stored on the project so they persist. */
function ensureState(project) {
  if (!project.inputs.vdrop) {
    updateActiveProject((p) => {
      p.inputs.vdrop = {
        currentA: 69,
        lengthM: 50,
        csaMm2: 25,
        material: 'copper',
        insulation: 'pvc',
        phases: project.inputs.load.systemPhases,
        voltage: project.inputs.load.systemVoltage,
        powerFactor: 0.9,
        parallelRuns: 1,
        reactanceMilliOhmPerM: DEFAULT_REACTANCE_OHM_PER_M * 1000,
        limitPercent: 3,
      };
    });
    return null;
  }
  return project.inputs.vdrop;
}

/** @returns {HTMLElement} */
export function renderVoltageDropCalculator() {
  const project = getActiveProject();
  if (!project) return el('p', { text: 'No project selected.' });

  const v = ensureState(project);
  if (!v) return el('div'); // A re-render follows immediately from the store update.

  const num = (x) => Number(x);
  const valid = num(v.voltage) > 0 && num(v.powerFactor) > 0 && num(v.powerFactor) <= 1
    && num(v.lengthM) >= 0 && num(v.csaMm2) > 0 && num(v.parallelRuns) >= 1;

  const input = {
    currentA: num(v.currentA),
    lengthM: num(v.lengthM),
    csaMm2: num(v.csaMm2),
    material: v.material,
    phases: num(v.phases) === 3 ? 3 : 1,
    voltage: num(v.voltage),
    powerFactor: num(v.powerFactor),
    insulation: v.insulation,
    parallelRuns: num(v.parallelRuns),
    reactancePerMetre: num(v.reactanceMilliOhmPerM) / 1000,
  };

  const r = valid ? calculateVoltageDrop(input) : null;
  const set = (key) => (value) => setField(`inputs.vdrop.${key}`, value);

  const page = el('div');
  page.appendChild(el('div.page-head', null, [
    el('h1.page-title', { text: 'Voltage Drop Calculator' }),
    el('p.page-desc', {
      text: 'Checks the drop on a conductor size you have already chosen. Resistance is '
        + 'computed from the conductor material at its operating temperature rather than '
        + 'read from a mV/A/m table, so every term is visible and adjustable.',
    }),
  ]));

  page.appendChild(card({ title: 'Circuit' }, [
    el('div.form-grid', null, [
      field({ label: 'Phases' }, segmented({
        value: v.phases,
        options: [{ value: 1, label: 'Single phase' }, { value: 3, label: 'Three phase' }],
        onChange: (x) => setField('inputs.vdrop.phases', Number(x)),
      })),
      field({
        label: 'Nominal voltage',
        hint: input.phases === 3 ? 'Line to line.' : 'Line to neutral.',
      }, numberInput({
        value: v.voltage, min: 1, suffix: 'V', invalid: !(num(v.voltage) > 0), onInput: set('voltage'),
      })),
      field({ label: 'Current' }, numberInput({
        value: v.currentA, min: 0, suffix: 'A', onInput: set('currentA'),
      })),
      field({ label: 'Power factor' }, numberInput({
        value: v.powerFactor, min: 0.01, max: 1, step: 0.01,
        invalid: !(num(v.powerFactor) > 0 && num(v.powerFactor) <= 1),
        onInput: set('powerFactor'),
      })),
      field({ label: 'Route length (one way)' }, numberInput({
        value: v.lengthM, min: 0, suffix: 'm',
        invalid: !(num(v.lengthM) >= 0), onInput: set('lengthM'),
      })),
      field({ label: 'Conductor size' }, select({
        value: v.csaMm2,
        options: CABLE_SIZES_MM2.map((s) => ({ value: s, label: `${s} mm²` })),
        onChange: set('csaMm2'),
      })),
      field({ label: 'Conductor material' }, select({
        value: v.material,
        options: Object.values(MATERIAL_FACTORS).map((m) => ({ value: m.key, label: m.label })),
        onChange: set('material'),
      })),
      field({
        label: 'Insulation',
        hint: 'Sets the assumed conductor operating temperature.',
      }, select({
        value: v.insulation,
        options: Object.values(INSULATION_TYPES).map((i) => ({ value: i.key, label: i.label })),
        onChange: set('insulation'),
      })),
      field({ label: 'Parallel runs per phase' }, numberInput({
        value: v.parallelRuns, min: 1, step: 1, onInput: set('parallelRuns'),
      })),
      field({
        label: 'Conductor reactance',
        hint: 'Spacing-dependent. The default suits multicore LV cable; single-core spaced runs are higher.',
      }, numberInput({
        value: v.reactanceMilliOhmPerM, min: 0, step: 0.01, suffix: 'mΩ/m',
        onInput: set('reactanceMilliOhmPerM'),
      })),
      field({ label: 'Limit to check against' }, el('div', null, [
        numberInput({
          value: v.limitPercent, min: 0.1, max: 25, step: 0.5, suffix: '%',
          onInput: set('limitPercent'),
        }),
        el('div.pill-row', { style: { marginTop: '6px' } },
          Object.values(VOLTAGE_DROP_LIMITS).map((l) => el('button.btn.btn-sm.btn-subtle', {
            type: 'button', text: `${l.label} ${l.percent}%`,
            onClick: () => setField('inputs.vdrop.limitPercent', l.percent),
          }))),
      ])),
    ]),
  ]));

  const body = [];
  if (!r) {
    body.push(el('p.note', { text: 'Enter a positive voltage, a power factor within (0, 1] and a non-negative length.' }));
  } else {
    const within = r.dropPercent <= num(v.limitPercent);
    body.push(el('div.stat-grid', null, [
      stat({ label: 'Voltage drop', value: fmt(r.dropVolts, 2), unit: 'V', tone: 'accent' }),
      stat({
        label: 'Drop as a percentage',
        value: fmt(r.dropPercent, 2),
        unit: '%',
        note: within ? `Within the ${v.limitPercent}% limit` : `EXCEEDS the ${v.limitPercent}% limit`,
      }),
      stat({ label: 'Voltage at the load', value: fmt(r.voltageAtLoad, 1), unit: 'V' }),
      stat({ label: 'Conductor loss', value: fmt(r.powerLossW, 0), unit: 'W' }),
    ]));

    body.push(el('div.section-label', { text: 'Working' }));
    body.push(table({
      headers: ['Term', { label: 'Value', align: 'right' }],
      rows: [
        [el('td', { text: 'Formula' }), el('td.num', { text: r.formula })],
        [el('td', { text: 'Assumed conductor temperature' }), el('td.num', { text: `${r.conductorTempC} °C` })],
        [el('td', { text: 'Resistance per metre (R)' }), el('td.num', { text: `${(r.resistancePerMetre * 1000).toFixed(4)} mΩ/m` })],
        [el('td', { text: 'Reactance per metre (X)' }), el('td.num', { text: `${(r.reactancePerMetre * 1000).toFixed(4)} mΩ/m` })],
        [el('td', { text: 'R·cosφ + X·sinφ' }), el('td.num', { text: `${((r.resistancePerMetre * input.powerFactor + r.reactancePerMetre * Math.sqrt(1 - input.powerFactor ** 2)) * 1000).toFixed(4)} mΩ/m` })],
        [el('td', { text: 'Permitted drop at the stated limit' }), el('td.num', { text: `${fmt((num(v.limitPercent) / 100) * input.voltage, 2)} V` })],
      ],
    }));

    body.push(el('div.section-label', { text: 'Drop across every standard size, same conditions' }));
    body.push(table({
      headers: [{ label: 'Size mm²', align: 'right' }, { label: 'Drop V', align: 'right' }, { label: 'Drop %', align: 'right' }, 'Within limit'],
      rows: CABLE_SIZES_MM2.map((size) => {
        const row = calculateVoltageDrop({ ...input, csaMm2: size });
        return [
          el('td.num', { text: String(size) }),
          el('td.num', { text: fmt(row.dropVolts, 2) }),
          el('td.num', { text: fmt(row.dropPercent, 2) }),
          el('td', { text: row.dropPercent <= num(v.limitPercent) ? 'Yes' : 'No' }),
        ];
      }),
    }));

    body.push(detailsList('Engineering assumptions', [
      `${r.formula}, where L is the one-way route length.`,
      `Conductor resistance from ρ₂₀ × [1 + α(θ − 20)] ÷ A, at θ = ${r.conductorTempC} °C for ${INSULATION_TYPES[v.insulation].label}.`,
      `${MATERIAL_FACTORS[v.material].label}: ρ₂₀ = ${MATERIAL_FACTORS[v.material].rho20} Ω·mm²/m, α = ${MATERIAL_FACTORS[v.material].alpha} per °C.`,
      `Reactance taken as ${v.reactanceMilliOhmPerM} mΩ/m; this depends on conductor spacing and should be taken from the cable datasheet for a critical run.`,
      input.parallelRuns > 1 ? `${input.parallelRuns} cables per phase in parallel divide both R and X by ${input.parallelRuns}.` : 'A single cable per phase.',
      'Resistance is taken at the insulation\'s maximum operating temperature, which is the conservative case. A lightly loaded cable runs cooler and drops less.',
      'Any voltage drop already used up upstream of this circuit must be added to this figure before comparing against a whole-installation limit.',
    ]));
  }

  body.push(disclaimer());
  page.appendChild(card({ title: 'Results' }, body));
  return page;
}
