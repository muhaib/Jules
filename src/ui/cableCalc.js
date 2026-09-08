/**
 * Cable Calculator view.
 * @module ui/cableCalc
 */

import {
  el, card, field, numberInput, select, segmented, stat, table,
  issueList, disclaimer, detailsList, fmt,
} from './components.js';
import { getActiveProject, setField, toEngineInputs } from '../store.js';
import { calculateCable } from '../engine/cable.js';
import { calculateLoadSchedule } from '../engine/load.js';
import {
  MATERIAL_FACTORS, INSULATION_TYPES, INSTALLATION_METHODS, VOLTAGE_DROP_LIMITS,
} from '../engine/constants.js';

const fieldError = (issues, key) =>
  issues.find((i) => i.level === 'error' && i.field === key)?.message;

/** @returns {HTMLElement} */
export function renderCableCalculator() {
  const project = getActiveProject();
  if (!project) return el('p', { text: 'No project selected.' });

  const engineInputs = toEngineInputs(project);
  const load = calculateLoadSchedule(engineInputs.load);
  const c = project.inputs.cable;

  // In 'load' mode the design current comes straight from the load schedule.
  const cableInput = {
    ...engineInputs.cable,
    powerFactor: Number.isFinite(load.overallPowerFactor) ? load.overallPowerFactor : 0.9,
    ...(c.source === 'load' ? { loadKW: load.maximumDemandKW } : {}),
  };
  const r = calculateCable(cableInput);
  const issues = r.issues;

  const page = el('div');
  page.appendChild(el('div.page-head', null, [
    el('h1.page-title', { text: 'Cable Calculator' }),
    el('p.page-desc', {
      text: 'Sizes the conductor for both heating and voltage drop, and takes the larger of '
        + 'the two. The cable is sized to carry the protective device rating, not merely the '
        + 'design current, so that the protection actually protects the cable.',
    }),
  ]));

  // ---- Load source ----
  page.appendChild(card({ title: 'Load' }, [
    el('div.form-grid', null, [
      field({ label: 'Design current from', wide: true }, segmented({
        value: c.source,
        options: [
          { value: 'load', label: 'Load schedule' },
          { value: 'manualKw', label: 'Enter kW' },
          { value: 'manual', label: 'Enter amperes' },
        ],
        onChange: (v) => setField('inputs.cable.source', v),
      })),
      c.source === 'load'
        ? field({
          label: 'Maximum demand (from Load Calculator)',
          hint: `Power factor ${fmt(cableInput.powerFactor, 3)} taken from the same schedule.`,
        }, numberInput({ value: fmt(load.maximumDemandKW, 2), disabled: true, onInput: () => {}, suffix: 'kW' }))
        : null,
      c.source === 'manualKw'
        ? field({ label: 'Load', error: fieldError(issues, 'loadKW') },
          numberInput({
            value: c.loadKW, min: 0, suffix: 'kW',
            invalid: Boolean(fieldError(issues, 'loadKW')),
            onInput: (v) => setField('inputs.cable.loadKW', v),
          }))
        : null,
      c.source === 'manual'
        ? field({ label: 'Design current', error: fieldError(issues, 'currentA') },
          numberInput({
            value: c.currentA, min: 0, suffix: 'A',
            invalid: Boolean(fieldError(issues, 'currentA')),
            onInput: (v) => setField('inputs.cable.currentA', v),
          }))
        : null,
      field({
        label: 'System',
        hint: 'Set on the Load Calculator page.',
      }, numberInput({
        value: `${project.inputs.load.systemVoltage} V, ${project.inputs.load.systemPhases}-phase`,
        disabled: true, onInput: () => {},
      })),
    ].filter(Boolean)),
  ]));

  // ---- Cable and installation ----
  page.appendChild(card({ title: 'Cable and installation' }, [
    el('div.form-grid', null, [
      field({ label: 'Conductor material' }, select({
        value: c.material,
        options: Object.values(MATERIAL_FACTORS).map((m) => ({ value: m.key, label: m.label })),
        onChange: (v) => setField('inputs.cable.material', v),
      })),
      field({ label: 'Insulation / cable type' }, select({
        value: c.insulation,
        options: Object.values(INSULATION_TYPES).map((i) => ({ value: i.key, label: i.label })),
        onChange: (v) => setField('inputs.cable.insulation', v),
      })),
      field({
        label: 'Number of cores',
        hint: 'The ampacity column is chosen by the number of LOADED conductors, which follows the phase setting.',
      }, select({
        value: c.cores,
        options: [
          { value: 2, label: '2 core (1-ph)' },
          { value: 3, label: '3 core' },
          { value: 4, label: '4 core (3P + N)' },
          { value: 5, label: '5 core (3P + N + E)' },
        ],
        onChange: (v) => setField('inputs.cable.cores', Number(v)),
      })),
      field({ label: 'Installation method', wide: true }, select({
        value: c.installationMethod,
        options: Object.values(INSTALLATION_METHODS).map((m) => ({ value: m.key, label: m.label })),
        onChange: (v) => setField('inputs.cable.installationMethod', v),
      })),
      field({ label: 'Route length (one way)', error: fieldError(issues, 'lengthM') },
        numberInput({
          value: c.lengthM, min: 0, suffix: 'm',
          invalid: Boolean(fieldError(issues, 'lengthM')),
          onInput: (v) => setField('inputs.cable.lengthM', v),
        })),
      field({
        label: 'Ambient temperature',
        hint: 'Pakistani plant rooms and roof voids routinely exceed 45 °C in summer.',
        error: fieldError(issues, 'ambientC'),
      }, numberInput({
        value: c.ambientC, min: -20, max: 90, suffix: '°C',
        invalid: Boolean(fieldError(issues, 'ambientC')),
        onInput: (v) => setField('inputs.cable.ambientC', v),
      })),
      field({
        label: 'Circuits in the group',
        hint: 'Cables bunched together derate each other.',
        error: fieldError(issues, 'groupedCircuits'),
      }, numberInput({
        value: c.groupedCircuits, min: 1, step: 1,
        invalid: Boolean(fieldError(issues, 'groupedCircuits')),
        onInput: (v) => setField('inputs.cable.groupedCircuits', v),
      })),
      field({
        label: 'Further derating factor',
        hint: 'Any additional factor, e.g. thermal insulation or buried-in-duct.',
        error: fieldError(issues, 'derateOther'),
      }, numberInput({
        value: c.derateOther, min: 0.1, max: 1, step: 0.05,
        invalid: Boolean(fieldError(issues, 'derateOther')),
        onInput: (v) => setField('inputs.cable.derateOther', v),
      })),
      field({ label: 'Parallel runs per phase', error: fieldError(issues, 'parallelRuns') },
        numberInput({
          value: c.parallelRuns, min: 1, step: 1,
          invalid: Boolean(fieldError(issues, 'parallelRuns')),
          onInput: (v) => setField('inputs.cable.parallelRuns', v),
        })),
      field({ label: 'Voltage drop limit', error: fieldError(issues, 'voltageDropLimitPercent') }, el('div', null, [
        numberInput({
          value: c.voltageDropLimitPercent, min: 0.1, max: 25, step: 0.5, suffix: '%',
          invalid: Boolean(fieldError(issues, 'voltageDropLimitPercent')),
          onInput: (v) => setField('inputs.cable.voltageDropLimitPercent', v),
        }),
        el('div.pill-row', { style: { marginTop: '6px' } },
          Object.values(VOLTAGE_DROP_LIMITS).map((l) => el('button.btn.btn-sm.btn-subtle', {
            type: 'button',
            text: `${l.label} ${l.percent}%`,
            onClick: () => setField('inputs.cable.voltageDropLimitPercent', l.percent),
          }))),
      ])),
    ]),
  ]));

  // ---- Results ----
  const body = [];
  if (issues.some((i) => i.level === 'error')) {
    body.push(issueList(issues));
  } else {
    body.push(el('div.stat-grid', null, [
      stat({ label: 'Design current (Ib)', value: fmt(r.designCurrentA, 1), unit: 'A' }),
      stat({
        label: 'Protective device (In)',
        value: r.breaker.ratingA === null ? '—' : String(r.breaker.ratingA),
        unit: r.breaker.type ? `A ${r.breaker.type}` : 'A',
      }),
      stat({
        label: 'Recommended conductor',
        value: r.recommendedSizeMm2 === null ? '—' : String(r.recommendedSizeMm2),
        unit: 'mm²',
        tone: 'accent',
        note: r.governedBy ? `Governed by ${r.governedBy}` : undefined,
      }),
      stat({
        label: 'Derated capacity',
        value: fmt(r.recommendedRatingA, 1),
        unit: 'A',
        note: `Ca ${fmt(r.ambientFactor, 2)} × Cg ${fmt(r.groupingFactor, 2)} × ${fmt(r.otherFactor, 2)}`,
      }),
      stat({ label: 'Voltage drop', value: fmt(r.voltageDrop?.dropVolts, 2), unit: 'V' }),
      stat({
        label: 'Voltage drop',
        value: fmt(r.voltageDrop?.dropPercent, 2),
        unit: '%',
        note: `Limit ${c.voltageDropLimitPercent}%`,
      }),
      stat({ label: 'Required tabulated rating', value: fmt(r.requiredTabulatedRatingA, 1), unit: 'A' }),
      stat({ label: 'Conductor loss in the run', value: fmt(r.voltageDrop?.powerLossW, 0), unit: 'W' }),
    ]));

    if (r.thermalSizeMm2 !== null && r.dropSizeMm2 !== null && r.thermalSizeMm2 !== r.dropSizeMm2) {
      const dropGoverns = r.dropSizeMm2 > r.thermalSizeMm2;
      body.push(el('p.note.note-accent', {
        text: dropGoverns
          ? `Heating alone would allow ${r.thermalSizeMm2} mm², but holding the drop within `
            + `${c.voltageDropLimitPercent}% over ${c.lengthM} m needs ${r.dropSizeMm2} mm². `
            + `Voltage drop governs, so ${r.recommendedSizeMm2} mm² is recommended.`
          : `Voltage drop alone would allow ${r.dropSizeMm2} mm² over ${c.lengthM} m, but carrying `
            + `${r.breaker.ratingA ?? '—'} A with the stated derating needs ${r.thermalSizeMm2} mm². `
            + `The thermal check governs, so ${r.recommendedSizeMm2} mm² is recommended.`,
      }));
    }

    body.push(el('div.section-label', { text: 'All standard sizes for these conditions' }));
    body.push(table({
      headers: [
        { label: 'Size mm²', align: 'right' },
        { label: 'Tabulated A', align: 'right' },
        { label: 'Derated A', align: 'right' },
        { label: 'Drop V', align: 'right' },
        { label: 'Drop %', align: 'right' },
        'Thermal', 'Volt drop', 'Verdict',
      ],
      rows: r.candidates.map((cand) => {
        const chosen = cand.csaMm2 === r.recommendedSizeMm2;
        const cells = [
          el('td.num', { text: String(cand.csaMm2) }),
          el('td.num', { text: fmt(cand.baseRatingA, 1) }),
          el('td.num', { text: fmt(cand.deratedRatingA, 1) }),
          el('td.num', { text: fmt(cand.dropVolts, 2) }),
          el('td.num', { text: fmt(cand.dropPercent, 2) }),
          el('td', { text: cand.thermalOk ? 'OK' : 'Too small' }),
          el('td', { text: cand.dropOk ? 'OK' : 'Over limit' }),
          el('td', { text: chosen ? 'Recommended' : (cand.thermalOk && cand.dropOk ? 'Acceptable' : '—') }),
        ];
        if (chosen) cells.forEach((cell) => cell.classList.add('is-chosen'));
        return cells;
      }),
    }));
  }

  body.push(detailsList('Cable selection is NOT complete without checking', r.caveats, { tone: 'warn', open: true }));
  body.push(detailsList('Engineering assumptions', r.assumptions));
  body.push(disclaimer());

  page.appendChild(card({ title: 'Results' }, body));

  const warnings = issues.filter((i) => i.level === 'warning');
  if (warnings.length) page.appendChild(issueList(warnings));

  return page;
}
