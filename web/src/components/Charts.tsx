"use client";

// Charts built on Recharts (SVG, TypeScript-typed) themed to the CharmQuark palette.
import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CQ, STATUS_COLOR } from "@/lib/palette";

const AXIS = { fontSize: 11, fill: "#8E8E93" } as const;
const GRID = "#EDEDED";

export function BarChart({
  data,
  height = 200,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "#00000008" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #eee" }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color ?? CQ.blue} />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}

export function Donut({
  segments,
  size = 200,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={size}>
      <PieChart>
        <Pie
          data={segments}
          dataKey="value"
          nameKey="label"
          innerRadius="58%"
          outerRadius="82%"
          paddingAngle={2}
          stroke="none"
        >
          {segments.map((s, i) => (
            <Cell key={i} fill={s.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #eee" }} />
        <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function Burndown({
  ideal,
  actual,
  height = 200,
}: {
  ideal: number[];
  actual: number[];
  height?: number;
}) {
  const n = Math.max(ideal.length, actual.length);
  const data = Array.from({ length: n }, (_, i) => ({
    day: `D${i + 1}`,
    ideal: ideal[i] ?? null,
    actual: actual[i] ?? null,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #eee" }} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="ideal" name="Ideal" stroke={STATUS_COLOR.draft} strokeWidth={2} strokeDasharray="5 4" dot={false} />
        <Line type="monotone" dataKey="actual" name="Actual" stroke={CQ.blue} strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
