'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AXIS_PROPS, ChartFrame, ChartTooltip } from '@/components/charts/primitives';
import { CHART, STATUS_COLORS } from '@/components/charts/palette';

/**
 * Branch trajectory: score as a line against findings as bars.
 *
 * The pairing is the point — management should see whether a branch is actually
 * improving over time, not just what its latest inspection happened to say.
 */
export function BranchHistoryChart({
  data,
}: {
  data: { label: string; score: number | null; findings: number; critical: number }[];
}) {
  return (
    <ChartFrame height={260} empty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis yAxisId="score" domain={[0, 100]} unit="%" {...AXIS_PROPS} />
          <YAxis yAxisId="count" orientation="right" allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART.grid, fillOpacity: 0.4 }} />
          <Bar
            yAxisId="count"
            dataKey="findings"
            name="Findings"
            fill={CHART.accentLight}
            radius={[2, 2, 0, 0]}
            barSize={22}
          />
          <Bar
            yAxisId="count"
            dataKey="critical"
            name="Critical"
            fill={STATUS_COLORS.crit}
            radius={[2, 2, 0, 0]}
            barSize={22}
          />
          <Line
            yAxisId="score"
            type="monotone"
            dataKey="score"
            name="Compliance score"
            stroke={CHART.accent}
            strokeWidth={2.5}
            dot={{ r: 3, fill: CHART.accent }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
