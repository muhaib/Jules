// Tiny DOM helper library — no framework, keeps the zero-dependency
// convention of this project. `h()` builds elements; everything else is a
// small set of reusable visual components shared across views.

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked') el.checked = value;
    else if (key === 'disabled') el.disabled = value;
    else el.setAttribute(key, value);
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    appendChild(el, child);
  }
  return el;
}

function appendChild(el, child) {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) appendChild(el, c);
    return;
  }
  el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function mount(container, node) {
  clear(container);
  container.appendChild(node);
}

// ---------- Status ----------

export const STATUS_META = {
  ok: { icon: '🟢', label: 'Within Budget', className: 'status-ok' },
  approaching: { icon: '🟡', label: 'Approaching Limit', className: 'status-approaching' },
  high: { icon: '🟠', label: 'High Usage', className: 'status-high' },
  exceeded: { icon: '🔴', label: 'Over Budget', className: 'status-exceeded' },
};

export function statusPill(status) {
  const meta = STATUS_META[status] || STATUS_META.ok;
  return h('span', { class: `pill ${meta.className}` }, `${meta.icon} ${meta.label}`);
}

// ---------- Progress bar ----------

export function progressBar(percentUsed, status) {
  const meta = STATUS_META[status] || STATUS_META.ok;
  const width = Math.min(100, Math.max(0, percentUsed));
  return h('div', { class: 'progress-track' }, [
    h('div', { class: `progress-fill ${meta.className}`, style: `width:${width}%` }),
  ]);
}

// ---------- Card / group budget row ----------

export function budgetGroupCard(group, currency, formatMoney) {
  return h('div', { class: 'card budget-card' }, [
    h('div', { class: 'budget-card-head' }, [
      h('span', { class: 'budget-card-label' }, group.label),
      statusPill(group.status),
    ]),
    h('div', { class: 'budget-card-amounts' }, [
      h('span', { class: 'amount-spent' }, formatMoney(group.spent, currency)),
      h('span', { class: 'amount-sep' }, ' / '),
      h('span', { class: 'amount-allocated' }, formatMoney(group.allocated, currency)),
    ]),
    progressBar(group.percentUsed, group.status),
    h('div', { class: 'budget-card-foot' }, [
      h('span', {}, `${Math.round(group.percentUsed)}% Used`),
      group.status === 'exceeded'
        ? h('span', { class: 'text-danger' }, `Exceeded by ${formatMoney(group.exceededBy, currency)}`)
        : h('span', { class: 'text-muted' }, `${formatMoney(group.remaining, currency)} remaining`),
    ]),
  ]);
}

// ---------- Buttons ----------

export function button(label, { variant = 'primary', onClick, type = 'button', className = '' } = {}) {
  return h('button', { type, class: `btn btn-${variant} ${className}`, onclick: onClick }, label);
}

// ---------- Form field ----------

export function field(labelText, inputEl, errorText) {
  return h('label', { class: 'field' }, [
    h('span', { class: 'field-label' }, labelText),
    inputEl,
    errorText ? h('span', { class: 'field-error' }, errorText) : null,
  ]);
}

export function textInput({ value = '', type = 'text', placeholder = '', oninput, name, step, min } = {}) {
  return h('input', { type, value, placeholder, name, step, min, oninput: oninput ? (e) => oninput(e.target.value) : null });
}

export function selectInput({ options, value, onchange, name } = {}) {
  const el = h('select', { name, onchange: onchange ? (e) => onchange(e.target.value) : null },
    options.map((opt) => h('option', { value: opt.value, selected: opt.value === value }, opt.label)));
  return el;
}

// ---------- Alert banner ----------

export function alertBanner(alert) {
  return h('div', { class: `alert-banner alert-${alert.level}` }, [
    h('span', { class: 'alert-icon' }, alert.icon),
    h('div', { class: 'alert-text' }, [
      h('div', {}, alert.message),
      alert.detail ? h('div', { class: 'alert-detail' }, alert.detail) : null,
    ]),
  ]);
}

// ---------- Page scaffold ----------

export function page(title, contentNodes, { back } = {}) {
  return h('div', { class: 'page' }, [
    h('header', { class: 'page-header' }, [
      back ? h('button', { class: 'back-btn', onclick: back, 'aria-label': 'Back' }, '←') : null,
      h('h1', {}, title),
    ]),
    h('div', { class: 'page-content' }, contentNodes),
  ]);
}

export function emptyState(message) {
  return h('div', { class: 'empty-state' }, message);
}
