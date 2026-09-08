/**
 * BOQ Generator — generates from the sizing results, then lets the user edit
 * every line and export to Excel, CSV or PDF.
 * @module ui/boqView
 */

import {
  el, card, field, numberInput, textInput, table, button, stat,
  disclaimer, detailsList, fmt,
} from './components.js';
import { getActiveProject, setField, updateActiveProject, toEngineInputs } from '../store.js';
import { calculateProject } from '../engine/index.js';
import { boqTotal } from '../engine/boq.js';
import { boqRows, reportHtml, workbookSheets } from '../export/report.js';
import { createXlsx } from '../export/xlsx.js';
import { toCsvWithBom } from '../export/csv.js';
import { downloadXlsx, downloadCsv, slugify } from '../export/download.js';
import { printHtml } from '../export/print.js';

/**
 * @param {(route: string) => void} navigate
 * @param {(msg: string) => void} toast
 * @returns {HTMLElement}
 */
export function renderBoq(navigate, toast) {
  const project = getActiveProject();
  if (!project) return el('p', { text: 'No project selected.' });

  const r = calculateProject(toEngineInputs(project));
  const generated = r.boq;
  const isEdited = Array.isArray(project.boqLines);
  const lines = isEdited ? project.boqLines : generated.lines;
  const totals = boqTotal(lines);
  const b = project.inputs.boq;

  const page = el('div');
  page.appendChild(el('div.page-head', null, [
    el('h1.page-title', { text: 'BOQ Generator' }),
    el('p.page-desc', {
      text: 'Quantities are derived from the sizing results, not typed in. Each line records '
        + 'the rule that produced its quantity, so a reviewer can change the driver rather '
        + 'than the number.',
    }),
  ]));

  if (r.panels.panelCount === 0) {
    page.appendChild(card({ title: 'Nothing to bill yet' }, [
      el('p', { text: 'Complete the solar sizing first — a BOQ needs a module count.' }),
      button({ label: 'Go to Solar Calculator', variant: 'primary', onClick: () => navigate('solar') }),
    ]));
    return page;
  }

  // ---- Drivers ----
  page.appendChild(card({
    title: 'Quantity drivers',
    subtitle: 'Change these and every derived quantity updates.',
  }, [
    el('div.form-grid', null, [
      field({ label: 'Modules per string', hint: 'Set by the inverter MPPT voltage window.' },
        numberInput({ value: b.modulesPerString, min: 1, step: 1, onInput: (v) => setField('inputs.boq.modulesPerString', v) })),
      field({ label: 'Strings per MPPT' },
        numberInput({ value: b.stringsPerMppt, min: 1, step: 1, onInput: (v) => setField('inputs.boq.stringsPerMppt', v) })),
      field({ label: 'Number of inverters' },
        numberInput({ value: b.inverterCount, min: 1, step: 1, onInput: (v) => setField('inputs.boq.inverterCount', v) })),
      field({ label: 'Average DC run per string', hint: 'One way, array to combiner or inverter.' },
        numberInput({ value: b.dcRunLengthM, min: 0, suffix: 'm', onInput: (v) => setField('inputs.boq.dcRunLengthM', v) })),
      field({ label: 'AC run, inverter to DB' },
        numberInput({ value: b.acRunLengthM, min: 0, suffix: 'm', onInput: (v) => setField('inputs.boq.acRunLengthM', v) })),
      field({ label: 'DC cable size' },
        numberInput({ value: b.dcCableSizeMm2, min: 1, suffix: 'mm²', onInput: (v) => setField('inputs.boq.dcCableSizeMm2', v) })),
      field({ label: 'Earthing cable size' },
        numberInput({ value: b.earthCableSizeMm2, min: 1, suffix: 'mm²', onInput: (v) => setField('inputs.boq.earthCableSizeMm2', v) })),
      field({ label: 'Connector spares' },
        numberInput({ value: b.sparesPercent, min: 0, max: 50, step: 5, suffix: '%', onInput: (v) => setField('inputs.boq.sparesPercent', v) })),
    ]),
    el('div.stat-grid', { style: { marginTop: '14px' } }, [
      stat({ label: 'Installed capacity', value: fmt(generated.summary.installedCapacityKWp, 2), unit: 'kWp' }),
      stat({ label: 'Modules', value: String(generated.summary.panelCount), unit: 'No.' }),
      stat({ label: 'Strings', value: String(generated.summary.strings), note: `${generated.summary.modulesPerString} modules each` }),
      stat({ label: 'MPPT groups', value: String(generated.summary.mpptGroups) }),
    ]),
  ]));

  // ---- Editable BOQ ----
  const startEditing = () => {
    if (isEdited) return;
    updateActiveProject((p) => { p.boqLines = structuredClone(generated.lines); });
  };

  const setLine = (index, prop, value) => {
    startEditing();
    updateActiveProject((p) => {
      if (!Array.isArray(p.boqLines)) p.boqLines = structuredClone(generated.lines);
      p.boqLines[index][prop] = value;
    });
  };

  const rows = lines.map((l, index) => {
    const rate = Number(l.rate);
    const amount = Number.isFinite(rate) && rate > 0 ? rate * Number(l.quantity || 0) : null;
    return [
      el('td', { text: String(index + 1) }),
      el('td.cell-input.wrap', null, [
        textInput({ value: l.item, onInput: (v) => setLine(index, 'item', v) }),
        el('div', { style: { marginTop: '4px' } }, textInput({
          value: l.description, onInput: (v) => setLine(index, 'description', v),
        })),
        l.basis ? el('div.muted', { style: { fontSize: '11px', marginTop: '3px' }, text: `Basis: ${l.basis}` }) : null,
      ]),
      el('td.cell-input.num', null, numberInput({
        value: l.quantity, min: 0, onInput: (v) => setLine(index, 'quantity', Number(v)),
      })),
      el('td.cell-input', null, textInput({ value: l.unit, onInput: (v) => setLine(index, 'unit', v) })),
      el('td.cell-input', null, textInput({
        value: l.brand, placeholder: 'Brand', onInput: (v) => setLine(index, 'brand', v),
      })),
      el('td.cell-input.num', null, numberInput({
        value: l.rate ?? '', min: 0, placeholder: '—',
        onInput: (v) => setLine(index, 'rate', v === '' ? null : Number(v)),
      })),
      el('td.num', { text: amount === null ? '—' : fmt(amount, 0) }),
      el('td.cell-input.wrap', null, textInput({
        value: l.remarks, onInput: (v) => setLine(index, 'remarks', v),
      })),
      el('td', null, button({
        label: '✕', small: true, variant: 'danger', title: 'Remove this line',
        onClick: () => {
          startEditing();
          updateActiveProject((p) => {
            if (!Array.isArray(p.boqLines)) p.boqLines = structuredClone(generated.lines);
            p.boqLines.splice(index, 1);
          });
        },
      })),
    ];
  });

  page.appendChild(card({
    title: 'Bill of quantities',
    subtitle: isEdited
      ? 'Edited. Quantities no longer follow the sizing results until you regenerate.'
      : 'Generated from the sizing results. Editing any cell switches this to a manual list.',
    actions: [
      button({
        label: '+ Add line',
        small: true,
        onClick: () => {
          startEditing();
          updateActiveProject((p) => {
            if (!Array.isArray(p.boqLines)) p.boqLines = structuredClone(generated.lines);
            p.boqLines.push({
              id: `custom_${Date.now().toString(36)}`,
              item: 'New item', description: '', quantity: 1, unit: 'No.',
              brand: '', remarks: '', basis: 'Added manually.', rate: null, userAdded: true,
            });
          });
        },
      }),
      isEdited
        ? button({
          label: 'Regenerate',
          variant: 'danger',
          small: true,
          onClick: () => {
            if (confirm('Discard your edits and regenerate the BOQ from the sizing results?')) {
              updateActiveProject((p) => { p.boqLines = null; });
              toast('BOQ regenerated from the current sizing.');
            }
          },
        })
        : null,
    ].filter(Boolean),
  }, [
    table({
      headers: ['#', 'Item and description', { label: 'Qty', align: 'right' }, 'Unit', 'Brand',
        { label: 'Rate PKR', align: 'right' }, { label: 'Amount PKR', align: 'right' }, 'Remarks', ''],
      rows,
    }),

    el('div.kv-list', { style: { marginTop: '12px' } }, [
      totals.total > 0
        ? el('div.kv-row', null, [
          el('span.kv-label', { text: totals.unpricedLines > 0 ? `Total (${totals.unpricedLines} line(s) still unpriced — incomplete)` : 'Total' }),
          el('span.kv-value', { text: `PKR ${fmt(totals.total, 0)}` }),
        ])
        : el('p.muted', { text: 'No rates entered. Add a rate against a line to build a priced BOQ; leaving them blank exports an unpriced BOQ.' }),
    ]),

    el('div.btn-row', { style: { marginTop: '14px' } }, [
      button({
        label: 'Export Excel (.xlsx)',
        variant: 'primary',
        onClick: () => {
          downloadXlsx(`${slugify(project.name)}-boq.xlsx`, createXlsx(workbookSheets(project, r, lines)));
          toast('Workbook downloaded — BOQ, load schedule, cable table and assumptions.');
        },
      }),
      button({
        label: 'Export CSV',
        onClick: () => {
          const { headers, rows: csvRows } = boqRows(lines, true);
          downloadCsv(`${slugify(project.name)}-boq.csv`, toCsvWithBom([headers, ...csvRows]));
          toast('CSV downloaded.');
        },
      }),
      button({
        label: 'Export PDF',
        onClick: () => {
          printHtml(reportHtml(project, r, lines), `${slugify(project.name)}-report`);
          toast('Report opened in the print dialog — choose "Save as PDF".');
        },
      }),
    ]),

    el('p.note', {
      style: { marginTop: '12px' },
      text: 'PDF export uses your browser\'s print dialog: choose "Save as PDF" as the '
        + 'destination. That keeps the app dependency-free and gives better pagination than '
        + 'a hand-rolled PDF writer.',
    }),

    detailsList('Notes and exclusions', generated.notes, { open: true }),
    disclaimer(),
  ]));

  return page;
}
