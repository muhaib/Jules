/**
 * Application shell: hash router, navigation and render loop.
 *
 * The whole page is re-rendered from state on every change. That is fast enough
 * at this scale and it guarantees the numbers on screen always come from the
 * current inputs — there is no path by which a stale result can survive.
 *
 * @module main
 */

import { el, clear } from './ui/components.js';
import { subscribe, getActiveProject, getProjects, setActiveProject } from './store.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderLoadCalculator } from './ui/loadCalc.js';
import { renderCableCalculator } from './ui/cableCalc.js';
import { renderSolarCalculator } from './ui/solarCalc.js';
import { renderVoltageDropCalculator } from './ui/vdropCalc.js';
import { renderResults } from './ui/results.js';
import { renderBoq } from './ui/boqView.js';
import { renderProjects } from './ui/projects.js';
import { renderSettings } from './ui/settings.js';

/** Routes, in navigation order. `primary` items get a slot in the bottom bar. */
const ROUTES = [
  { key: 'dashboard', label: 'Dashboard', icon: '⌂', primary: true, render: renderDashboard },
  { key: 'load', label: 'Load', icon: '⚡', primary: true, render: renderLoadCalculator },
  { key: 'solar', label: 'Solar', icon: '☀', primary: true, render: renderSolarCalculator },
  { key: 'results', label: 'Results', icon: '📊', primary: true, render: renderResults },
  { key: 'cable', label: 'Cable', icon: '🧵', render: renderCableCalculator },
  { key: 'vdrop', label: 'Volt drop', icon: '📉', render: renderVoltageDropCalculator },
  { key: 'boq', label: 'BOQ', icon: '📋', render: renderBoq },
  { key: 'projects', label: 'Projects', icon: '🗂', render: renderProjects },
  { key: 'settings', label: 'Settings', icon: '⚙', render: renderSettings },
];

const DEFAULT_ROUTE = 'dashboard';

/** @returns {string} */
function currentRoute() {
  const key = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES.some((r) => r.key === key) ? key : DEFAULT_ROUTE;
}

/** @param {string} key */
function navigate(key) {
  if (currentRoute() === key) render();
  else window.location.hash = `#/${key}`;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

let toastTimer = null;

/** @param {string} message */
function toast(message) {
  document.querySelector('.toast')?.remove();
  const node = el('div.toast', { role: 'status', 'aria-live': 'polite', text: message });
  document.body.appendChild(node);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 4200);
}

/** @returns {HTMLElement} */
function renderHeader() {
  const project = getActiveProject();
  const projects = getProjects();

  return el('header.app-header', null, el('div.app-header-inner', null, [
    el('button.brand', {
      type: 'button',
      style: { background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' },
      onClick: () => navigate('dashboard'),
    }, [
      el('span.brand-mark', { text: 'P' }),
      el('span', null, [
        el('div.brand-name', { text: 'PowerCalc Pakistan' }),
        el('div.brand-sub', { text: 'Electrical & Solar Sizing' }),
      ]),
    ]),

    project
      ? el('div.header-project', null, [
        el('label.sr-only', { for: 'project-switcher', text: 'Active project' }),
        el('select.input.select', {
          id: 'project-switcher',
          style: { maxWidth: '48vw', fontSize: '13px', padding: '6px 28px 6px 9px' },
          onChange: (e) => setActiveProject(e.target.value),
        }, projects.map((p) => el('option', {
          value: p.id, selected: p.id === project.id, text: p.name,
        }))),
      ])
      : null,
  ]));
}

/** @param {string} active @returns {HTMLElement} */
function renderNav(active) {
  const primary = ROUTES.filter((r) => r.primary);
  const overflow = ROUTES.filter((r) => !r.primary);
  const overflowActive = overflow.some((r) => r.key === active);

  const item = (route) => el('button.nav-item', {
    type: 'button',
    class: route.key === active ? 'is-active' : null,
    'aria-current': route.key === active ? 'page' : null,
    onClick: () => navigate(route.key),
  }, [
    el('span.nav-icon', { text: route.icon, 'aria-hidden': 'true' }),
    el('span', { text: route.label }),
  ]);

  return el('nav.nav', { 'aria-label': 'Sections' }, [
    ...primary.map(item),
    // On desktop every route gets a tab; on mobile the rest live behind "More".
    ...overflow.map((r) => {
      const node = item(r);
      node.classList.add('nav-desktop-only');
      return node;
    }),
    el('button.nav-item.nav-more', {
      type: 'button',
      class: overflowActive ? 'is-active' : null,
      onClick: () => openSheet(active),
    }, [
      el('span.nav-icon', { text: '⋯', 'aria-hidden': 'true' }),
      el('span', { text: 'More' }),
    ]),
  ]);
}

/** @param {string} active */
function openSheet(active) {
  const close = () => document.querySelector('.nav-sheet')?.remove();
  const sheet = el('div.nav-sheet', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'More sections',
    onClick: (e) => { if (e.target === e.currentTarget) close(); },
  }, el('div.nav-sheet-panel', null, [
    el('div.nav-sheet-title', { text: 'All sections' }),
    el('div.nav-sheet-grid', null, ROUTES.map((r) => el('button.nav-sheet-item', {
      type: 'button',
      class: r.key === active ? 'is-active' : null,
      onClick: () => { close(); navigate(r.key); },
    }, [
      el('span', { text: r.icon, 'aria-hidden': 'true', style: { fontSize: '18px' } }),
      el('span', { text: r.label }),
    ]))),
  ]));
  document.body.appendChild(sheet);
}

function render() {
  const active = currentRoute();
  const route = ROUTES.find((r) => r.key === active) ?? ROUTES[0];
  const root = document.getElementById('app');
  if (!root) return;

  const scrollY = window.scrollY;
  const focusedId = document.activeElement?.id || null;
  const focusedSelector = describeFocus(document.activeElement);
  const selectionStart = document.activeElement?.selectionStart ?? null;

  clear(root);
  root.appendChild(renderHeader());
  root.appendChild(renderNav(active));

  const page = el('main.page', { id: 'main' });
  try {
    page.appendChild(route.render(navigate, toast));
  } catch (err) {
    console.error(err);
    page.appendChild(el('div.issue-block.is-error', null, [
      el('div.issue-title', { text: 'This page could not be drawn' }),
      el('p', { text: String(err && err.message ? err.message : err) }),
      el('p.muted', { text: 'The inputs are still saved. Try another section, or reset the project from Settings.' }),
    ]));
  }
  root.appendChild(page);

  // Re-rendering the whole page loses focus, which makes typing in a table
  // cell impossible. Put the caret back where it was.
  restoreFocus(focusedId, focusedSelector, selectionStart);
  window.scrollTo(0, scrollY);
}

/**
 * A stable-enough description of the focused control to find it again after a
 * re-render: its position among inputs of the same type inside the page.
 * @param {Element|null} node
 * @returns {{ index: number, tag: string }|null}
 */
function describeFocus(node) {
  if (!node || !(node instanceof HTMLElement)) return null;
  if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(node.tagName)) return null;
  const all = Array.from(document.querySelectorAll('#app input, #app select, #app textarea'));
  const index = all.indexOf(node);
  return index === -1 ? null : { index, tag: node.tagName };
}

/**
 * @param {string|null} id
 * @param {{index:number, tag:string}|null} descriptor
 * @param {number|null} caret
 */
function restoreFocus(id, descriptor, caret) {
  let target = id ? document.getElementById(id) : null;
  if (!target && descriptor) {
    const all = Array.from(document.querySelectorAll('#app input, #app select, #app textarea'));
    const candidate = all[descriptor.index];
    if (candidate && candidate.tagName === descriptor.tag) target = candidate;
  }
  if (!target) return;
  target.focus({ preventScroll: true });
  if (caret !== null && typeof target.setSelectionRange === 'function' && target.type !== 'number') {
    try { target.setSelectionRange(caret, caret); } catch { /* not all inputs allow this */ }
  }
}

window.addEventListener('hashchange', render);
subscribe(render);

if (!window.location.hash) window.location.hash = `#/${DEFAULT_ROUTE}`;
render();
