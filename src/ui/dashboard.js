/**
 * Dashboard: the tool launcher plus a live snapshot of recent projects.
 * @module ui/dashboard
 */

import { el, card, stat, button, fmt } from './components.js';
import { getProjects, getActiveProject, setActiveProject, addProject, toEngineInputs } from '../store.js';
import { calculateProject } from '../engine/index.js';

/** The tools shown as tiles, in the order the spec lists them. */
export const TOOLS = [
  { route: 'load', icon: '⚡', name: 'Load Calculator', desc: 'Connected load, maximum demand, power factor and current' },
  { route: 'cable', icon: '🧵', name: 'Cable Calculator', desc: 'Conductor size, ampacity, derating and breaker' },
  { route: 'solar', icon: '☀️', name: 'Solar Calculator', desc: 'PV capacity, modules, roof area and inverter' },
  { route: 'vdrop', icon: '📉', name: 'Voltage Drop', desc: 'Drop in volts and percent for any run' },
  { route: 'results', icon: '📊', name: 'Results', desc: 'Headline figures and engineering assumptions' },
  { route: 'boq', icon: '📋', name: 'BOQ Generator', desc: 'Editable bill of quantities, Excel and PDF' },
  { route: 'projects', icon: '🗂️', name: 'Saved Projects', desc: 'Create, duplicate, edit and delete projects' },
  { route: 'settings', icon: '⚙️', name: 'Settings', desc: 'Defaults, tariff, backup and restore' },
];

/**
 * A one-line summary of a project, computed live from its stored inputs.
 * @param {object} project
 * @returns {{ loadKW: number, pvKWp: number, panels: number, inverterKW: number, currentA: number }}
 */
export function projectSummary(project) {
  try {
    const r = calculateProject(toEngineInputs(project));
    return {
      loadKW: r.load.maximumDemandKW,
      currentA: r.load.demandCurrentA,
      pvKWp: r.panels.installedCapacityKWp,
      panels: r.panels.panelCount,
      inverterKW: r.inverter.recommendedKW,
    };
  } catch {
    return { loadKW: NaN, currentA: NaN, pvKWp: NaN, panels: 0, inverterKW: NaN };
  }
}

/**
 * @param {(route: string) => void} navigate
 * @returns {HTMLElement}
 */
export function renderDashboard(navigate) {
  const projects = getProjects();
  const active = getActiveProject();
  const summary = active ? projectSummary(active) : null;

  const page = el('div');

  page.appendChild(el('div.page-head', null, [
    el('h1.page-title', { text: 'Dashboard' }),
    el('p.page-desc', {
      text: 'Electrical load and solar sizing for Pakistani installations. '
        + 'Every figure below is recalculated from the current project inputs — nothing is stored as a result.',
    }),
  ]));

  if (active && summary) {
    page.appendChild(card({
      title: active.name,
      subtitle: [active.location, active.client].filter(Boolean).join(' · ') || 'Active project',
      actions: [
        button({ label: 'Open results', variant: 'primary', small: true, onClick: () => navigate('results') }),
      ],
    }, [
      el('div.stat-grid', null, [
        stat({ label: 'Maximum demand', value: fmt(summary.loadKW, 1), unit: 'kW' }),
        stat({ label: 'Demand current', value: fmt(summary.currentA, 1), unit: 'A' }),
        stat({ label: 'Solar PV', value: fmt(summary.pvKWp, 1), unit: 'kWp', tone: 'accent' }),
        stat({ label: 'Modules', value: String(summary.panels), unit: 'No.' }),
      ]),
    ]));
  }

  page.appendChild(card({ title: 'Calculators' }, [
    el('div.tool-grid', null, TOOLS.map((t) => el('button.tool-tile', {
      type: 'button',
      onClick: () => navigate(t.route),
    }, [
      el('span.tool-icon', { text: t.icon }),
      el('span.tool-name', { text: t.name }),
      el('span.tool-desc', { text: t.desc }),
    ]))),
  ]));

  const recent = [...projects]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 5);

  page.appendChild(card({
    title: 'Recent projects',
    subtitle: recent.length ? `${projects.length} saved on this device` : undefined,
    actions: [
      button({ label: 'New project', small: true, onClick: () => { addProject(); navigate('projects'); } }),
      projects.length > 5
        ? button({ label: 'See all', variant: 'ghost', small: true, onClick: () => navigate('projects') })
        : null,
    ].filter(Boolean),
  }, recent.length === 0
    ? [el('p.muted', { text: 'No projects yet. Create one to get started.' })]
    : recent.map((p) => {
      const s = projectSummary(p);
      return el('button.project-card', {
        type: 'button',
        class: p.id === active?.id ? 'is-active' : null,
        onClick: () => { setActiveProject(p.id); navigate('results'); },
      }, [
        el('div.project-card-top', null, [
          el('div', null, [
            el('div.project-card-name', { text: p.name }),
            el('div.project-card-loc', { text: [p.location, p.client].filter(Boolean).join(' · ') }),
          ]),
          el('span.badge', { class: `badge-${String(p.status).replace(/\s/g, '.')}`, text: p.status }),
        ]),
        el('div.project-card-figs', null, [
          fig('Load', `${fmt(s.loadKW, 1)} kW`),
          fig('Solar', `${fmt(s.pvKWp, 1)} kWp`),
          fig('Panels', String(s.panels)),
          fig('Inverter', `${fmt(s.inverterKW, 0)} kW`),
        ]),
      ]);
    })));

  return page;
}

/**
 * @param {string} label
 * @param {string} value
 * @returns {HTMLElement}
 */
const fig = (label, value) => el('div.project-fig', null, [
  el('div.project-fig-label', { text: label }),
  el('div.project-fig-value', { text: value }),
]);
