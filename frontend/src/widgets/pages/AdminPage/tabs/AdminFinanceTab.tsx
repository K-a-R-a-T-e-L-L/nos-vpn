"use client";

import {
  Badge,
  Button,
  Drawer,
  Group,
  MultiSelect,
  Pagination,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconFilter, IconRefresh } from "@tabler/icons-react";
import dynamic from "next/dynamic";

import { useAdminFinance } from "@/features/admin/finance/useAdminFinance";

import {
  ADMIN_MERCHANT_OPTIONS,
  ADMIN_PAYMENT_STATUS_OPTIONS,
  ADMIN_PAYMENT_TYPE_OPTIONS,
  ADMIN_PERIOD_OPTIONS,
  ADMIN_SORT_DIRECTION_OPTIONS,
  formatAdminActivationStatus,
  formatAdminDateTime,
  formatAdminMerchant,
  formatAdminMoney,
  formatAdminPaymentStatus,
  formatAdminPaymentType,
  formatAdminProvider,
} from "../admin-stage3";
import type { AdminAnalyticsFilters, AdminPaymentQuery } from "../admin.types";
import {
  AdminChartSkeleton,
  AdminKpiSkeleton,
  AdminQueryError,
  AdminQuerySection,
  AdminTableLoadingOverlay,
} from "../components/AdminQueryLoading";

const AdminMoneyTimeseriesChart = dynamic(
  () => import("../components/AdminMoneyTimeseriesChart"),
  { ssr: false, loading: () => <AdminChartSkeleton /> },
);

function Kpi({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Paper
      p="md"
      bg="dark.8"
      bd="1px solid var(--mantine-color-dark-6)"
      style={{ minWidth: 0 }}
    >
      <Text c="dimmed" size="sm">
        {title}
      </Text>
      <Text fz="xl" fw={800} style={{ overflowWrap: "anywhere" }}>
        {value}
      </Text>
      {hint ? (
        <Text c="dimmed" size="xs">
          {hint}
        </Text>
      ) : null}
    </Paper>
  );
}

export default function AdminFinanceTab({
  planOptions,
}: {
  planOptions: { value: string; label: string }[];
}) {
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const finance = useAdminFinance();
  const {
    drawerOpened,
    setDrawerOpened,
    draft,
    setDraft,
    paymentState,
    setPaymentState,
    overview,
    timeseries,
    breakdowns,
    payments,
    filtersFetching,
    apply,
    reset,
  } = finance;
  const filtersUi = (
    <Stack gap="sm">
      <Select
        label="Период"
        data={ADMIN_PERIOD_OPTIONS}
        value={draft.preset}
        onChange={(value) =>
          setDraft((current) => ({
            ...current,
            preset: value as AdminAnalyticsFilters["preset"],
          }))
        }
      />
      {draft.preset === "CUSTOM" ? (
        <Group grow>
          <TextInput
            label="От"
            type="date"
            value={draft.dateFrom || ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                dateFrom: event.currentTarget.value,
              }))
            }
          />
          <TextInput
            label="До"
            type="date"
            value={draft.dateTo || ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                dateTo: event.currentTarget.value,
              }))
            }
          />
        </Group>
      ) : null}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Select
          label="Провайдер"
          data={[
            { value: "ALL", label: "Все" },
            { value: "YOOKASSA", label: "YooKassa" },
            { value: "PLATEGA", label: "Platega" },
          ]}
          value={draft.provider}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              provider: value as AdminAnalyticsFilters["provider"],
            }))
          }
        />
        <Select
          label="Канал"
          data={ADMIN_MERCHANT_OPTIONS}
          value={draft.merchant}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              merchant: value as AdminAnalyticsFilters["merchant"],
            }))
          }
        />
        <Select
          label="Тариф"
          data={[{ value: "ALL", label: "Все" }, ...planOptions]}
          searchable
          clearable
          value={draft.planId || "ALL"}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              planId: value && value !== "ALL" ? value : undefined,
            }))
          }
        />
        <Select
          label="Реферальный"
          data={[
            { value: "ALL", label: "Все" },
            { value: "true", label: "Да" },
            { value: "false", label: "Нет" },
          ]}
          value={draft.referred === undefined ? "ALL" : String(draft.referred)}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              referred: value === "ALL" ? undefined : value === "true",
            }))
          }
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          label="Промокод"
          value={draft.promoCode || ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              promoCode: event.currentTarget.value,
            }))
          }
        />
        <TextInput
          label="Пользователь"
          value={draft.userSearch || ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              userSearch: event.currentTarget.value,
            }))
          }
        />
      </SimpleGrid>
      <Group>
        <Button onClick={apply} loading={filtersFetching}>
          Применить
        </Button>
        <Button variant="light" onClick={reset} disabled={filtersFetching}>
          Сбросить
        </Button>
      </Group>
    </Stack>
  );

  return (
    <Stack gap="lg" style={{ minWidth: 0 }}>
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Финансы</Title>
          <Text c="dimmed" size="sm">
            Время указано по Москве
          </Text>
        </Stack>
        {mobile ? (
          <Button
            leftSection={<IconFilter size={16} />}
            onClick={() => setDrawerOpened(true)}
          >
            Фильтры
          </Button>
        ) : null}
      </Group>
      {mobile ? (
        <Drawer
          opened={drawerOpened}
          onClose={() => setDrawerOpened(false)}
          title="Фильтры"
          size="100%"
          styles={{ content: { maxWidth: "100vw" } }}
        >
          {filtersUi}
        </Drawer>
      ) : (
        <Paper p="md" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          {filtersUi}
        </Paper>
      )}
      {overview.isError ? (
        <AdminQueryError
          error={overview.error}
          retry={() => overview.refetch()}
          stale={Boolean(overview.data)}
        />
      ) : null}
      {!overview.data && overview.isFetching ? (
        <AdminKpiSkeleton count={8} />
      ) : overview.data ? (
        <AdminQuerySection isFetching={overview.isFetching} hasData>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <>
              <Kpi
                title="Валовая выручка"
                value={formatAdminMoney(overview.data.grossRevenue)}
              />
              <Kpi
                title="Успешные платежи"
                value={overview.data.successfulPayments}
              />
              <Kpi
                title="Платящие пользователи"
                value={overview.data.uniquePayingUsers}
              />
              <Kpi
                title="Средний чек"
                value={formatAdminMoney(overview.data.averageCheck)}
              />
              <Kpi
                title="Первые покупки"
                value={overview.data.firstPurchases}
              />
              <Kpi
                title="Ручные продления"
                value={overview.data.manualRenewals}
              />
              <Kpi
                title="Автосписания"
                value={overview.data.recurrentPayments}
              />
              <Kpi
                title="Неуспешные"
                value={`Ошибки: ${overview.data.failedPayments}`}
                hint={`Отмены: ${overview.data.canceledPayments}${overview.data.expiredPayments ? ` · Истекли: ${overview.data.expiredPayments}` : ""}`}
              />
            </>
          </SimpleGrid>
        </AdminQuerySection>
      ) : null}
      {timeseries.isError ? (
        <AdminQueryError
          error={timeseries.error}
          retry={() => timeseries.refetch()}
          stale={Boolean(timeseries.data)}
        />
      ) : null}
      {!timeseries.data && timeseries.isFetching ? (
        <AdminChartSkeleton />
      ) : timeseries.data ? (
        <AdminQuerySection isFetching={timeseries.isFetching} hasData>
          <AdminMoneyTimeseriesChart items={timeseries.data.items} />
        </AdminQuerySection>
      ) : null}
      {breakdowns.isError ? (
        <AdminQueryError
          error={breakdowns.error}
          retry={() => breakdowns.refetch()}
          stale={Boolean(breakdowns.data)}
        />
      ) : null}
      {!breakdowns.data && breakdowns.isFetching ? (
        <AdminKpiSkeleton count={6} />
      ) : breakdowns.data ? (
        <AdminQuerySection isFetching={breakdowns.isFetching} hasData>
          <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }}>
            {[
              ["Каналы", breakdowns.data.byMerchant, formatAdminMerchant],
              ["Провайдеры", breakdowns.data.byProvider, formatAdminProvider],
              ["Типы платежей", breakdowns.data.byPaymentType, formatAdminPaymentType],
              ["Тарифы", breakdowns.data.byPlan, (value: string) => value],
              ["Статусы", breakdowns.data.byStatus, formatAdminPaymentStatus],
            ].map(([title, items, formatLabel]) => (
              <Paper
                key={String(title)}
                p="md"
                bg="dark.8"
                bd="1px solid var(--mantine-color-dark-6)"
              >
                <Title order={4} mb="sm">
                  {String(title)}
                </Title>
                <Stack gap="xs">
                  {(items as typeof breakdowns.data.byPlan)
                    .filter((item) => item.successfulPayments > 0 || item.grossRevenue !== "0.00")
                    .map((item) => (
                    <Group key={item.key} justify="space-between" wrap="nowrap">
                      <Text size="sm">{(formatLabel as (value: string) => string)(item.label)}</Text>
                      <Text size="sm" fw={700}>
                        {item.successfulPayments} ·{" "}
                        {formatAdminMoney(item.grossRevenue)}
                      </Text>
                    </Group>
                    ))}
                </Stack>
              </Paper>
            ))}
            <Paper
              p="md"
              bg="dark.8"
              bd="1px solid var(--mantine-color-dark-6)"
            >
              <Title order={4} mb="sm">
                Промокоды
              </Title>
              {breakdowns.data.promoUsage.map((item) => (
                <Group key={item.key} justify="space-between">
                  <Text>{item.label}</Text>
                  <Badge>{item.usageCount}</Badge>
                </Group>
              ))}
            </Paper>
          </SimpleGrid>
        </AdminQuerySection>
      ) : null}
      <Paper
        p="md"
        bg="dark.8"
        bd="1px solid var(--mantine-color-dark-6)"
        style={{ minWidth: 0 }}
      >
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>Платежи</Title>
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              loading={payments.isFetching}
              onClick={() => payments.refetch()}
            >
              Обновить
            </Button>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <MultiSelect
              disabled={payments.isFetching}
              label="Статусы"
              data={ADMIN_PAYMENT_STATUS_OPTIONS}
              value={paymentState.statuses || []}
              onChange={(statuses) =>
                setPaymentState((current) => ({
                  ...current,
                  statuses,
                  page: 1,
                }))
              }
            />
            <Select
              disabled={payments.isFetching}
              label="Тип"
              data={ADMIN_PAYMENT_TYPE_OPTIONS}
              value={paymentState.paymentType}
              onChange={(paymentType) =>
                setPaymentState((current) => ({
                  ...current,
                  paymentType: paymentType as AdminPaymentQuery["paymentType"],
                  page: 1,
                }))
              }
            />
            <Select
              disabled={payments.isFetching}
              label="Сортировка"
              data={[
                { value: "paidAt", label: "Дата оплаты" },
                { value: "createdAt", label: "Дата создания" },
                { value: "amount", label: "Сумма" },
                { value: "status", label: "Статус" },
              ]}
              value={paymentState.sortBy}
              onChange={(sortBy) =>
                setPaymentState((current) => ({
                  ...current,
                  sortBy: sortBy as AdminPaymentQuery["sortBy"],
                  page: 1,
                }))
              }
            />
            <Select
              disabled={payments.isFetching}
              label="Направление"
              data={ADMIN_SORT_DIRECTION_OPTIONS}
              value={paymentState.sortDir}
              onChange={(sortDir) =>
                setPaymentState((current) => ({
                  ...current,
                  sortDir: sortDir as AdminPaymentQuery["sortDir"],
                  page: 1,
                }))
              }
            />
          </SimpleGrid>
          {payments.isError ? (
            <AdminQueryError
              error={payments.error}
              retry={() => payments.refetch()}
              stale={Boolean(payments.data)}
            />
          ) : null}
          <AdminTableLoadingOverlay
            isFetching={payments.isFetching}
            hasData={Boolean(payments.data)}
          >
            {payments.data ? (
              <ScrollArea type="auto" offsetScrollbars>
                <Table miw={1180} striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      {[
                        "Дата",
                        "Пользователь",
                        "Канал",
                        "Провайдер",
                        "Тип",
                        "Тариф",
                        "Промокод",
                        "Сумма",
                        "Статус",
                        "Активация",
                      ].map((title) => (
                        <Table.Th key={title}>{title}</Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {payments.data.items.map((item) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>
                          {formatAdminDateTime(item.paidAt || item.createdAt)}
                        </Table.Td>
                        <Table.Td>{item.user.label}</Table.Td>
                        <Table.Td>
                          {formatAdminMerchant(item.merchant)}
                        </Table.Td>
                        <Table.Td>
                          {formatAdminProvider(item.provider)}
                        </Table.Td>
                        <Table.Td>
                          {formatAdminPaymentType(item.paymentType)}
                        </Table.Td>
                        <Table.Td>
                          {item.plan.title || item.plan.code || "—"}
                        </Table.Td>
                        <Table.Td>{item.promoCode || "—"}</Table.Td>
                        <Table.Td>
                          {formatAdminMoney(item.amount, item.currency)}
                        </Table.Td>
                        <Table.Td>
                          {formatAdminPaymentStatus(item.status)}
                        </Table.Td>
                        <Table.Td>
                          {formatAdminActivationStatus(item.activationStatus)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            ) : null}
          </AdminTableLoadingOverlay>
          {!payments.isFetching &&
          payments.data &&
          !payments.data.items.length ? (
            <Text c="dimmed">Платежи не найдены.</Text>
          ) : null}
          <Group justify="space-between">
            <Select
              disabled={payments.isFetching}
              w={120}
              value={String(paymentState.pageSize)}
              data={["25", "50", "100"]}
              onChange={(value) =>
                setPaymentState((current) => ({
                  ...current,
                  pageSize: Number(value) as 25 | 50 | 100,
                  page: 1,
                }))
              }
            />
            {payments.data && payments.data.totalPages > 1 ? (
              <Pagination
                disabled={payments.isFetching}
                value={payments.data.page}
                total={payments.data.totalPages}
                onChange={(page) =>
                  setPaymentState((current) => ({ ...current, page }))
                }
              />
            ) : null}
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
