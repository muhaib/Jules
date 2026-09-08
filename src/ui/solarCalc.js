/**
 * Solar Calculator view — sizing, modules, roof area and inverter in one flow.
 * @module ui/solarCalc
 */

import {
  el, card, field, numberInput, select, segmented, stat, table, button,
  issueList, disclaimer, detailsList, monthChart, fmt,
} from './components.js';
import { getActiveProject, setField, updateActiveProject, toEngineInputs } from '../store.js';
import { calculateLoadSchedule } from '../engine/load.js';
import { calculateSolar, monthlyGenerationProfile } from '../engine/solar.js';
import { calculatePanels, winterNoonSolarAltitude } from '../engine/panels.js';
import { calculateInverter } from '../engine/inverter.js';
import {
  PAKISTAN_CITIES, PANEL_WATTAGES, PANEL_DIMENSION_PRESETS, MOUNTING_TYPES,
} from '../engine/constants.js';
import { mToFt, sqmToSqft } from '../engine/units.js';

const fieldError = (issues, key) =>
  issues.find((i) => i.level === 'error' && i.field === key)?.message;

/** @returns {HTMLElement} */
export function renderSolarCalculator(navigate) {
  const project = getActiveProject();
  if (!project) return el('p', { text: 'No project selected.' });

  const engineInputs = toEngineInputs(project);
  const load = calculateLoadSchedule(engineInputs.load);
  const s = project.inputs.solar;
  const pn = project.inputs.panels;
  const inv = project.inputs.inverter;

  const solarInput = { ...engineInputs.solar };
  if (solarInput.mode === 'instantaneous' && solarInput.daytimeLoadKW === undefined) {
    solarInput.daytimeLoadKW = load.maximumDemandKW;
  }
  const solar = calculateSolar(solarInput);
  const panels = calculatePanels({ ...engineInputs.panels, requiredPvKWp: solar.requiredPvKWp });
  const inverter = calculateInverter({
    ...engineInputs.inverter,
    pvCapacityKWp: panels.installedCapacityKWp,
    maxDaytimeLoadKW: load.maximumDemandKW,
  });

  const city = PAKISTAN_CITIES.find((c) => c.key === s.cityKey) ?? PAKISTAN_CITIES[0];
  const page = el('div');

  page.appendChild(el('div.page-head', null, [
    el('h1.page-title', { text: 'Solar Calculator' }),
    el('p.page-desc', {
      text: 'Sizes the array, counts the modules, estimates the roof area and gives an '
        + 'inverter range. Choose the sizing mode carefully — Mode A and Mode B answer '
        + 'different questions and give different answers for the same site.',
    }),
  ]));

  // ---- Mode ----
  page.appendChild(card({ title: 'Sizing mode' }, [
    segmented({
      value: s.mode,
      options: [
        { value: 'instantaneous', label: 'A — Daytime load' },
        { value: 'dailyEnergy', label: 'B — Daily energy' },
      ],
      onChange: (v) => setField('inputs.solar.mode', v),
    }),
    el('p.note', {
      text: s.mode === 'instantaneous'
        ? 'Mode A sizes the array to supply a share of the daytime load at PEAK irradiance — '
          + 'around solar noon on a clear day. Output follows the sun, so the load is fully '
          + 'covered by solar for only part of the daylight window. Use this when the client '
          + 'asks "will solar run my site during the day?"'
        : 'Mode B sizes the array so its energy over an average day covers a share of the daily '
          + 'consumption. It says nothing about whether output matches load at any instant. '
          + 'Use this when the client asks "how much of my monthly units will solar replace?"',
      style: { marginTop: '12px' },
    }),
  ]));

  // ---- Inputs ----
  page.appendChild(card({ title: 'Site and system' }, [
    el('div.form-grid', null, [
      field({ label: 'Location', hint: 'Sets the default peak sun hours and latitude.' }, select({
        value: s.cityKey,
        options: PAKISTAN_CITIES.map((c) => ({
          value: c.key, label: `${c.name} — ${c.peakSunHours} kWh/m²/day`,
        })),
        onChange: (v) => {
          const c = PAKISTAN_CITIES.find((x) => x.key === v);
          updateActiveProject((p) => {
            p.inputs.solar.cityKey = v;
            if (c) p.inputs.solar.peakSunHours = c.peakSunHours;
          });
        },
      })),
      field({
        label: 'Average peak sun hours',
        hint: 'Annual average, kWh/m²/day. Planning-grade — replace with Global Solar Atlas or measured data for a real design.',
        error: fieldError(solar.issues, 'peakSunHours'),
      }, numberInput({
        value: s.peakSunHours, step: 0.1, min: 0.1, max: 12, suffix: 'h',
        invalid: Boolean(fieldError(solar.issues, 'peakSunHours')),
        onInput: (v) => setField('inputs.solar.peakSunHours', v),
      })),

      s.mode === 'instantaneous'
        ? field({ label: 'Daytime load from', wide: true }, segmented({
          value: s.loadSource,
          options: [
            { value: 'load', label: 'Load Calculator' },
            { value: 'manual', label: 'Enter manually' },
          ],
          onChange: (v) => setField('inputs.solar.loadSource', v),
        }))
        : null,

      s.mode === 'instantaneous' && s.loadSource === 'load'
        ? field({
          label: 'Maximum demand',
          hint: 'Taken live from the load schedule.',
        }, numberInput({ value: fmt(load.maximumDemandKW, 2), disabled: true, suffix: 'kW', onInput: () => {} }))
        : null,

      s.mode === 'instantaneous' && s.loadSource === 'manual'
        ? field({ label: 'Daytime load', error: fieldError(solar.issues, 'daytimeLoadKW') },
          numberInput({
            value: s.daytimeLoadKW, min: 0, suffix: 'kW',
            invalid: Boolean(fieldError(solar.issues, 'daytimeLoadKW')),
            onInput: (v) => setField('inputs.solar.daytimeLoadKW', v),
          }))
        : null,

      s.mode === 'dailyEnergy'
        ? field({
          label: 'Daily consumption',
          hint: `The load schedule currently gives ${fmt(load.dailyEnergyKWh, 1)} kWh/day.`,
          error: fieldError(solar.issues, 'dailyConsumptionKWh'),
        }, numberInput({
          value: s.dailyConsumptionKWh, min: 0, suffix: 'kWh/day',
          invalid: Boolean(fieldError(solar.issues, 'dailyConsumptionKWh')),
          onInput: (v) => setField('inputs.solar.dailyConsumptionKWh', v),
        }))
        : null,

      field({
        label: s.mode === 'instantaneous' ? 'Share of daytime load from solar' : 'Share of daily energy from solar',
        error: fieldError(solar.issues, 'targetPercent'),
      }, numberInput({
        value: s.targetPercent, min: 1, max: 200, step: 5, suffix: '%',
        invalid: Boolean(fieldError(solar.issues, 'targetPercent')),
        onInput: (v) => setField('inputs.solar.targetPercent', v),
      })),

      field({
        label: 'System losses (DC side)',
        hint: 'Soiling, cell temperature, mismatch, wiring and shading. 12–18 % is typical in Pakistan; dust makes the low end optimistic.',
        error: fieldError(solar.issues, 'systemLossPercent'),
      }, numberInput({
        value: s.systemLossPercent, min: 0, max: 60, step: 1, suffix: '%',
        invalid: Boolean(fieldError(solar.issues, 'systemLossPercent')),
        onInput: (v) => setField('inputs.solar.systemLossPercent', v),
      })),

      field({
        label: 'Inverter efficiency',
        hint: 'Counted separately from the DC losses so neither is double-counted.',
        error: fieldError(solar.issues, 'inverterEfficiency'),
      }, numberInput({
        value: s.inverterEfficiency, min: 0.5, max: 1, step: 0.005,
        invalid: Boolean(fieldError(solar.issues, 'inverterEfficiency')),
        onInput: (v) => setField('inputs.solar.inverterEfficiency', v),
      })),

      s.mode === 'instantaneous'
        ? field({ label: 'Future load allowance', hint: 'Added to the load before sizing.' },
          numberInput({
            value: s.futureLoadKW, min: 0, suffix: 'kW',
            onInput: (v) => setField('inputs.solar.futureLoadKW', v),
          }))
        : field({ label: 'Future energy allowance', hint: 'Added to the daily consumption before sizing.' },
          numberInput({
            value: s.futureEnergyKWh, min: 0, suffix: 'kWh/day',
            onInput: (v) => setField('inputs.solar.futureEnergyKWh', v),
          })),

      field({
        label: 'Electricity tariff',
        hint: 'Pakistani tariffs are slab-based and change periodically — enter your own rate.',
      }, numberInput({
        value: s.tariffPkrPerKwh, min: 0, step: 1, suffix: 'PKR/kWh',
        onInput: (v) => setField('inputs.solar.tariffPkrPerKwh', v),
      })),

      field({
        label: 'Share exported to the grid',
        hint: 'Under net metering the buy-back rate is usually well below the retail tariff.',
      }, numberInput({
        value: s.exportFraction, min: 0, max: 1, step: 0.05,
        onInput: (v) => setField('inputs.solar.exportFraction', v),
      })),

      Number(s.exportFraction) > 0
        ? field({ label: 'Export / buy-back tariff' }, numberInput({
          value: s.exportTariffPkrPerKwh, min: 0, step: 1, suffix: 'PKR/kWh',
          onInput: (v) => setField('inputs.solar.exportTariffPkrPerKwh', v),
        }))
        : null,
    ].filter(Boolean)),
  ]));

  // ---- Sizing result ----
  const solarBody = [];
  if (solar.issues.some((i) => i.level === 'error')) {
    solarBody.push(issueList(solar.issues));
  } else {
    solarBody.push(el('div.stat-grid', null, [
      stat({ label: 'Required PV capacity', value: fmt(solar.requiredPvKWp, 2), unit: 'kWp', tone: 'accent' }),
      stat({ label: 'System efficiency', value: fmt(solar.systemEfficiency * 100, 1), unit: '%', note: `(1 − ${s.systemLossPercent}%) × ${s.inverterEfficiency}` }),
      stat({ label: 'Daily generation', value: fmt(solar.dailyGenerationKWh, 1), unit: 'kWh', note: 'Annual average day' }),
      stat({ label: 'Monthly generation', value: fmt(solar.monthlyGenerationKWh, 0), unit: 'kWh' }),
      stat({ label: 'Annual generation', value: fmt(solar.annualGenerationKWh, 0), unit: 'kWh' }),
      stat({ label: 'Specific yield', value: fmt(solar.specificYieldKWhPerKWpYear, 0), unit: 'kWh/kWp/yr' }),
      stat({ label: 'Monthly saving', value: fmt(solar.monthlySavingsPkr, 0), unit: 'PKR' }),
      stat({ label: 'Annual saving', value: fmt(solar.annualSavingsPkr, 0), unit: 'PKR' }),
    ]));

    solarBody.push(el('div.section-label', { text: 'Seasonal shape of generation (kWh per month)' }));
    solarBody.push(monthChart(
      monthlyGenerationProfile(solar.dailyGenerationKWh, city.latitude), { unit: 'kWh' },
    ));
    solarBody.push(el('p.note', {
      text: 'This shape comes from solar geometry only — day length and sun height at '
        + `latitude ${city.latitude.toFixed(1)}°. It does not model monsoon cloud, dust or haze, `
        + 'which cut July–August output further in much of Pakistan.',
    }));
  }
  solarBody.push(detailsList('Solar yield caveats', solar.caveats, { tone: 'warn', open: true }));
  solarBody.push(detailsList('Engineering assumptions', solar.assumptions));
  solarBody.push(disclaimer());
  page.appendChild(card({ title: 'PV sizing' }, solarBody));

  // ---- Modules ----
  const dims = { widthMm: Number(pn.panelWidthMm), heightMm: Number(pn.panelHeightMm) };
  page.appendChild(card({
    title: 'Modules and array area',
    subtitle: 'Module count always rounds UP — a fractional panel does not exist.',
  }, [
    el('div.form-grid', null, [
      field({ label: 'Module wattage' }, select({
        value: PANEL_WATTAGES.includes(Number(pn.panelWattage)) ? pn.panelWattage : 'custom',
        options: [...PANEL_WATTAGES.map((w) => ({ value: w, label: `${w} W` })), { value: 'custom', label: 'Custom…' }],
        onChange: (v) => {
          if (v === 'custom') return;
          const w = Number(v);
          const preset = PANEL_DIMENSION_PRESETS[w];
          updateActiveProject((p) => {
            p.inputs.panels.panelWattage = w;
            if (preset) {
              p.inputs.panels.panelWidthMm = preset.widthMm;
              p.inputs.panels.panelHeightMm = preset.heightMm;
            }
          });
        },
      })),
      field({ label: 'Wattage (custom)', error: fieldError(panels.issues, 'panelWattage') },
        numberInput({
          value: pn.panelWattage, min: 1, suffix: 'W',
          invalid: Boolean(fieldError(panels.issues, 'panelWattage')),
          onInput: (v) => setField('inputs.panels.panelWattage', v),
        })),
      field({
        label: 'Module length',
        hint: `${fmt(dims.widthMm / 1000, 3)} m · ${fmt(mToFt(dims.widthMm / 1000), 2)} ft`,
        error: fieldError(panels.issues, 'panelWidthMm'),
      }, numberInput({
        value: pn.panelWidthMm, min: 1, suffix: 'mm',
        invalid: Boolean(fieldError(panels.issues, 'panelWidthMm')),
        onInput: (v) => setField('inputs.panels.panelWidthMm', v),
      })),
      field({
        label: 'Module width',
        hint: `${fmt(dims.heightMm / 1000, 3)} m · ${fmt(mToFt(dims.heightMm / 1000), 2)} ft`,
        error: fieldError(panels.issues, 'panelHeightMm'),
      }, numberInput({
        value: pn.panelHeightMm, min: 1, suffix: 'mm',
        invalid: Boolean(fieldError(panels.issues, 'panelHeightMm')),
        onInput: (v) => setField('inputs.panels.panelHeightMm', v),
      })),
      field({ label: 'Mounting' }, select({
        value: pn.mountingType,
        options: Object.values(MOUNTING_TYPES).map((m) => ({ value: m.key, label: `${m.label} (GCR ${m.gcr})` })),
        onChange: (v) => {
          const m = MOUNTING_TYPES[v];
          updateActiveProject((p) => {
            p.inputs.panels.mountingType = v;
            if (m) p.inputs.panels.tiltDeg = m.tiltDeg;
          });
        },
      })),
      field({ label: 'Module orientation in the row' }, segmented({
        value: pn.orientation,
        options: [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }],
        onChange: (v) => setField('inputs.panels.orientation', v),
      })),
      field({ label: 'Tilt angle', error: fieldError(panels.issues, 'tiltDeg') },
        numberInput({
          value: pn.tiltDeg, min: 0, max: 60, step: 1, suffix: '°',
          invalid: Boolean(fieldError(panels.issues, 'tiltDeg')),
          onInput: (v) => setField('inputs.panels.tiltDeg', v),
        })),
      field({
        label: 'Access / maintenance margin',
        hint: 'Walkways, inverter area and edge setbacks, on top of the row spacing.',
      }, numberInput({
        value: pn.accessMarginPercent, min: 0, max: 100, step: 5, suffix: '%',
        onInput: (v) => setField('inputs.panels.accessMarginPercent', v),
      })),
      field({
        label: 'Design sun altitude for row spacing',
        hint: `Blank uses winter solar noon at latitude ${city.latitude.toFixed(1)}° = ${fmt(winterNoonSolarAltitude(city.latitude), 1)}°. A lower value covers more of the 9 am–3 pm window and widens the rows.`,
      }, numberInput({
        value: pn.designSolarAltitudeDeg, min: 1, max: 89, step: 1, suffix: '°',
        placeholder: fmt(winterNoonSolarAltitude(city.latitude), 1),
        onInput: (v) => setField('inputs.panels.designSolarAltitudeDeg', v),
      })),
    ]),

    el('div.divider'),

    panels.issues.some((i) => i.level === 'error')
      ? issueList(panels.issues)
      : el('div', null, [
        el('div.stat-grid', null, [
          stat({ label: 'Modules required', value: String(panels.panelCount), unit: 'No.', tone: 'accent', note: `${fmt(panels.installedCapacityKWp, 2)} kWp installed` }),
          stat({ label: 'Installed capacity', value: fmt(panels.installedCapacityKWp, 2), unit: 'kWp', note: `${panels.capacityDifferenceKWp >= 0 ? '+' : ''}${fmt(panels.capacityDifferenceKWp, 2)} kWp vs required` }),
          stat({ label: 'Gross array area', value: fmt(panels.grossAreaSqft, 0), unit: 'sq ft', note: `${fmt(panels.grossAreaSqm, 1)} m²` }),
          stat({ label: 'Module glass area', value: fmt(panels.moduleFootprintSqm, 1), unit: 'm²', note: `${fmt(panels.moduleFootprintSqft, 0)} sq ft` }),
          stat({ label: 'Area per module', value: fmt(panels.panelAreaSqm, 3), unit: 'm²', note: `${fmt(panels.panelAreaSqft, 2)} sq ft` }),
          stat({ label: 'Area per kWp', value: fmt(panels.areaPerKWpSqft, 0), unit: 'sq ft', note: `${fmt(panels.areaPerKWpSqm, 1)} m²` }),
          stat({ label: 'Minimum row pitch', value: fmt(panels.rowPitchM, 2), unit: 'm', note: `${fmt(mToFt(panels.rowPitchM), 2)} ft centre to centre` }),
          stat({ label: 'Clear gap behind each row', value: fmt(panels.rowGapM, 2), unit: 'm', note: `${fmt(mToFt(panels.rowGapM), 2)} ft` }),
        ]),

        el('div.section-label', { text: 'Module dimensions in every unit' }),
        table({
          headers: ['', { label: 'mm', align: 'right' }, { label: 'm', align: 'right' }, { label: 'ft', align: 'right' }],
          rows: [
            [el('td', { text: 'Length' }), el('td.num', { text: fmt(dims.widthMm, 0) }), el('td.num', { text: fmt(dims.widthMm / 1000, 3) }), el('td.num', { text: fmt(mToFt(dims.widthMm / 1000), 3) })],
            [el('td', { text: 'Width' }), el('td.num', { text: fmt(dims.heightMm, 0) }), el('td.num', { text: fmt(dims.heightMm / 1000, 3) }), el('td.num', { text: fmt(mToFt(dims.heightMm / 1000), 3) })],
            [el('td', { text: 'Area (each)' }), el('td.num', { text: '—' }), el('td.num', { text: `${fmt(panels.panelAreaSqm, 3)} m²` }), el('td.num', { text: `${fmt(panels.panelAreaSqft, 2)} sq ft` })],
            [el('td', { text: `Area (${panels.panelCount} modules)` }), el('td.num', { text: '—' }), el('td.num', { text: `${fmt(panels.moduleFootprintSqm, 1)} m²` }), el('td.num', { text: `${fmt(sqmToSqft(panels.moduleFootprintSqm), 0)} sq ft` })],
          ],
        }),

        detailsList('Engineering assumptions', panels.assumptions),
      ]),
  ]));

  // ---- Inverter ----
  page.appendChild(card({
    title: 'Inverter',
    subtitle: 'The answer is a range. No single rating is universally correct for a given array.',
  }, [
    el('div.form-grid', null, [
      field({ label: 'System type' }, select({
        value: inv.systemType,
        options: [
          { value: 'gridTied', label: 'Grid-tied (no load floor)' },
          { value: 'hybrid', label: 'Hybrid (must carry the load)' },
          { value: 'offGrid', label: 'Off-grid (must carry the load)' },
        ],
        onChange: (v) => setField('inputs.inverter.systemType', v),
      })),
      field({ label: 'Target DC/AC ratio', hint: 'Oversizing DC raises annual yield but clips at peak irradiance.' },
        numberInput({
          value: inv.dcAcRatioTarget, min: 0.8, max: 2, step: 0.05,
          onInput: (v) => setField('inputs.inverter.dcAcRatioTarget', v),
        })),
      field({ label: 'Acceptable DC/AC range' }, el('div.btn-row', null, [
        numberInput({ value: inv.dcAcRatioMin, min: 0.8, max: 2, step: 0.05, onInput: (v) => setField('inputs.inverter.dcAcRatioMin', v) }),
        numberInput({ value: inv.dcAcRatioMax, min: 0.8, max: 2, step: 0.05, onInput: (v) => setField('inputs.inverter.dcAcRatioMax', v) }),
      ])),
      inv.systemType !== 'gridTied'
        ? field({ label: 'Surge allowance for motor inrush' }, numberInput({
          value: inv.surgeFactor, min: 1, max: 3, step: 0.05, suffix: '×',
          onInput: (v) => setField('inputs.inverter.surgeFactor', v),
        }))
        : null,
    ].filter(Boolean)),

    el('div.divider'),

    inverter.issues.some((i) => i.level === 'error')
      ? issueList(inverter.issues)
      : el('div', null, [
        el('div.stat-grid', null, [
          stat({ label: 'Acceptable range', value: inverter.rangeLabel, tone: 'accent' }),
          stat({ label: 'Nearest standard rating', value: String(inverter.recommendedKW), unit: 'kW' }),
          stat({ label: 'Resulting DC/AC ratio', value: fmt(inverter.actualDcAcRatio, 2) }),
          stat({
            label: 'Load floor',
            value: inverter.loadFloorKW > 0 ? fmt(inverter.loadFloorKW, 1) : '—',
            unit: inverter.loadFloorKW > 0 ? 'kW' : '',
            note: inverter.loadFloorKW > 0 ? 'Set by the site load, not the array' : 'Grid-tied: no load floor',
          }),
        ]),
        inverter.standardOptionsKW.length
          ? el('p.note.note-accent', {
            text: `Standard ratings inside the band: ${inverter.standardOptionsKW.join(', ')} kW.`,
          })
          : null,
        detailsList('Final inverter selection depends on', inverter.caveats, { tone: 'warn', open: true }),
        detailsList('Engineering assumptions', inverter.assumptions),
      ]),

    disclaimer(),

    el('div.btn-row', { style: { marginTop: '14px' } }, [
      button({ label: 'View results', variant: 'primary', onClick: () => navigate('results') }),
      button({ label: 'Generate BOQ', onClick: () => navigate('boq') }),
    ]),
  ]));

  const warnings = [...solar.issues, ...panels.issues, ...inverter.issues].filter((i) => i.level === 'warning');
  if (warnings.length) page.appendChild(issueList(warnings));

  return page;
}
