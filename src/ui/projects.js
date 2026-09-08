/**
 * Saved Projects — create, open, edit metadata, duplicate, delete and export.
 * @module ui/projects
 */

import {
  el, card, field, textInput, select, button, table, fmt,
} from './components.js';
import {
  getProjects, getActiveProject, setActiveProject, addProject, duplicateProject,
  deleteProject, updateActiveProject, setField, toEngineInputs, PROJECT_STATUSES,
} from '../store.js';
import { calculateProject } from '../engine/index.js';
import { projectSummary } from './dashboard.js';
import { reportHtml, workbookSheets } from '../export/report.js';
import { createXlsx } from '../export/xlsx.js';
import { printHtml } from '../export/print.js';
import { downloadXlsx, slugify } from '../export/download.js';

/**
 * @param {(route: string) => void} navigate
 * @param {(msg: string) => void} toast
 * @returns {HTMLElement}
 */
export function renderProjects(navigate, toast) {
  const projects = getProjects();
  const active = getActiveProject();

  const page = el('div');
  page.appendChild(el('div.page-head', null, [
    el('h1.page-title', { text: 'Saved Projects' }),
    el('p.page-desc', {
      text: 'Projects are stored in this browser only — nothing is uploaded. '
        + 'Use Settings → Backup to move them between devices.',
    }),
  ]));

  // ---- Active project details ----
  if (active) {
    page.appendChild(card({
      title: 'Project details',
      subtitle: `Last edited ${new Date(active.updatedAt).toLocaleString('en-GB')}`,
      actions: [
        button({ label: 'Open results', variant: 'primary', small: true, onClick: () => navigate('results') }),
      ],
    }, [
      el('div.form-grid', null, [
        field({ label: 'Project name' }, textInput({
          value: active.name, onInput: (v) => setField('name', v),
        })),
        field({ label: 'Client' }, textInput({
          value: active.client, placeholder: 'Client or organisation',
          onInput: (v) => setField('client', v),
        })),
        field({ label: 'Location' }, textInput({
          value: active.location, placeholder: 'City, Pakistan',
          onInput: (v) => setField('location', v),
        })),
        field({ label: 'Prepared by' }, textInput({
          value: active.engineer, placeholder: 'Engineer name',
          onInput: (v) => setField('engineer', v),
        })),
        field({ label: 'Status' }, select({
          value: active.status,
          options: PROJECT_STATUSES.map((s) => ({ value: s, label: s })),
          onChange: (v) => setField('status', v),
        })),
        field({ label: 'Notes', wide: true }, el('textarea.input', {
          rows: '3',
          placeholder: 'Scope, site constraints, decisions taken…',
          onInput: (e) => setField('notes', e.target.value),
        }, active.notes || '')),
      ]),

      el('div.btn-row', { style: { marginTop: '14px' } }, [
        button({
          label: 'Export report (PDF)',
          onClick: () => {
            const r = calculateProject(toEngineInputs(active));
            printHtml(reportHtml(active, r, active.boqLines ?? r.boq.lines), slugify(active.name));
            toast('Report opened in the print dialog — choose "Save as PDF".');
          },
        }),
        button({
          label: 'Export workbook (Excel)',
          onClick: () => {
            const r = calculateProject(toEngineInputs(active));
            downloadXlsx(
              `${slugify(active.name)}-report.xlsx`,
              createXlsx(workbookSheets(active, r, active.boqLines ?? r.boq.lines)),
            );
            toast('Workbook downloaded.');
          },
        }),
        button({
          label: 'Duplicate',
          onClick: () => {
            const copy = duplicateProject(active.id);
            if (copy) toast(`Duplicated as "${copy.name}".`);
          },
        }),
        button({
          label: 'Delete',
          variant: 'danger',
          disabled: projects.length <= 1,
          title: projects.length <= 1 ? 'Keep at least one project' : undefined,
          onClick: () => {
            if (confirm(`Delete "${active.name}"? This cannot be undone.`)) {
              deleteProject(active.id);
              toast('Project deleted.');
            }
          },
        }),
      ]),
    ]));
  }

  // ---- All projects ----
  page.appendChild(card({
    title: 'All projects',
    subtitle: `${projects.length} stored on this device`,
    actions: [
      button({
        label: '+ New project',
        variant: 'primary',
        small: true,
        onClick: () => {
          const name = prompt('Project name', 'New project');
          if (name === null) return;
          addProject({ name: name.trim() || 'Untitled project' });
          toast('Project created.');
        },
      }),
    ],
  }, [
    table({
      headers: ['Project', 'Location', 'Status', { label: 'Load kW', align: 'right' },
        { label: 'Solar kWp', align: 'right' }, { label: 'Panels', align: 'right' },
        { label: 'Inverter kW', align: 'right' }, 'Updated', ''],
      empty: 'No projects yet.',
      rows: [...projects]
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .map((p) => {
          const s = projectSummary(p);
          const cells = [
            el('td', null, el('button.btn.btn-ghost.btn-sm', {
              type: 'button',
              text: p.name,
              onClick: () => { setActiveProject(p.id); navigate('results'); },
            })),
            el('td', { text: p.location || '—' }),
            el('td', null, el('span.badge', {
              class: `badge-${String(p.status).replace(/\s/g, '.')}`, text: p.status,
            })),
            el('td.num', { text: fmt(s.loadKW, 1) }),
            el('td.num', { text: fmt(s.pvKWp, 1) }),
            el('td.num', { text: String(s.panels) }),
            el('td.num', { text: fmt(s.inverterKW, 0) }),
            el('td', { text: new Date(p.updatedAt).toLocaleDateString('en-GB') }),
            el('td', null, el('div.row-actions', null, [
              button({
                label: 'Open', small: true,
                onClick: () => { setActiveProject(p.id); navigate('results'); },
              }),
              button({
                label: 'Copy', small: true, variant: 'subtle',
                onClick: () => { duplicateProject(p.id); toast('Duplicated.'); },
              }),
              button({
                label: '✕', small: true, variant: 'danger',
                disabled: projects.length <= 1,
                onClick: () => {
                  if (confirm(`Delete "${p.name}"?`)) { deleteProject(p.id); toast('Project deleted.'); }
                },
              }),
            ])),
          ];
          if (p.id === active?.id) cells.forEach((c) => c.classList.add('is-chosen'));
          return cells;
        }),
    }),
  ]));

  return page;
}
