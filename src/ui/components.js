/**
 * Small DOM helpers. No framework — just enough structure to keep the views
 * declarative and to make sure user-supplied text is always set via
 * textContent rather than innerHTML.
 * @module ui/components
 */

import { fmt } from '../engine/units.js';
import { ENGINEERING_DISCLAIMER } from '../engine/constants.js';

/**
 * Create an element.
 * @param {string} tag  Tag name, optionally with `.class` and `#id` suffixes, e.g. 'div.card#main'.
 * @param {Object|null} [props] Attributes, `class`, `style`, `on*` handlers, `dataset`.
 * @param {Array<Node|string|null|undefined|false>|Node|string} [children]
 * @returns {HTMLElement}
 */
export function el(tag, props = null, children = []) {
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const node = document.createElement(name || 'div');

  for (const token of rest) {
    if (token.startsWith('.')) node.classList.add(token.slice(1));
    else if (token.startsWith('#')) node.id = token.slice(1);
  }

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') {
        for (const c of String(value).split(/\s+/).filter(Boolean)) node.classList.add(c);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(node.style, value);
      } else if (key === 'dataset') {
        Object.assign(node.dataset, value);
      } else if (key === 'text') {
        node.textContent = String(value);
      } else if (key === 'html') {
        node.innerHTML = String(value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected') {
        node[key] = value;
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }

  appendChildren(node, children);
  return node;
}

/**
 * @param {Node} node
 * @param {unknown} children
 */
export function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false || child === '') continue;
    if (Array.isArray(child)) appendChildren(node, child);
    else if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
}

/** Remove all children from a node. @param {Node} node */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * A titled card.
 * @param {{ title?: string, subtitle?: string, actions?: Node|Node[], class?: string }} opts
 * @param {Array<Node|string>} children
 * @returns {HTMLElement}
 */
export function card(opts = {}, children = []) {
  const head = (opts.title || opts.actions)
    ? el('div.card-head', null, [
      el('div', null, [
        opts.title ? el('h2.card-title', { text: opts.title }) : null,
        opts.subtitle ? el('p.card-sub', { text: opts.subtitle }) : null,
      ]),
      opts.actions ? el('div.card-actions', null, opts.actions) : null,
    ])
    : null;
  return el('section.card', { class: opts.class }, [head, el('div.card-body', null, children)]);
}

/**
 * A labelled form field.
 * @param {{ label: string, hint?: string, error?: string, warning?: string, wide?: boolean }} opts
 * @param {Node} control
 * @returns {HTMLElement}
 */
export function field(opts, control) {
  return el('label.field', { class: opts.wide ? 'field-wide' : null }, [
    el('span.field-label', { text: opts.label }),
    control,
    opts.hint ? el('span.field-hint', { text: opts.hint }) : null,
    opts.error ? el('span.field-msg.is-error', { text: opts.error }) : null,
    opts.warning && !opts.error ? el('span.field-msg.is-warning', { text: opts.warning }) : null,
  ]);
}

/**
 * A number input wired to an onChange callback.
 * @param {{ value: unknown, onInput: (v: string) => void, step?: string|number, min?: number, max?: number, placeholder?: string, invalid?: boolean, suffix?: string, disabled?: boolean }} opts
 * @returns {HTMLElement}
 */
export function numberInput(opts) {
  const input = el('input.input', {
    type: 'number',
    inputmode: 'decimal',
    value: opts.value ?? '',
    step: opts.step ?? 'any',
    min: opts.min,
    max: opts.max,
    placeholder: opts.placeholder,
    disabled: opts.disabled,
    class: opts.invalid ? 'is-invalid' : null,
    onInput: (e) => opts.onInput(e.target.value),
  });
  if (!opts.suffix) return input;
  return el('span.input-group', null, [input, el('span.input-suffix', { text: opts.suffix })]);
}

/**
 * @param {{ value: unknown, onInput: (v: string) => void, placeholder?: string, invalid?: boolean, disabled?: boolean }} opts
 * @returns {HTMLElement}
 */
export const textInput = (opts) => el('input.input', {
  type: 'text',
  value: opts.value ?? '',
  placeholder: opts.placeholder,
  disabled: opts.disabled,
  class: opts.invalid ? 'is-invalid' : null,
  onInput: (e) => opts.onInput(e.target.value),
});

/**
 * @param {{ value: unknown, options: Array<{value: string|number, label: string}>, onChange: (v: string) => void, disabled?: boolean }} opts
 * @returns {HTMLElement}
 */
export const select = (opts) => el('select.input.select', {
  disabled: opts.disabled,
  onChange: (e) => opts.onChange(e.target.value),
}, opts.options.map((o) => el('option', {
  value: o.value,
  selected: String(o.value) === String(opts.value),
  text: o.label,
})));

/**
 * A segmented control — used for phase, sizing mode and similar binary choices.
 * @param {{ value: unknown, options: Array<{value: string|number, label: string}>, onChange: (v: string) => void }} opts
 * @returns {HTMLElement}
 */
export const segmented = (opts) => el('div.segmented', { role: 'group' },
  opts.options.map((o) => el('button.segment', {
    type: 'button',
    class: String(o.value) === String(opts.value) ? 'is-active' : null,
    'aria-pressed': String(String(o.value) === String(opts.value)),
    text: o.label,
    onClick: () => opts.onChange(String(o.value)),
  })));

/**
 * A large result tile.
 * @param {{ label: string, value: string, unit?: string, note?: string, tone?: 'default'|'accent'|'muted' }} opts
 * @returns {HTMLElement}
 */
export const stat = (opts) => el('div.stat', { class: opts.tone ? `stat-${opts.tone}` : null }, [
  el('div.stat-label', { text: opts.label }),
  el('div.stat-value', null, [
    opts.value,
    opts.unit ? el('span.stat-unit', { text: opts.unit }) : null,
  ]),
  opts.note ? el('div.stat-note', { text: opts.note }) : null,
]);

/**
 * A compact label/value row.
 * @param {string} label
 * @param {string|Node} value
 * @param {string} [unit]
 * @returns {HTMLElement}
 */
export const kv = (label, value, unit) => el('div.kv-row', null, [
  el('span.kv-label', { text: label }),
  el('span.kv-value', null, [value, unit ? el('span.kv-unit', { text: unit }) : null]),
]);

/**
 * A data table with a horizontally scrollable wrapper, so wide engineering
 * tables never force the page itself to scroll sideways.
 * @param {{ headers: Array<string|{label:string, align?:string}>, rows: Array<Array<Node|string|number>>, empty?: string, class?: string }} opts
 * @returns {HTMLElement}
 */
export function table(opts) {
  const head = el('thead', null, el('tr', null, opts.headers.map((h) => {
    const spec = typeof h === 'string' ? { label: h } : h;
    return el('th', { class: spec.align === 'right' ? 'num' : null, text: spec.label });
  })));

  const body = opts.rows.length
    ? el('tbody', null, opts.rows.map((r) => el('tr', null, r.map((cell) => (
      cell instanceof HTMLTableCellElement ? cell : el('td', null, cell)
    )))))
    : el('tbody', null, el('tr', null, el('td', {
      colspan: String(opts.headers.length),
      class: 'empty-cell',
      text: opts.empty ?? 'Nothing to show yet.',
    })));

  return el('div.table-wrap', null, el('table.table', { class: opts.class }, [head, body]));
}

/** A right-aligned numeric table cell. @param {string|Node} content @returns {HTMLElement} */
export const numCell = (content) => el('td.num', null, content);

/**
 * @param {{ label: string, onClick: () => void, variant?: 'primary'|'ghost'|'danger'|'subtle', small?: boolean, disabled?: boolean, title?: string }} opts
 * @returns {HTMLElement}
 */
export const button = (opts) => el('button.btn', {
  type: 'button',
  class: [opts.variant ? `btn-${opts.variant}` : '', opts.small ? 'btn-sm' : ''].filter(Boolean).join(' ') || null,
  disabled: opts.disabled,
  title: opts.title,
  text: opts.label,
  onClick: opts.onClick,
});

/**
 * Render validation issues as a list. Errors first.
 * @param {import('../engine/validation.js').Issue[]} issues
 * @returns {HTMLElement|null}
 */
export function issueList(issues) {
  if (!issues || issues.length === 0) return null;
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  return el('div.issues', null, [
    errors.length
      ? el('div.issue-block.is-error', null, [
        el('div.issue-title', { text: errors.length === 1 ? '1 input needs fixing' : `${errors.length} inputs need fixing` }),
        el('ul', null, errors.map((i) => el('li', { text: i.message }))),
      ])
      : null,
    warnings.length
      ? el('div.issue-block.is-warning', null, [
        el('div.issue-title', { text: 'Worth checking' }),
        el('ul', null, warnings.map((i) => el('li', { text: i.message }))),
      ])
      : null,
  ]);
}

/**
 * The disclaimer that must appear on every calculation page.
 * @returns {HTMLElement}
 */
export const disclaimer = () => el('p.disclaimer', null, [
  el('strong', { text: 'Preliminary estimate. ' }),
  ENGINEERING_DISCLAIMER,
]);

/**
 * A collapsible block of assumptions or caveats.
 * @param {string} title
 * @param {string[]} items
 * @param {{ open?: boolean, tone?: 'note'|'warn' }} [opts]
 * @returns {HTMLElement|null}
 */
export function detailsList(title, items, opts = {}) {
  if (!items || items.length === 0) return null;
  return el('details.assumptions', { open: opts.open ? '' : null, class: opts.tone === 'warn' ? 'is-warn' : null }, [
    el('summary', null, [
      el('span.assumptions-title', { text: title }),
      el('span.assumptions-count', { text: String(items.length) }),
    ]),
    el('ul', null, items.map((a) => el('li', { text: a }))),
  ]);
}

/**
 * A horizontal bar chart, drawn as inline SVG so it prints and needs no library.
 * @param {{ label: string, value: number, tone?: string }[]} series
 * @param {{ unit?: string, decimals?: number, height?: number }} [opts]
 * @returns {HTMLElement}
 */
export function barChart(series, opts = {}) {
  const rows = series.filter((s) => Number.isFinite(s.value));
  if (rows.length === 0) return el('p.muted', { text: 'No data to plot yet.' });

  const max = Math.max(...rows.map((s) => Math.abs(s.value)), 1e-9);
  return el('div.chart', null, rows.map((s) => {
    const pct = Math.max(0, (s.value / max) * 100);
    return el('div.chart-row', null, [
      el('div.chart-label', { text: s.label }),
      el('div.chart-track', null,
        el('div.chart-bar', {
          class: s.tone ? `tone-${s.tone}` : null,
          style: { width: `${pct.toFixed(2)}%` },
        })),
      el('div.chart-value', {
        text: `${fmt(s.value, opts.decimals ?? 1)}${opts.unit ? ` ${opts.unit}` : ''}`,
      }),
    ]);
  }));
}

/**
 * A stacked monthly generation profile, drawn as an inline SVG column chart.
 * @param {number[]} values Twelve monthly values.
 * @param {{ unit?: string }} [opts]
 * @returns {HTMLElement}
 */
export function monthChart(values, opts = {}) {
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const max = Math.max(...values, 1e-9);
  return el('div.month-chart', null, values.map((v, i) => el('div.month-col', {
    title: `${months[i]}: ${fmt(v, 0)}${opts.unit ? ` ${opts.unit}` : ''}`,
  }, [
    el('div.month-bar-track', null,
      el('div.month-bar', { style: { height: `${((v / max) * 100).toFixed(1)}%` } })),
    el('div.month-label', { text: months[i] }),
  ])));
}

/** Format helper re-exported for the views. */
export { fmt };
