"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Box,
  Button,
  Group,
  Pagination,
  Paper,
  Progress,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconChartLine, IconEye, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";

import { AdminUserDetailsDrawer } from "@/features/admin/users/AdminUserDetailsDrawer";

import { getAdminRetentionCohorts, getAdminRetentionOverview, getAdminRetentionUsers } from "../admin.lib";
import { formatAdminDateTime, formatAdminSubscriptionStatus, stableAdminQueryKey } from "../admin-stage3";
import type { AdminRetentionCohortItem, AdminRetentionSegment, AdminRetentionUserItem } from "../admin.types";
import { ADMIN_ANALYTICS_STALE_TIME, ADMIN_QUERY_GC_TIME, AdminKpiSkeleton, AdminQueryError, AdminTableLoadingOverlay } from "../components/AdminQueryLoading";
import styles from "./AdminRetentionTab.module.css";

const segments: Array<{ value: AdminRetentionSegment; label: string }> = [
  { value: "ACTIVE_REPEAT", label: "Повторные с текущим доступом" },
  { value: "REPEAT_EVER", label: "Повторно платили за всё время" },
  { value: "ONE_PAYMENT_NO_PAID_ENTITLEMENT", label: "1 оплата · без доступа" },
  { value: "TRIAL_ONLY_NO_ENTITLEMENT", label: "Trial без оплаты · без доступа" },
  { value: "TRIAL_TO_PAID", label: "Trial → Paid" },
  { value: "ACTIVE_PAID", label: "Текущий платный доступ" },
];

function rateProgress(value: string) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function entitlementLabel(value: AdminRetentionUserItem["currentEntitlement"]) {
  return value === "PAID" ? "Платный" : value === "TRIAL" ? "Trial" : "Нет";
}

function RetentionKpi({ title, value, hint, primary = false }: { title: string; value: string | number; hint: string; primary?: boolean }) {
  return (
    <Paper className={`${styles.kpiCard} ${primary ? styles.primaryKpi : styles.secondaryKpi}`} p={primary ? "md" : "sm"} bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <ThemeIcon variant="light" color={primary ? "brandCyan" : "gray"} size={primary ? 38 : 32} radius="md">
          <IconChartLine size={primary ? 20 : 17} />
        </ThemeIcon>
        <Stack gap={2} className={styles.kpiContent}>
          <Text className={styles.kpiValue} fw={800}>{value}</Text>
          <Text fw={700} size={primary ? "sm" : "xs"}>{title}</Text>
          <Text c="dimmed" size="xs">{hint}</Text>
        </Stack>
      </Group>
    </Paper>
  );
}

function CohortRate({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={4} className={styles.rateCell}>
      <Text className={styles.noWrap} size="sm" fw={700}>{value}%</Text>
      <Progress value={rateProgress(value)} size="xs" aria-label={`${label}: ${value}%`} />
    </Stack>
  );
}

function CohortDiagnostics({ item }: { item: AdminRetentionCohortItem }) {
  return <Text className={styles.cohortDiagnostics} size="xs" c="dimmed">1 оплата без доступа: {item.onePaymentNoPaidEntitlement} · Trial без оплаты и доступа: {item.trialOnlyNoEntitlement}</Text>;
}

export default function AdminRetentionTab({ planOptions }: { planOptions: { value: string; label: string }[] }) {
  const [segment, setSegment] = useState<AdminRetentionSegment>("ACTIVE_REPEAT");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [months, setMonths] = useState<6 | 12 | 24>(12);
  const [userId, setUserId] = useState<string | null>(null);
  const overview = useQuery({ queryKey: ["admin-retention", "overview"], queryFn: ({ signal }) => getAdminRetentionOverview(signal), staleTime: ADMIN_ANALYTICS_STALE_TIME, gcTime: ADMIN_QUERY_GC_TIME });
  const users = useQuery({ queryKey: stableAdminQueryKey("retention-users", { segment, search, page, pageSize: 25 }), queryFn: ({ signal }) => getAdminRetentionUsers({ segment, search: search || undefined, page, pageSize: 25 }, signal), staleTime: ADMIN_ANALYTICS_STALE_TIME, gcTime: ADMIN_QUERY_GC_TIME });
  const cohorts = useQuery({ queryKey: ["admin-retention", "cohorts", months], queryFn: ({ signal }) => getAdminRetentionCohorts(months, signal), staleTime: ADMIN_ANALYTICS_STALE_TIME, gcTime: ADMIN_QUERY_GC_TIME });
  const data = overview.data;
  const isRefreshing = overview.isFetching || users.isFetching || cohorts.isFetching;
  const selectedSegment = segments.find((item) => item.value === segment)?.label || segment;
  const refreshAll = () => { void Promise.all([overview.refetch(), users.refetch(), cohorts.refetch()]); };

  return <Stack gap="lg" className={styles.root}>
    <Group justify="space-between" align="flex-start" gap="md" className={styles.header}>
      <Stack gap={4}>
        <Title order={2}>Удержание</Title>
        <Text c="dimmed" size="sm">История оплат за всё время + текущее состояние доступа</Text>
        {data ? <Text c="dimmed" size="xs">Срез: {formatAdminDateTime(data.asOf)} · {data.timezone}</Text> : null}
      </Stack>
      <Button variant="light" leftSection={<IconRefresh size={16} />} loading={isRefreshing && Boolean(data)} onClick={refreshAll}>Обновить</Button>
    </Group>

    {overview.isError || users.isError || cohorts.isError ? <AdminQueryError error={overview.error || users.error || cohorts.error} retry={refreshAll} stale={Boolean(data || users.data || cohorts.data)} /> : null}

    {!data && overview.isFetching ? <><AdminKpiSkeleton count={3} /><AdminKpiSkeleton count={4} /></> : null}
    {data ? <>
      {overview.isFetching ? <Text c="dimmed" size="xs" aria-live="polite">Обновление данных</Text> : null}
      <div className={styles.primaryKpis}>
        <RetentionKpi primary title="Текущий платный доступ" value={data.currentPaidUsers} hint="≥1 внешняя оплата и текущий платный доступ" />
        <RetentionKpi primary title="Trial → Paid" value={data.trialConvertedUsers} hint={`${data.trialConvertedUsers} / ${data.trialUsers} · ${data.trialConversionRate}%`} />
        <RetentionKpi primary title="Повторная покупка" value={`${data.repeatPurchaseRate}%`} hint={`${data.repeatPayersEver} / ${data.payingUsersEver} оплативших пользователей`} />
      </div>
      <div className={styles.secondaryKpis}>
        <RetentionKpi title="Повторные с текущим доступом" value={data.activeRepeatPayers} hint="≥2 внешних оплат и текущий платный доступ" />
        <RetentionKpi title="Повторно платили за всё время" value={data.repeatPayersEver} hint="≥2 успешных внешних оплат за всё время" />
        <RetentionKpi title="1 оплата · без доступа" value={data.onePaymentNoPaidEntitlement} hint="Ровно 1 внешняя оплата, текущего платного доступа нет" />
        <RetentionKpi title="Trial без оплаты · без доступа" value={data.trialOnlyNoEntitlement} hint="Trial использован, внешних оплат нет, текущего доступа нет" />
      </div>
    </> : null}

    <Paper p="md" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end" gap="md">
          <Stack gap={2}>
            <Title order={3}>Сегменты пользователей</Title>
            <Text c="dimmed" size="sm">{selectedSegment}{users.data ? ` · Результатов: ${users.data.total}` : ""}</Text>
          </Stack>
          {users.isFetching && users.data ? <Text c="dimmed" size="xs" aria-live="polite">Обновление данных</Text> : null}
        </Group>
        <Group align="flex-end" gap="sm" className={styles.filters}>
          <Select className={styles.segmentSelect} label="Сегмент" data={segments} value={segment} onChange={(value) => { if (value) { setSegment(value as AdminRetentionSegment); setPage(1); } }} />
          <TextInput className={styles.searchInput} label="Email / username" value={searchDraft} onChange={(event) => setSearchDraft(event.currentTarget.value)} />
          <Button onClick={() => { setSearch(searchDraft); setPage(1); }}>Применить</Button>
        </Group>
        <AdminTableLoadingOverlay isFetching={users.isFetching} hasData={Boolean(users.data)}>
          {users.data ? <>
            <Box visibleFrom="sm" className={styles.tableViewport}>
              <Table className={styles.retentionTable} highlightOnHover>
                <Table.Thead><Table.Tr><Table.Th>Пользователь</Table.Th><Table.Th>Текущий доступ</Table.Th><Table.Th>Тариф</Table.Th><Table.Th>Последняя оплата</Table.Th><Table.Th>Успешных оплат</Table.Th><Table.Th>Статус / окончание</Table.Th><Table.Th><span className={styles.srOnly}>Подробнее</span></Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>{users.data.items.map((item) => <Table.Tr key={item.user.id}>
                  <Table.Td className={styles.userCell}>{item.user.label}</Table.Td>
                  <Table.Td className={styles.noWrap}>{entitlementLabel(item.currentEntitlement)}</Table.Td>
                  <Table.Td>{item.currentPlan?.title || "—"}</Table.Td>
                  <Table.Td className={styles.noWrap}>{formatAdminDateTime(item.lastPaidAt)}</Table.Td>
                  <Table.Td className={styles.noWrap}>{item.successfulCashPayments}</Table.Td>
                  <Table.Td><Stack gap={2}><Text size="sm">{formatAdminSubscriptionStatus(item.subscriptionStatus)}</Text><Text size="xs" c="dimmed" className={styles.noWrap}>{formatAdminDateTime(item.subscriptionEndsAt)}</Text>{item.isBlocked ? <Badge color="red" w="fit-content">BLOCKED</Badge> : null}</Stack></Table.Td>
                  <Table.Td className={styles.actionCell}><Button size="xs" leftSection={<IconEye size={14} />} onClick={() => setUserId(item.user.id!)}>Открыть</Button></Table.Td>
                </Table.Tr>)}</Table.Tbody>
              </Table>
            </Box>
            <Stack hiddenFrom="sm" gap="sm">{users.data.items.map((item) => <Paper key={item.user.id} className={styles.mobileRow} p="sm" withBorder>
              <Group justify="space-between" align="flex-start" wrap="nowrap"><Text fw={700} className={styles.userCell}>{item.user.label}</Text><Badge variant="light" className={styles.noWrap}>{entitlementLabel(item.currentEntitlement)}</Badge></Group>
              <Text size="sm">{item.currentPlan?.title || "Тариф не выбран"}</Text>
              <Text size="xs" c="dimmed">Последняя оплата: {formatAdminDateTime(item.lastPaidAt)} · Успешных: {item.successfulCashPayments}</Text>
              <Text size="xs" c="dimmed">{formatAdminSubscriptionStatus(item.subscriptionStatus)} · до {formatAdminDateTime(item.subscriptionEndsAt)}</Text>
              <Button size="xs" variant="light" onClick={() => setUserId(item.user.id!)}>Открыть карточку</Button>
            </Paper>)}</Stack>
          </> : null}
        </AdminTableLoadingOverlay>
        {users.data && users.data.totalPages > 1 ? <Pagination value={users.data.page} total={users.data.totalPages} onChange={setPage} /> : null}
        <Text c="dimmed" size="xs">Регистрация, Trial, первая оплата, grace-период и другие детали доступны в административной карточке пользователя.</Text>
      </Stack>
    </Paper>

    <Paper p="md" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end"><Stack gap={2}><Title order={3}>Когорты регистрации</Title><Text c="dimmed" size="sm">Показатели рассчитаны к текущему моменту. Все месяцы сохранены; пустые когорты означают отсутствие пользователей в месяце регистрации.</Text></Stack><Select value={String(months)} data={["6", "12", "24"]} onChange={(value) => setMonths(Number(value) as 6 | 12 | 24)} /></Group>
        <AdminTableLoadingOverlay isFetching={cohorts.isFetching} hasData={Boolean(cohorts.data)}>
          {cohorts.data ? <>
            <Box visibleFrom="sm" className={styles.tableViewport}>
              <Table className={styles.cohortTable} highlightOnHover>
                <Table.Thead><Table.Tr><Table.Th>Месяц</Table.Th><Table.Th>Регистрации</Table.Th><Table.Th>Оплатили</Table.Th><Table.Th>Повторно</Table.Th><Table.Th>Текущий платный</Table.Th><Table.Th>Trial → Paid</Table.Th><Table.Th>Trial conversion</Table.Th><Table.Th>Repeat purchase</Table.Th><Table.Th>Диагностика</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>{cohorts.data.items.map((item) => <Table.Tr key={item.month} data-empty-cohort={item.registeredUsers === 0 ? "true" : undefined}>
                  <Table.Td className={styles.noWrap}>{item.month}</Table.Td><Table.Td className={styles.noWrap}>{item.registeredUsers}</Table.Td><Table.Td className={styles.noWrap}>{item.payingUsersEver}</Table.Td><Table.Td className={styles.noWrap}>{item.repeatPayersEver}</Table.Td><Table.Td className={styles.noWrap}>{item.activePaidUsers}</Table.Td>
                  <Table.Td className={styles.noWrap}>{item.trialConvertedUsers} / {item.trialUsers}</Table.Td><Table.Td><CohortRate label="Trial conversion" value={item.trialConversionRate} /></Table.Td><Table.Td><CohortRate label="Repeat purchase" value={item.repeatPurchaseRate} /></Table.Td><Table.Td><CohortDiagnostics item={item} /></Table.Td>
                </Table.Tr>)}</Table.Tbody>
              </Table>
            </Box>
            <Stack hiddenFrom="sm" gap="sm">{cohorts.data.items.map((item) => <Paper key={item.month} className={styles.mobileRow} p="sm" withBorder data-empty-cohort={item.registeredUsers === 0 ? "true" : undefined}>
              <Group justify="space-between"><Text fw={700} className={styles.noWrap}>{item.month}</Text><Text size="sm">Регистрации: {item.registeredUsers}</Text></Group>
              <Text size="sm">Оплатили: {item.payingUsersEver} · Повторно: {item.repeatPayersEver} · Текущий платный: {item.activePaidUsers}</Text>
              <Text size="sm">Trial → Paid: {item.trialConvertedUsers} / {item.trialUsers}</Text>
              <CohortRate label="Trial conversion" value={item.trialConversionRate} /><CohortRate label="Repeat purchase" value={item.repeatPurchaseRate} /><CohortDiagnostics item={item} />
            </Paper>)}</Stack>
          </> : null}
        </AdminTableLoadingOverlay>
      </Stack>
    </Paper>
    <AdminUserDetailsDrawer userId={userId} opened={Boolean(userId)} planOptions={planOptions} onClose={() => setUserId(null)} onDeleted={() => setUserId(null)} />
  </Stack>;
}
