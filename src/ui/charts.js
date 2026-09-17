// Minimal dependency-free SVG chart primitives: a donut (category / group
// breakdown) and a bar chart (monthly trend). Both take plain {label,
// value, color} data and return an <svg> element.

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export const PALETTE = {
  needs: '#3b82f6',
  wants: '#a855f7',
  savings: '#22c55e',
  debt: '#f97316',
  spending: '#3b82f6',
  expenses: '#3b82f6',
  neutral: '#94a3b8',
};

export function colorFor(id, index) {
  return PALETTE[id] || ['#3b82f6', '#a855f7', '#22c55e', '#f97316', '#eab308', '#ec4899', '#14b8a6'][index % 7];
}

export function donutChart(data, { size = 180, thickness = 22 } = {}) {
  const total = data.reduce((a, d) => a + Math.max(0, d.value), 0);
  const radius = size / 2;
  const innerRadius = radius - thickness;
  const root = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': 'Spending breakdown chart' });
  const group = svg('g', { transform: `translate(${radius},${radius})` });
  root.appendChild(group);

  if (total <= 0) {
    group.appendChild(svg('circle', { r: radius - thickness / 2, fill: 'none', stroke: '#e2e8f0', 'stroke-width': thickness }));
    return root;
  }

  let angle = -Math.PI / 2;
  data.forEach((d, i) => {
    const value = Math.max(0, d.value);
    if (value <= 0) return;
    const fraction = value / total;
    // Cap just under a full turn: an SVG arc whose start and end points
    // coincide (an exact 360° sweep, e.g. a single-slice donut) collapses
    // to nothing, so a lone or final full-circle segment must stop short.
    const sweep = Math.min(fraction * Math.PI * 2, Math.PI * 2 - 0.001);
    const nextAngle = angle + sweep;
    const path = arcPath(0, 0, radius - thickness / 2, angle, nextAngle, thickness);
    const el = svg('path', { d: path, fill: d.color || colorFor(d.id, i) });
    const title = svg('title', {});
    title.textContent = `${d.label}: ${d.value}`;
    el.appendChild(title);
    group.appendChild(el);
    angle = nextAngle;
  });

  group.appendChild(svg('circle', { r: innerRadius - 2, fill: 'var(--surface, #fff)' }));
  return root;
}

function arcPath(cx, cy, r, startAngle, endAngle, thickness) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStart = polar(cx, cy, r + thickness / 2, startAngle);
  const outerEnd = polar(cx, cy, r + thickness / 2, endAngle);
  const innerStart = polar(cx, cy, r - thickness / 2, endAngle);
  const innerEnd = polar(cx, cy, r - thickness / 2, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${r + thickness / 2} ${r + thickness / 2} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${r - thickness / 2} ${r - thickness / 2} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

function polar(cx, cy, r, angle) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export function barChart(data, { width = 320, height = 160, barColor = '#3b82f6' } = {}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const padding = 24;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const barWidth = chartWidth / data.length * 0.6;
  const gap = chartWidth / data.length;

  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img', 'aria-label': 'Bar chart' });
  root.appendChild(svg('line', { x1: padding, y1: height - padding, x2: width - padding, y2: height - padding, stroke: '#e2e8f0' }));

  data.forEach((d, i) => {
    const barHeight = max > 0 ? (d.value / max) * chartHeight : 0;
    const x = padding + i * gap + (gap - barWidth) / 2;
    const y = height - padding - barHeight;
    const rect = svg('rect', { x, y, width: barWidth, height: barHeight, rx: 3, fill: d.color || barColor });
    const title = svg('title', {});
    title.textContent = `${d.label}: ${d.value}`;
    rect.appendChild(title);
    root.appendChild(rect);
    const label = svg('text', { x: x + barWidth / 2, y: height - padding + 14, 'text-anchor': 'middle', class: 'chart-label' });
    label.textContent = d.label;
    root.appendChild(label);
  });

  return root;
}

/**
 * Two bars per item — budget (muted) beside actual (colored by status) —
 * for comparing allocated vs spent per budget group at a glance.
 */
export function groupedBarChart(items, { width = 320, height = 180, barGap = 5 } = {}) {
  const max = Math.max(1, ...items.flatMap((i) => [i.budget, i.actual]));
  const padding = 28;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const groupWidth = chartWidth / Math.max(1, items.length);
  const barWidth = Math.max(2, (groupWidth - barGap * 3) / 2);

  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img', 'aria-label': 'Budget vs actual chart' });
  root.appendChild(svg('line', { x1: padding, y1: height - padding, x2: width - padding, y2: height - padding, stroke: '#e2e8f0' }));

  items.forEach((item, i) => {
    const groupX = padding + i * groupWidth;
    const budgetHeight = (item.budget / max) * chartHeight;
    const actualHeight = (item.actual / max) * chartHeight;
    const budgetX = groupX + barGap;
    const actualX = budgetX + barWidth + barGap;

    const budgetRect = svg('rect', { x: budgetX, y: height - padding - budgetHeight, width: barWidth, height: budgetHeight, rx: 3, fill: '#cbd5e1' });
    const budgetTitle = svg('title', {});
    budgetTitle.textContent = `${item.label} budget: ${item.budget}`;
    budgetRect.appendChild(budgetTitle);
    root.appendChild(budgetRect);

    const actualRect = svg('rect', { x: actualX, y: height - padding - actualHeight, width: barWidth, height: actualHeight, rx: 3, fill: item.color || '#3b82f6' });
    const actualTitle = svg('title', {});
    actualTitle.textContent = `${item.label} actual: ${item.actual}`;
    actualRect.appendChild(actualTitle);
    root.appendChild(actualRect);

    const label = svg('text', { x: groupX + groupWidth / 2, y: height - padding + 14, 'text-anchor': 'middle', class: 'chart-label' });
    label.textContent = item.label;
    root.appendChild(label);
  });

  return root;
}

export const STATUS_COLORS = {
  ok: '#22c55e',
  approaching: '#eab308',
  high: '#f97316',
  exceeded: '#dc2626',
};

export function legend(data) {
  const wrap = document.createElement('div');
  wrap.className = 'chart-legend';
  data.forEach((d, i) => {
    const item = document.createElement('div');
    item.className = 'chart-legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'chart-legend-swatch';
    swatch.style.background = d.color || colorFor(d.id, i);
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(`${d.label} · ${d.value}`));
    wrap.appendChild(item);
  });
  return wrap;
}
