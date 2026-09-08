/**
 * Settings — defaults for new projects, plus backup and restore.
 * @module ui/settings
 */

import {
  el, card, field, numberInput, textInput, select, button, detailsList,
} from './components.js';
import {
  getSettings, updateSettings, restoreDemoProject, resetAll,
  exportState, importState, saveFailed,
} from '../store.js';
import {
  PAKISTAN_CITIES, PANEL_WATTAGES, SYSTEM_VOLTAGES, AMPACITY_BASE,
  INSTALLATION_METHODS, MATERIAL_FACTORS, INSULATION_TYPES,
} from '../engine/constants.js';
import { downloadBlob } from '../export/download.js';

/**
 * @param {(route: string) => void} navigate
 * @param {(msg: string) => void} toast
 * @returns {HTMLElement}
 */
export function renderSettings(navigate, toast) {
  const s = getSettings();

  const page = el('div');
  page.appendChild(el('div.page-head', null, [
    el('h1.page-title', { text: 'Settings' }),
    el('p.page-desc', { text: 'These values seed NEW projects. Existing projects keep whatever they were created with.' }),
  ]));

  if (saveFailed()) {
    page.appendChild(el('div.issue-block.is-error', null, [
      el('div.issue-title', { text: 'Changes are not being saved' }),
      el('p', {
        text: 'This browser refused to write to local storage — usually private browsing '
          + 'or a full storage quota. Export a backup below before closing the tab.',
      }),
    ]));
  }

  page.appendChild(card({ title: 'Defaults for new projects' }, [
    el('div.form-grid', null, [
      field({ label: 'Default location' }, select({
        value: s.defaultCityKey,
        options: PAKISTAN_CITIES.map((c) => ({ value: c.key, label: `${c.name} — ${c.peakSunHours} kWh/m²/day` })),
        onChange: (v) => updateSettings({ defaultCityKey: v }),
      })),
      field({ label: 'Default system' }, select({
        value: `${s.defaultSystemVoltage}-${s.defaultSystemPhases}`,
        options: SYSTEM_VOLTAGES.map((v) => ({ value: v.key, label: v.label })),
        onChange: (key) => {
          const v = SYSTEM_VOLTAGES.find((x) => x.key === key);
          if (v) updateSettings({ defaultSystemVoltage: v.volts, defaultSystemPhases: v.phases });
        },
      })),
      field({ label: 'Default module wattage' }, select({
        value: s.defaultPanelWattage,
        options: PANEL_WATTAGES.map((w) => ({ value: w, label: `${w} W` })),
        onChange: (v) => updateSettings({ defaultPanelWattage: Number(v) }),
      })),
      field({ label: 'Default system losses' }, numberInput({
        value: s.defaultSystemLossPercent, min: 0, max: 60, step: 1, suffix: '%',
        onInput: (v) => updateSettings({ defaultSystemLossPercent: Number(v) }),
      })),
      field({ label: 'Default inverter efficiency' }, numberInput({
        value: s.defaultInverterEfficiency, min: 0.5, max: 1, step: 0.005,
        onInput: (v) => updateSettings({ defaultInverterEfficiency: Number(v) }),
      })),
      field({ label: 'Default ambient temperature', hint: 'For cable derating.' }, numberInput({
        value: s.defaultAmbientC, min: -20, max: 90, suffix: '°C',
        onInput: (v) => updateSettings({ defaultAmbientC: Number(v) }),
      })),
      field({ label: 'Default voltage-drop limit' }, numberInput({
        value: s.defaultVoltageDropLimitPercent, min: 0.5, max: 25, step: 0.5, suffix: '%',
        onInput: (v) => updateSettings({ defaultVoltageDropLimitPercent: Number(v) }),
      })),
      field({
        label: 'Electricity tariff',
        hint: 'Pakistani tariffs are slab-based and revised periodically. Use your own bill.',
      }, numberInput({
        value: s.tariffPkrPerKwh, min: 0, step: 1, suffix: 'PKR/kWh',
        onInput: (v) => updateSettings({ tariffPkrPerKwh: Number(v) }),
      })),
      field({ label: 'Engineer name', hint: 'Appears on exported reports.' }, textInput({
        value: s.engineerName, placeholder: 'Your name',
        onInput: (v) => updateSettings({ engineerName: v }),
      })),
      field({ label: 'Organisation' }, textInput({
        value: s.organisation, placeholder: 'Company name',
        onInput: (v) => updateSettings({ organisation: v }),
      })),
    ]),
  ]));

  page.appendChild(card({
    title: 'Backup and restore',
    subtitle: 'Projects live in this browser only. Clearing site data deletes them.',
  }, [
    el('div.btn-row', null, [
      button({
        label: 'Download backup (JSON)',
        variant: 'primary',
        onClick: () => {
          const stamp = new Date().toISOString().slice(0, 10);
          downloadBlob(`powercalc-backup-${stamp}.json`, exportState(), 'application/json');
          toast('Backup downloaded.');
        },
      }),
      button({
        label: 'Restore from backup',
        onClick: () => {
          const picker = el('input', { type: 'file', accept: 'application/json,.json' });
          picker.addEventListener('change', async () => {
            const file = picker.files?.[0];
            if (!file) return;
            if (!confirm('Restoring replaces every project currently in this browser. Continue?')) return;
            const res = importState(await file.text());
            toast(res.message);
          });
          picker.click();
        },
      }),
      button({
        label: 'Restore the demo project',
        onClick: () => { restoreDemoProject(); toast('Demo project added.'); navigate('results'); },
      }),
      button({
        label: 'Delete everything',
        variant: 'danger',
        onClick: () => {
          if (confirm('Delete every project and reset all settings? This cannot be undone.')) {
            resetAll();
            toast('Everything reset.');
            navigate('dashboard');
          }
        },
      }),
    ]),
  ]));

  // ---- Reference data, shown openly rather than hidden in the code ----
  page.appendChild(card({
    title: 'Reference data used by the calculators',
    subtitle: 'Shown in full so you can judge whether it fits your project, rather than trusting a black box.',
  }, [
    detailsList('Ampacity base table', [
      AMPACITY_BASE._basis,
      `Two loaded conductors (single phase), A: ${Object.entries(AMPACITY_BASE.twoCore).map(([k, v]) => `${k} mm² = ${v}`).join('; ')}.`,
      `Three or four loaded conductors (three phase), A: ${Object.entries(AMPACITY_BASE.threeCore).map(([k, v]) => `${k} mm² = ${v}`).join('; ')}.`,
      `Conductor material factors: ${Object.values(MATERIAL_FACTORS).map((m) => `${m.label} ×${m.ampacityFactor}`).join('; ')}.`,
      `Insulation factors: ${Object.values(INSULATION_TYPES).map((i) => `${i.label} ×${i.ampacityFactor}`).join('; ')}.`,
      `Installation method factors: ${Object.values(INSTALLATION_METHODS).map((m) => `${m.key} ×${m.factor}`).join('; ')}.`,
    ], { tone: 'warn' }),
    detailsList('Peak sun hours by city', PAKISTAN_CITIES.map(
      (c) => `${c.name} — ${c.peakSunHours} kWh/m²/day, latitude ${c.latitude}°.`,
    )),
    el('p.note', {
      text: 'These tables are indicative values compiled for preliminary estimating. They are '
        + 'shaped after the IEC 60364-5-52 / BS 7671 family of tables and published solar '
        + 'resource data, but this app is not a standards document and has no standards-body '
        + 'status. Check every value a design depends on against the current edition of the '
        + 'applicable standard, the cable manufacturer\'s datasheet, and site-measured '
        + 'irradiation data.',
    }),
  ]));

  page.appendChild(card({ title: 'About' }, [
    el('p', { text: 'PowerCalc Pakistan — electrical load and solar sizing for engineers, technicians, solar installers and facility teams.' }),
    el('p.muted', { text: 'Runs entirely in your browser. No account, no server, no data leaves this device. Works offline once loaded.' }),
    el('p.muted', { text: 'The calculation engine is separate from the interface and is covered by an automated test suite, so the numbers can be checked independently of the screens that display them.' }),
  ]));

  return page;
}
