"use client";

import { Paper, SegmentedControl, Stack, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { extent, line, max, scaleLinear, scaleTime } from "d3";
import { useMemo, useState } from "react";

import type { AdminMoneyTimeseriesPoint } from "../admin.types";
import { formatAdminDate, formatAdminMoney } from "../admin-stage3";

export default function AdminMoneyTimeseriesChart({ items }: { items: AdminMoneyTimeseriesPoint[] }) {
  const [metric, setMetric] = useState<"revenue" | "payments">("revenue");
  const { ref, width } = useElementSize();
  const chartWidth = Math.max(280, width || 640);
  const height = 250;
  const margin = { top: 16, right: 16, bottom: 38, left: 48 };
  const data = useMemo(() => items.map((item) => ({ ...item, instant: new Date(`${item.date}T00:00:00+03:00`), value: metric === "revenue" ? parseFloat(item.grossRevenue) : item.successfulPayments })), [items, metric]);
  const domain = extent(data, (item) => item.instant) as [Date, Date];
  const x = scaleTime().domain(domain[0] ? domain : [new Date(), new Date()]).range([margin.left, chartWidth - margin.right]);
  const y = scaleLinear().domain([0, max(data, (item) => item.value) || 1]).nice().range([height - margin.bottom, margin.top]);
  const path = line<(typeof data)[number]>().x((item) => x(item.instant)).y((item) => y(item.value))(data) || "";
  const labelStep = Math.max(1, Math.ceil(data.length / (chartWidth < 420 ? 4 : 8)));

  return (
    <Paper ref={ref} p="md" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)" style={{ minWidth: 0, overflow: "hidden" }}>
      <Stack gap="sm">
        <SegmentedControl value={metric} onChange={(value) => setMetric(value as typeof metric)} data={[{ value: "revenue", label: "Выручка" }, { value: "payments", label: "Платежи" }]} fullWidth />
        {!data.length ? <Text c="dimmed">Нет данных за выбранный период.</Text> : (
          <svg viewBox={`0 0 ${chartWidth} ${height}`} width="100%" role="img" aria-label={metric === "revenue" ? "Динамика выручки" : "Динамика платежей"} style={{ display: "block" }}>
            <path d={path} fill="none" stroke="var(--mantine-color-brandCyan-5)" strokeWidth="3" />
            {data.map((item, index) => (
              <g key={item.date}>
                <circle cx={x(item.instant)} cy={y(item.value)} r="4" fill="var(--mantine-color-brandOrange-5)">
                  <title>{`${formatAdminDate(item.instant.toISOString())}: ${metric === "revenue" ? formatAdminMoney(item.grossRevenue) : item.successfulPayments}`}</title>
                </circle>
                {index % labelStep === 0 ? <text x={x(item.instant)} y={height - 12} textAnchor="middle" fontSize="10" fill="currentColor">{item.date.slice(5)}</text> : null}
              </g>
            ))}
          </svg>
        )}
      </Stack>
    </Paper>
  );
}
