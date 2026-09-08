/**
 * Results page — the headline figures, with every assumption behind them.
 * @module ui/results
 */

import {
  el, card, stat, button, table, issueList, disclaimer, detailsList, barChart, fmt,
} from './components.js';
import { getActiveProject, toEngineInputs } from '../store.js';
import { calculateProject } from '../engine/index.js';
import { reportHtml, workbookSheets } from '../export/report.js';
import { createXlsx } from '../export/xlsx.js';
import { printHtml } from '../export/print.js';
import { downloadXlsx, slugify } from '../export/download.js';
import { mToFt } from '../engine/units.js';

/**
 * @param {(route: string) => void} navigate
 * @param {(msg: string) => void} toast
 * @returns {HTMLElement}
 */
export function renderResults(navigate, toast) {
  const project = getActiveProject();
  if (!project) return el('p', { text: 'No project selected.' });

  const r = calculateProject(toEngineInputs(project));
  const boqLines = project.boqLines ?? r.boq.lines;
  const errors = r.issues.filter((i) => i.level === 'error');

  const page = el('div');
  page.appendChild(el('div.page-head', null, [
    el('h1.page-title', { text: 'Results' }),
    el('p.page-desc', {
      text: `${project.name}${project.location ? ` · ${project.location}` : ''}. `
        + 'Every figure is recalculated from the current inputs each time this page is drawn.',
    }),
  ]));

  if (errors.length) {
    page.appendChild(card({ title: 'Inputs need attention' }, [
      issueList(errors),
      el('div.btn-row', null, [
        button({ label: 'Go to Load Calculator', variant: 'primary', onClick: () => navigate('load') }),
        button({ label: 'Go to Solar Calculator', onClick: () => navigate('solar') }),
      ]),
    ]));
    return page;
  }

  // ---- Headline ----
  page.appendChild(card({
    title: 'Headline figures',
    actions: [
      button({
        label: 'Export PDF',
        variant: 'primary',
        small: true,
        onClick: () => {
          printHtml(reportHtml(project, r, boqLines), slugify(project.name));
          toast('Report opened in the print dialog — choose "Save as PDF".');
        },
      }),
      button({
        label: 'Export Excel',
        small: true,
        onClick: () => {
          downloadXlsx(`${slugify(project.name)}-report.xlsx`, createXlsx(workbookSheets(project, r, boqLines)));
          toast('Workbook downloaded.');
        },
      }),
    ],
  }, [
    el('div.stat-grid.stat-grid-wide', null, [
      stat({ label: 'Total connected load', value: fmt(r.load.connectedLoadKW, 1), unit: 'kW', note: 'No diversity applied' }),
      stat({ label: 'Maximum demand', value: fmt(r.load.maximumDemandKW, 1), unit: 'kW', tone: 'accent', note: 'Size the supply on this' }),
      stat({ label: 'Estimated current', value: fmt(r.load.demandCurrentA, 1), unit: 'A', note: `${project.inputs.load.systemVoltage} V, ${project.inputs.load.systemPhases}-phase` }),
      stat({ label: 'Power factor', value: fmt(r.load.overallPowerFactor, 3), note: 'Total kW ÷ total kVA' }),

      stat({ label: 'Solar PV', value: `≈ ${fmt(r.solar.requiredPvKWp, 1)}`, unit: 'kWp', tone: 'accent', note: 'Required capacity' }),
      stat({ label: 'Panels', value: `≈ ${r.panels.panelCount}`, unit: `× ${Math.round((r.panels.installedCapacityKWp * 1000) / Math.max(1, r.panels.panelCount))} W`, note: `${fmt(r.panels.installedCapacityKWp, 2)} kWp installed` }),
      stat({ label: 'Rooftop area', value: `≈ ${fmt(r.panels.grossAreaSqft, 0)}`, unit: 'sq ft', note: `${fmt(r.panels.grossAreaSqm, 0)} m² gross` }),
      stat({ label: 'Inverter', value: `≈ ${r.inverter.recommendedKW}`, unit: 'kW', note: `Range ${r.inverter.rangeLabel}` }),

      stat({ label: 'Daily generation', value: `≈ ${fmt(r.solar.dailyGenerationKWh, 0)}`, unit: 'kWh', note: 'Annual average day' }),
      stat({ label: 'Monthly generation', value: `≈ ${fmt(r.solar.monthlyGenerationKWh, 0)}`, unit: 'kWh' }),
      stat({ label: 'Monthly saving', value: `≈ ${fmt(r.solar.monthlySavingsPkr, 0)}`, unit: 'PKR', note: `At PKR ${project.inputs.solar.tariffPkrPerKwh}/kWh` }),
      stat({ label: 'Main cable', value: r.cable.recommendedSizeMm2 ? String(r.cable.recommendedSizeMm2) : '—', unit: 'mm²', note: r.cable.breaker.ratingA ? `${r.cable.breaker.ratingA} A ${r.cable.breaker.type}` : undefined }),
    ]),
    disclaimer(),
  ]));

  // ---- Load detail ----
  page.appendChild(card({
    title: 'Load',
    actions: [button({ label: 'Edit', variant: 'ghost', small: true, onClick: () => navigate('load') })],
  }, [
    el('div.stat-grid', null, [
      stat({ label: 'Connected load', value: fmt(r.load.connectedLoadKW, 2), unit: 'kW' }),
      stat({ label: 'Maximum demand', value: fmt(r.load.maximumDemandKW, 2), unit: 'kW' }),
      stat({ label: 'Running load (24 h avg)', value: fmt(r.load.runningLoadKW, 2), unit: 'kW' }),
      stat({ label: 'Apparent demand', value: fmt(r.load.maximumDemandKVA, 2), unit: 'kVA' }),
      stat({ label: 'Daily energy', value: fmt(r.load.dailyEnergyKWh, 1), unit: 'kWh' }),
      stat({ label: 'Monthly energy', value: fmt(r.load.monthlyEnergyKWh, 0), unit: 'kWh' }),
    ]),
    r.load.items.length
      ? el('div', null, [
        el('div.section-label', { text: 'Demand by load' }),
        barChart(
          r.load.items.map((i) => ({ label: i.item.name || '(unnamed)', value: i.demandKW }))
            .sort((a, b) => b.value - a.value).slice(0, 10),
          { unit: 'kW', decimals: 2 },
        ),
      ])
      : null,
  ]));

  // ---- Cable detail ----
  page.appendChild(card({
    title: 'Main cable and protection',
    actions: [button({ label: 'Edit', variant: 'ghost', small: true, onClick: () => navigate('cable') })],
  }, [
    table({
      headers: ['Quantity', { label: 'Value', align: 'right' }],
      rows: [
        ['Design current (Ib)', `${fmt(r.cable.designCurrentA, 1)} A`],
        ['Protective device (In)', r.cable.breaker.ratingA ? `${r.cable.breaker.ratingA} A ${r.cable.breaker.type}` : '—'],
        ['Total derating (Ca × Cg × Ci)', fmt(r.cable.totalDerating, 3)],
        ['Required tabulated rating (It)', `${fmt(r.cable.requiredTabulatedRatingA, 1)} A`],
        ['Recommended conductor', r.cable.recommendedSizeMm2 ? `${r.cable.recommendedSizeMm2} mm²` : '—'],
        ['Sizing governed by', r.cable.governedBy ?? '—'],
        ['Voltage drop', `${fmt(r.cable.voltageDrop?.dropVolts, 2)} V (${fmt(r.cable.voltageDrop?.dropPercent, 2)} %)`],
      ].map(([a, b]) => [el('td', { text: a }), el('td.num', { text: b })]),
    }),
    detailsList('Cable selection is NOT complete without checking', r.cable.caveats, { tone: 'warn' }),
  ]));

  // ---- Solar detail ----
  page.appendChild(card({
    title: 'Solar PV',
    actions: [button({ label: 'Edit', variant: 'ghost', small: true, onClick: () => navigate('solar') })],
  }, [
    table({
      headers: ['Quantity', { label: 'Value', align: 'right' }],
      rows: [
        ['Sizing mode', r.solar.mode === 'instantaneous' ? 'A — instantaneous daytime load' : 'B — daily energy'],
        ['Peak sun hours', `${fmt(r.solar.peakSunHours, 2)} kWh/m²/day`],
        ['System efficiency', `${fmt(r.solar.systemEfficiency * 100, 1)} %`],
        ['Required PV capacity', `${fmt(r.solar.requiredPvKWp, 2)} kWp`],
        ['Modules', `${r.panels.panelCount} No.`],
        ['Installed capacity', `${fmt(r.panels.installedCapacityKWp, 2)} kWp`],
        ['Module glass area', `${fmt(r.panels.moduleFootprintSqm, 1)} m²`],
        ['Gross array area', `${fmt(r.panels.grossAreaSqm, 1)} m² · ${fmt(r.panels.grossAreaSqft, 0)} sq ft`],
        ['Minimum row pitch', `${fmt(r.panels.rowPitchM, 2)} m · ${fmt(mToFt(r.panels.rowPitchM), 2)} ft`],
        ['Inverter range', r.inverter.rangeLabel],
        ['Nearest standard inverter', `${r.inverter.recommendedKW} kW (DC/AC ${fmt(r.inverter.actualDcAcRatio, 2)})`],
        ['Specific yield', `${fmt(r.solar.specificYieldKWhPerKWpYear, 0)} kWh/kWp/year`],
        ['Annual generation', `${fmt(r.solar.annualGenerationKWh, 0)} kWh`],
        ['Annual saving', `PKR ${fmt(r.solar.annualSavingsPkr, 0)}`],
      ].map(([a, b]) => [el('td', { text: a }), el('td.num', { text: b })]),
    }),
    detailsList('Solar yield caveats', r.solar.caveats, { tone: 'warn' }),
    detailsList('Final inverter selection depends on', r.inverter.caveats, { tone: 'warn' }),
  ]));

  // ---- Assumptions ----
  page.appendChild(card({
    title: 'Engineering assumptions',
    subtitle: 'Every assumption used to produce the figures above, in calculation order.',
  }, [
    el('ol.assumption-list', null, r.assumptions.map((a) => el('li', { text: a }))),
    disclaimer(),
  ]));

  const warnings = r.issues.filter((i) => i.level === 'warning');
  if (warnings.length) page.appendChild(issueList(warnings));

  page.appendChild(el('div.btn-row.no-print', null, [
    button({ label: 'Generate BOQ', variant: 'primary', onClick: () => navigate('boq') }),
    button({ label: 'Back to dashboard', onClick: () => navigate('dashboard') }),
  ]));

  return page;
}
