'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AXIS_PROPS, ChartFrame, ChartTooltip } from '@/components/charts/primitives';
import { CHART, SERIES, SEVERITY_COLORS, STATUS_COLORS, scoreColor } from '@/components/charts/palette';
import { SEVERITY_LABEL, STATUS_LABEL } from '@/lib/format';

const monthLabel = (m: string | number) => {
  const [y, mo] = String(m).split('-');
  if (!y || !mo) return String(m);
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
  });
};

export function TrendChart({
  data,
}: {
  data: { month: string; inspections: number; score: number | null }[];
}) {
  return (
    <ChartFrame empty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="insp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.18} />
              <stop offset="100%" stopColor={CHART.accent} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} allowDecimals={false} />
          <Tooltip content={<ChartTooltip labelFormatter={monthLabel} />} cursor={{ stroke: CHART.grid }} />
          <Area
            type="monotone"
            dataKey="inspections"
            name="Inspections"
            stroke={CHART.accent}
            strokeWidth={2}
            fill="url(#insp)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function ScoreTrendChart({
  data,
}: {
  data: { month: string; score: number | null }[];
}) {
  const points = data.filter((d) => d.score !== null);
  return (
    <ChartFrame empty={points.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...AXIS_PROPS} />
          <YAxis domain={[50, 100]} {...AXIS_PROPS} unit="%" />
          <Tooltip
            content={<ChartTooltip valueSuffix="%" labelFormatter={monthLabel} />}
            cursor={{ stroke: CHART.grid }}
          />
          <Line
            type="monotone"
            dataKey="score"
            name="Avg. compliance"
            stroke={CHART.accent}
            strokeWidth={2}
            dot={{ r: 2.5, fill: CHART.accent }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function OpenVsClosedChart({
  data,
}: {
  data: { month: string; opened: number; closed: number }[];
}) {
  return (
    <ChartFrame empty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} allowDecimals={false} />
          <Tooltip content={<ChartTooltip labelFormatter={monthLabel} />} cursor={{ fill: CHART.grid, fillOpacity: 0.4 }} />
          <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 11, color: CHART.label }} />
          <Bar dataKey="opened" name="Raised" fill={CHART.accent} radius={[2, 2, 0, 0]} />
          <Bar dataKey="closed" name="Closed" fill={STATUS_COLORS.ok} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SeverityChart({ data }: { data: { severity: string; count: number }[] }) {
  // Bars rather than a donut: with four ordered categories a reader compares
  // lengths far more reliably than arc angles, and severity has a natural order
  // that a pie throws away.
  const rows = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => ({
    severity: s,
    label: SEVERITY_LABEL[s as never] ?? s,
    count: data.find((d) => d.severity === s)?.count ?? 0,
  }));
  const total = rows.reduce((n, r) => n + r.count, 0);

  return (
    <ChartFrame height={200} empty={total === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={64} {...AXIS_PROPS} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART.grid, fillOpacity: 0.4 }} />
          <Bar dataKey="count" name="Open findings" radius={[0, 2, 2, 0]} barSize={18}>
            <LabelList dataKey="count" position="right" fontSize={11} fill={CHART.label} />
            {rows.map((d) => (
              <Cell key={d.severity} fill={SEVERITY_COLORS[d.severity]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function CategoryChart({
  data,
}: {
  data: { category: string; count: number }[];
}) {
  const top = data.slice(0, 8);
  return (
    <ChartFrame height={Math.max(200, top.length * 32 + 24)} empty={top.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
          <YAxis type="category" dataKey="category" width={112} {...AXIS_PROPS} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART.grid, fillOpacity: 0.4 }} />
          <Bar dataKey="count" name="Findings" radius={[0, 2, 2, 0]} barSize={14}>
            <LabelList dataKey="count" position="right" fontSize={11} fill={CHART.label} />
            {top.map((d, i) => (
              <Cell key={d.category} fill={SERIES[i % SERIES.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function CategoryScoreChart({
  data,
}: {
  data: { category: string; score: number | null }[];
}) {
  const points = data.filter((d) => d.score !== null) as { category: string; score: number }[];
  return (
    <ChartFrame height={Math.max(200, points.length * 32 + 24)} empty={points.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" {...AXIS_PROPS} />
          <YAxis type="category" dataKey="category" width={112} {...AXIS_PROPS} />
          <Tooltip content={<ChartTooltip valueSuffix="%" />} cursor={{ fill: CHART.grid, fillOpacity: 0.4 }} />
          <Bar dataKey="score" name="Avg. score" radius={[0, 2, 2, 0]} barSize={14}>
            <LabelList
              dataKey="score"
              position="right"
              fontSize={11}
              fill={CHART.label}
              formatter={(v: number) => `${v}%`}
            />
            {points.map((d) => (
              <Cell key={d.category} fill={scoreColor(d.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function BranchScoreChart({
  data,
}: {
  data: { name: string; score: number | null }[];
}) {
  const points = data.filter((d) => d.score !== null) as { name: string; score: number }[];
  return (
    <ChartFrame height={Math.max(180, points.length * 30 + 24)} empty={points.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} layout="vertical" margin={{ top: 4, right: 28, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} unit="%" {...AXIS_PROPS} />
          <YAxis type="category" dataKey="name" width={132} {...AXIS_PROPS} />
          <Tooltip content={<ChartTooltip valueSuffix="%" />} cursor={{ fill: CHART.grid, fillOpacity: 0.4 }} />
          <Bar dataKey="score" name="Latest score" radius={[0, 2, 2, 0]} barSize={13}>
            <LabelList
              dataKey="score"
              position="right"
              fontSize={11}
              fill={CHART.label}
              formatter={(v: number) => `${v}%`}
            />
            {points.map((d) => (
              <Cell key={d.name} fill={scoreColor(d.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function StatusChart({ data }: { data: { status: string; count: number }[] }) {
  const order = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'UNDER_VERIFICATION', 'CLOSED'];
  const rows = order
    .map((s) => data.find((d) => d.status === s) ?? { status: s, count: 0 })
    .filter((d) => d.count > 0)
    .map((d) => ({ ...d, label: STATUS_LABEL[d.status as never] ?? d.status }));

  const colors: Record<string, string> = {
    OPEN: STATUS_COLORS.bad,
    ASSIGNED: STATUS_COLORS.warn,
    IN_PROGRESS: STATUS_COLORS.info,
    UNDER_VERIFICATION: CHART.accent,
    CLOSED: STATUS_COLORS.ok,
  };

  return (
    <ChartFrame height={200} empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval={0} tick={{ fontSize: 10 }} />
          <YAxis {...AXIS_PROPS} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART.grid, fillOpacity: 0.4 }} />
          <Bar dataKey="count" name="Findings" radius={[2, 2, 0, 0]} barSize={30}>
            {rows.map((d) => (
              <Cell key={d.status} fill={colors[d.status] ?? CHART.accent} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
