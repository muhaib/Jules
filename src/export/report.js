/**
 * Builds export payloads (spreadsheet rows and a printable HTML report) from a
 * project and its calculation results.
 *
 * Pure — no DOM — so the shape of every export can be asserted in tests.
 * @module export/report
 */

import { round } from '../engine/units.js';
import { ENGINEERING_DISCLAIMER } from '../engine/constants.js';
import { boqTotal } from '../engine/boq.js';

const n = (v, d = 2) => (Number.isFinite(v) ? round(v, d) : '');

/**
 * BOQ rows for a spreadsheet or CSV export.
 * @param {import('../engine/boq.js').BoqLine[]} lines
 * @param {boolean} includeRates
 * @returns {{ headers: string[], rows: Array<Array<string|number>> }}
 */
export function boqRows(lines, includeRates = true) {
  const headers = ['S.No', 'Item', 'Description', 'Qty', 'Unit', 'Brand', 'Remarks', 'Basis of quantity'];
  if (includeRates) headers.splice(5, 0, 'Rate (PKR)', 'Amount (PKR)');

  const rows = lines.map((l, i) => {
    const qty = Number(l.quantity) || 0;
    const rate = Number(l.rate);
    const base = [i + 1, l.item, l.description, qty, l.unit];
    const tail = [l.brand || '', l.remarks || '', l.basis || ''];
    if (!includeRates) return [...base, ...tail];
    const hasRate = Number.isFinite(rate) && rate > 0;
    return [...base, hasRate ? rate : '', hasRate ? round(rate * qty, 2) : '', ...tail];
  });

  if (includeRates) {
    const { total, unpricedLines } = boqTotal(lines);
    if (total > 0) {
      const row = new Array(headers.length).fill('');
      row[2] = unpricedLines > 0
        ? `TOTAL (${unpricedLines} line(s) unpriced — total is incomplete)`
        : 'TOTAL';
      row[6] = round(total, 2);
      rows.push([], row);
    }
  }
  return { headers, rows };
}

/**
 * Every sheet of the full workbook export.
 * @param {{ name: string, client?: string, location?: string, updatedAt?: string }} project
 * @param {ReturnType<import('../engine/index.js').calculateProject>} r
 * @param {import('../engine/boq.js').BoqLine[]} [boqLines]
 * @returns {import('./xlsx.js').SheetSpec[]}
 */
export function workbookSheets(project, r, boqLines) {
  const lines = boqLines ?? r.boq.lines;

  const summary = {
    name: 'Summary',
    headers: ['Quantity', 'Value', 'Unit'],
    columnWidths: [42, 16, 12],
    rows: [
      ['Project', project.name || '', ''],
      ['Client', project.client || '', ''],
      ['Location', project.location || '', ''],
      ['Report generated', new Date().toISOString().slice(0, 19).replace('T', ' '), ''],
      [],
      ['ELECTRICAL LOAD', '', ''],
      ['Connected load', n(r.load.connectedLoadKW), 'kW'],
      ['Connected load (apparent)', n(r.load.connectedLoadKVA), 'kVA'],
      ['Maximum demand', n(r.load.maximumDemandKW), 'kW'],
      ['Maximum demand (apparent)', n(r.load.maximumDemandKVA), 'kVA'],
      ['Reactive demand', n(r.load.maximumDemandKVAr), 'kVAr'],
      ['Running load (24 h average)', n(r.load.runningLoadKW), 'kW'],
      ['Overall power factor', n(r.load.overallPowerFactor, 3), ''],
      ['Demand current', n(r.load.demandCurrentA, 1), 'A'],
      ['Daily energy', n(r.load.dailyEnergyKWh, 1), 'kWh/day'],
      ['Monthly energy', n(r.load.monthlyEnergyKWh, 0), 'kWh/month'],
      [],
      ['MAIN CABLE', '', ''],
      ['Design current', n(r.cable.designCurrentA, 1), 'A'],
      ['Protective device', r.cable.breaker.ratingA ?? '', r.cable.breaker.type ?? ''],
      ['Total derating factor', n(r.cable.totalDerating, 3), ''],
      ['Required tabulated rating', n(r.cable.requiredTabulatedRatingA, 1), 'A'],
      ['Recommended conductor size', r.cable.recommendedSizeMm2 ?? '', 'mm2'],
      ['Sizing governed by', r.cable.governedBy ?? '', ''],
      ['Voltage drop', n(r.cable.voltageDrop?.dropVolts, 2), 'V'],
      ['Voltage drop', n(r.cable.voltageDrop?.dropPercent, 2), '%'],
      [],
      ['SOLAR PV', '', ''],
      ['Sizing mode', r.solar.mode === 'instantaneous' ? 'A - instantaneous daytime load' : 'B - daily energy', ''],
      ['Peak sun hours', n(r.solar.peakSunHours, 2), 'kWh/m2/day'],
      ['System efficiency', n(r.solar.systemEfficiency * 100, 1), '%'],
      ['Required PV capacity', n(r.solar.requiredPvKWp, 2), 'kWp'],
      ['Module count', r.panels.panelCount, 'No.'],
      ['Installed capacity', n(r.panels.installedCapacityKWp, 2), 'kWp'],
      ['Module footprint', n(r.panels.moduleFootprintSqm, 1), 'm2'],
      ['Gross array area', n(r.panels.grossAreaSqm, 1), 'm2'],
      ['Gross array area', n(r.panels.grossAreaSqft, 0), 'sq ft'],
      ['Minimum row pitch', n(r.panels.rowPitchM, 2), 'm'],
      ['Recommended inverter', r.inverter.recommendedKW, 'kW'],
      ['Acceptable inverter range', r.inverter.rangeLabel, ''],
      ['DC/AC ratio', n(r.inverter.actualDcAcRatio, 2), ''],
      ['Daily generation', n(r.solar.dailyGenerationKWh, 1), 'kWh/day'],
      ['Monthly generation', n(r.solar.monthlyGenerationKWh, 0), 'kWh/month'],
      ['Annual generation', n(r.solar.annualGenerationKWh, 0), 'kWh/year'],
      ['Specific yield', n(r.solar.specificYieldKWhPerKWpYear, 0), 'kWh/kWp/year'],
      ['Estimated monthly saving', n(r.solar.monthlySavingsPkr, 0), 'PKR/month'],
      ['Estimated annual saving', n(r.solar.annualSavingsPkr, 0), 'PKR/year'],
      [],
      ['DISCLAIMER', ENGINEERING_DISCLAIMER, ''],
    ],
  };

  const loadSheet = {
    name: 'Load schedule',
    headers: ['S.No', 'Load', 'Category', 'Qty', 'Rated power', 'Unit', 'Phase', 'PF',
      'Diversity', 'Hours/day', 'Connected kW', 'Demand kW', 'Demand kVA', 'Current A', 'kWh/day'],
    columnWidths: [6, 24, 18, 7, 12, 7, 8, 7, 10, 11, 13, 12, 12, 11, 11],
    rows: r.load.items.map((it, i) => [
      i + 1, it.item.name || '(unnamed)', it.item.category, Number(it.item.quantity),
      Number(it.item.ratedPower), it.item.unit, it.item.phase === 3 ? '3-ph' : '1-ph',
      Number(it.item.powerFactor), Number(it.item.diversityFactor), Number(it.item.hoursPerDay),
      n(it.connectedKW, 3), n(it.demandKW, 3), n(it.demandKVA, 3), n(it.currentA, 2), n(it.dailyEnergyKWh, 2),
    ]),
  };

  const boq = boqRows(lines, true);
  const boqSheet = {
    name: 'BOQ',
    headers: boq.headers,
    columnWidths: [6, 26, 56, 9, 8, 12, 14, 16, 40, 46],
    rows: boq.rows,
  };

  const cableSheet = {
    name: 'Cable candidates',
    headers: ['Size (mm2)', 'Base rating (A)', 'Derated rating (A)', 'Volt drop (V)', 'Volt drop (%)', 'Thermal OK', 'Volt drop OK'],
    columnWidths: [12, 16, 18, 14, 14, 12, 14],
    rows: r.cable.candidates.map((c) => [
      c.csaMm2, n(c.baseRatingA, 1), n(c.deratedRatingA, 1), n(c.dropVolts, 2), n(c.dropPercent, 2),
      c.thermalOk ? 'Yes' : 'No', c.dropOk ? 'Yes' : 'No',
    ]),
  };

  const assumptionsSheet = {
    name: 'Assumptions',
    headers: ['#', 'Assumption'],
    columnWidths: [6, 130],
    rows: [
      ...r.assumptions.map((a, i) => [i + 1, a]),
      [],
      ['', 'CABLE SELECTION CAVEATS - an ampacity check alone does not make a cable safe:'],
      ...r.cable.caveats.map((c, i) => [i + 1, c]),
      [],
      ['', 'SOLAR CAVEATS:'],
      ...r.solar.caveats.map((c, i) => [i + 1, c]),
      [],
      ['', 'INVERTER SELECTION CAVEATS:'],
      ...r.inverter.caveats.map((c, i) => [i + 1, c]),
      [],
      ['', ENGINEERING_DISCLAIMER],
    ],
  };

  return [summary, loadSheet, boqSheet, cableSheet, assumptionsSheet];
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtNum = (v, d = 2) => (Number.isFinite(v)
  ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  : '—');

/**
 * A complete, standalone HTML document for printing / saving as PDF.
 * @param {{ name: string, client?: string, location?: string, engineer?: string }} project
 * @param {ReturnType<import('../engine/index.js').calculateProject>} r
 * @param {import('../engine/boq.js').BoqLine[]} [boqLines]
 * @returns {string}
 */
export function reportHtml(project, r, boqLines) {
  const lines = boqLines ?? r.boq.lines;
  const { total, unpricedLines } = boqTotal(lines);
  const date = new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' });

  const kpi = (label, value, unit) => `
    <div class="kpi"><div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value">${esc(value)}<span class="kpi-unit">${esc(unit)}</span></div></div>`;

  const row = (label, value, unit = '') =>
    `<tr><th>${esc(label)}</th><td class="num">${esc(value)}</td><td class="unit">${esc(unit)}</td></tr>`;

  const loadRows = r.load.items.map((it, i) => `<tr>
    <td>${i + 1}</td><td>${esc(it.item.name || '(unnamed)')}</td>
    <td class="num">${it.item.quantity}</td>
    <td class="num">${esc(it.item.ratedPower)} ${esc(it.item.unit)}</td>
    <td class="num">${it.item.phase === 3 ? '3-ph' : '1-ph'}</td>
    <td class="num">${it.item.powerFactor}</td><td class="num">${it.item.diversityFactor}</td>
    <td class="num">${fmtNum(it.connectedKW, 2)}</td><td class="num">${fmtNum(it.demandKW, 2)}</td>
    <td class="num">${fmtNum(it.currentA, 1)}</td><td class="num">${fmtNum(it.dailyEnergyKWh, 1)}</td>
  </tr>`).join('');

  const boqBody = lines.map((l, i) => {
    const rate = Number(l.rate);
    const hasRate = Number.isFinite(rate) && rate > 0;
    return `<tr>
      <td>${i + 1}</td><td><strong>${esc(l.item)}</strong><div class="muted">${esc(l.description)}</div></td>
      <td class="num">${fmtNum(Number(l.quantity), 2)}</td><td>${esc(l.unit)}</td>
      <td>${esc(l.brand)}</td>
      <td class="num">${hasRate ? fmtNum(rate, 0) : '—'}</td>
      <td class="num">${hasRate ? fmtNum(rate * Number(l.quantity), 0) : '—'}</td>
      <td class="muted">${esc(l.remarks)}</td>
    </tr>`;
  }).join('');

  const list = (items) => `<ul>${items.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(project.name || 'PowerCalc report')}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font: 11px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #14181f; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 2px; letter-spacing: -0.01em; }
  h2 { font-size: 13px; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 1.5px solid #14181f;
       text-transform: uppercase; letter-spacing: 0.06em; }
  h3 { font-size: 11px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6270; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2.5px solid #14181f; padding-bottom: 10px; }
  .brand { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #5a6270; }
  .meta { text-align: right; font-size: 10px; color: #5a6270; line-height: 1.7; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0 4px; }
  .kpi { border: 1px solid #d5dae2; border-radius: 4px; padding: 8px 10px; page-break-inside: avoid; }
  .kpi-label { font-size: 8.5px; letter-spacing: 0.09em; text-transform: uppercase; color: #5a6270; }
  .kpi-value { font-size: 17px; font-weight: 650; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .kpi-unit { font-size: 9px; font-weight: 500; color: #5a6270; margin-left: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 1px solid #d5dae2; padding: 4px 6px; text-align: left; vertical-align: top; }
  thead th { background: #f2f4f7; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .unit { color: #5a6270; width: 70px; }
  .kv th { width: 55%; font-weight: 500; background: #fafbfc; }
  .muted { color: #5a6270; font-size: 9px; }
  ul { margin: 6px 0; padding-left: 16px; }
  li { margin-bottom: 3px; }
  .disclaimer { margin-top: 18px; border: 1px solid #c9a227; background: #fdf8e8;
                padding: 9px 11px; border-radius: 4px; font-size: 9.5px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  section { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
</style></head><body>

<div class="head">
  <div>
    <div class="brand">PowerCalc Pakistan &middot; Engineering Calculation Report</div>
    <h1>${esc(project.name || 'Untitled project')}</h1>
    <div class="muted">${esc(project.location || '')}${project.client ? ` &middot; ${esc(project.client)}` : ''}</div>
  </div>
  <div class="meta">
    Generated ${esc(date)}<br>
    ${project.engineer ? `Prepared by ${esc(project.engineer)}<br>` : ''}
    Preliminary &mdash; not for construction
  </div>
</div>

<h2>Headline results</h2>
<div class="kpis">
  ${kpi('Total connected load', fmtNum(r.load.connectedLoadKW, 1), 'kW')}
  ${kpi('Maximum demand', fmtNum(r.load.maximumDemandKW, 1), 'kW')}
  ${kpi('Demand current', fmtNum(r.load.demandCurrentA, 1), 'A')}
  ${kpi('Power factor', fmtNum(r.load.overallPowerFactor, 3), '')}
  ${kpi('Solar PV required', fmtNum(r.solar.requiredPvKWp, 1), 'kWp')}
  ${kpi('Modules', String(r.panels.panelCount), 'No.')}
  ${kpi('Installed capacity', fmtNum(r.panels.installedCapacityKWp, 2), 'kWp')}
  ${kpi('Inverter', String(r.inverter.recommendedKW), 'kW')}
  ${kpi('Gross array area', fmtNum(r.panels.grossAreaSqft, 0), 'sq ft')}
  ${kpi('Daily generation', fmtNum(r.solar.dailyGenerationKWh, 0), 'kWh')}
  ${kpi('Monthly generation', fmtNum(r.solar.monthlyGenerationKWh, 0), 'kWh')}
  ${kpi('Monthly saving', fmtNum(r.solar.monthlySavingsPkr, 0), 'PKR')}
</div>

<section>
<h2>Electrical load</h2>
<div class="cols">
  <table class="kv">
    ${row('Connected load', fmtNum(r.load.connectedLoadKW, 2), 'kW')}
    ${row('Connected load (apparent)', fmtNum(r.load.connectedLoadKVA, 2), 'kVA')}
    ${row('Maximum demand', fmtNum(r.load.maximumDemandKW, 2), 'kW')}
    ${row('Maximum demand (apparent)', fmtNum(r.load.maximumDemandKVA, 2), 'kVA')}
    ${row('Reactive demand', fmtNum(r.load.maximumDemandKVAr, 2), 'kVAr')}
  </table>
  <table class="kv">
    ${row('Running load (24 h average)', fmtNum(r.load.runningLoadKW, 2), 'kW')}
    ${row('Overall power factor', fmtNum(r.load.overallPowerFactor, 3), '')}
    ${row('Demand current', fmtNum(r.load.demandCurrentA, 1), 'A')}
    ${row('Daily energy', fmtNum(r.load.dailyEnergyKWh, 1), 'kWh/day')}
    ${row('Monthly energy', fmtNum(r.load.monthlyEnergyKWh, 0), 'kWh/month')}
  </table>
</div>

<h3>Load schedule</h3>
<table><thead><tr>
  <th>#</th><th>Load</th><th class="num">Qty</th><th class="num">Rating</th><th class="num">Phase</th>
  <th class="num">PF</th><th class="num">DF</th><th class="num">Conn. kW</th><th class="num">Demand kW</th>
  <th class="num">Current A</th><th class="num">kWh/day</th>
</tr></thead><tbody>${loadRows || '<tr><td colspan="11">No loads entered.</td></tr>'}</tbody></table>
</section>

<section>
<h2>Cable and protection</h2>
<div class="cols">
  <table class="kv">
    ${row('Design current (Ib)', fmtNum(r.cable.designCurrentA, 1), 'A')}
    ${row('Protective device (In)', `${r.cable.breaker.ratingA ?? '—'} ${r.cable.breaker.type ?? ''}`, '')}
    ${row('Ambient factor (Ca)', fmtNum(r.cable.ambientFactor, 3), '')}
    ${row('Grouping factor (Cg)', fmtNum(r.cable.groupingFactor, 3), '')}
    ${row('Required tabulated rating (It)', fmtNum(r.cable.requiredTabulatedRatingA, 1), 'A')}
  </table>
  <table class="kv">
    ${row('Recommended conductor', r.cable.recommendedSizeMm2 ?? '—', 'mm²')}
    ${row('Derated capacity', fmtNum(r.cable.recommendedRatingA, 1), 'A')}
    ${row('Sizing governed by', r.cable.governedBy ?? '—', '')}
    ${row('Voltage drop', fmtNum(r.cable.voltageDrop?.dropVolts, 2), 'V')}
    ${row('Voltage drop', fmtNum(r.cable.voltageDrop?.dropPercent, 2), '%')}
  </table>
</div>
<h3>Cable selection is not complete without checking</h3>
${list(r.cable.caveats)}
</section>

<section>
<h2>Solar PV system</h2>
<div class="cols">
  <table class="kv">
    ${row('Sizing mode', r.solar.mode === 'instantaneous' ? 'A — instantaneous daytime load' : 'B — daily energy', '')}
    ${row('Peak sun hours', fmtNum(r.solar.peakSunHours, 2), 'kWh/m²/day')}
    ${row('System efficiency', fmtNum(r.solar.systemEfficiency * 100, 1), '%')}
    ${row('Required PV capacity', fmtNum(r.solar.requiredPvKWp, 2), 'kWp')}
    ${row('Module count', String(r.panels.panelCount), 'No.')}
    ${row('Installed capacity', fmtNum(r.panels.installedCapacityKWp, 2), 'kWp')}
    ${row('Module area (each)', fmtNum(r.panels.panelAreaSqm, 3), 'm²')}
  </table>
  <table class="kv">
    ${row('Module footprint', fmtNum(r.panels.moduleFootprintSqm, 1), 'm²')}
    ${row('Gross array area', fmtNum(r.panels.grossAreaSqm, 1), 'm²')}
    ${row('Gross array area', fmtNum(r.panels.grossAreaSqft, 0), 'sq ft')}
    ${row('Minimum row pitch', fmtNum(r.panels.rowPitchM, 2), 'm')}
    ${row('Recommended inverter', `${r.inverter.recommendedKW}`, 'kW')}
    ${row('Acceptable inverter range', r.inverter.rangeLabel, '')}
    ${row('DC/AC ratio', fmtNum(r.inverter.actualDcAcRatio, 2), '')}
  </table>
</div>
<div class="cols">
  <table class="kv">
    ${row('Daily generation', fmtNum(r.solar.dailyGenerationKWh, 1), 'kWh/day')}
    ${row('Monthly generation', fmtNum(r.solar.monthlyGenerationKWh, 0), 'kWh/month')}
    ${row('Annual generation', fmtNum(r.solar.annualGenerationKWh, 0), 'kWh/year')}
  </table>
  <table class="kv">
    ${row('Specific yield', fmtNum(r.solar.specificYieldKWhPerKWpYear, 0), 'kWh/kWp/yr')}
    ${row('Estimated monthly saving', fmtNum(r.solar.monthlySavingsPkr, 0), 'PKR')}
    ${row('Estimated annual saving', fmtNum(r.solar.annualSavingsPkr, 0), 'PKR')}
  </table>
</div>
<h3>Solar yield caveats</h3>
${list(r.solar.caveats)}
<h3>Inverter selection depends on</h3>
${list(r.inverter.caveats)}
</section>

<section>
<h2>Bill of quantities</h2>
<table><thead><tr>
  <th>#</th><th>Item / description</th><th class="num">Qty</th><th>Unit</th><th>Brand</th>
  <th class="num">Rate</th><th class="num">Amount</th><th>Remarks</th>
</tr></thead><tbody>${boqBody || '<tr><td colspan="8">No BOQ generated.</td></tr>'}</tbody></table>
${total > 0 ? `<p class="num"><strong>Total: PKR ${fmtNum(total, 0)}</strong>${unpricedLines > 0 ? ` <span class="muted">(${unpricedLines} line(s) unpriced — total is incomplete)</span>` : ''}</p>` : '<p class="muted">No rates entered — this is an unpriced BOQ.</p>'}
</section>

<section>
<h2>Engineering assumptions</h2>
${list(r.assumptions)}
</section>

<div class="disclaimer"><strong>Disclaimer.</strong> ${esc(ENGINEERING_DISCLAIMER)}</div>
</body></html>`;
}
