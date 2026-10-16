"use client";

import {
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
import { IconEye, IconFilter, IconRefresh } from "@tabler/icons-react";

import { useAdminReferrals } from "@/features/admin/referrals/useAdminReferrals";

import {
  ADMIN_LEDGER_STATUS_OPTIONS,
  ADMIN_MERCHANT_OPTIONS,
  ADMIN_PERIOD_OPTIONS,
  ADMIN_SORT_DIRECTION_OPTIONS,
  formatAdminDateTime,
  formatAdminMoney,
} from "../admin-stage3";
import type { AdminReferralQuery, AdminReferrerQuery } from "../admin.types";
import AdminReferrerDetailsDrawer from "../components/AdminReferrerDetailsDrawer";
import {
  AdminKpiSkeleton,
  AdminQueryError,
  AdminQuerySection,
  AdminTableLoadingOverlay,
} from "../components/AdminQueryLoading";

export default function AdminReferralTab({
  planOptions,
}: {
  planOptions: { value: string; label: string }[];
}) {
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const {
    opened,
    setOpened,
    draft,
    setDraft,
    referrerQuery,
    setReferrerQuery,
    selectedReferrerId,
    setSelectedReferrerId,
    overview,
    referrers,
    applying,
    apply,
    reset,
  } = useAdminReferrals();
  const filters = (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Select
          label="Период"
          data={ADMIN_PERIOD_OPTIONS}
          value={draft.preset}
          onChange={(preset) =>
            setDraft((current) => ({
              ...current,
              preset: preset as AdminReferralQuery["preset"],
            }))
          }
        />
        <Select
          label="Канал (общие KPI)"
          data={ADMIN_MERCHANT_OPTIONS}
          value={draft.merchant}
          onChange={(merchant) =>
            setDraft((current) => ({
              ...current,
              merchant: merchant as AdminReferralQuery["merchant"],
            }))
          }
        />
        <Select
          label="Тариф (общие KPI)"
          data={[{ value: "ALL", label: "Все" }, ...planOptions]}
          searchable
          value={draft.planId || "ALL"}
          onChange={(planId) =>
            setDraft((current) => ({
              ...current,
              planId: planId === "ALL" ? undefined : planId || undefined,
            }))
          }
        />
        <MultiSelect
          label="Статус бонуса (общие KPI)"
          data={ADMIN_LEDGER_STATUS_OPTIONS}
          value={draft.ledgerStatus || []}
          onChange={(ledgerStatus) =>
            setDraft((current) => ({ ...current, ledgerStatus }))
          }
        />
      </SimpleGrid>
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
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <TextInput
          label="Реферер"
          value={draft.referrerSearch || ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              referrerSearch: event.currentTarget.value,
            }))
          }
        />
        <TextInput
          label="Приглашённый (общие KPI)"
          value={draft.invitedSearch || ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              invitedSearch: event.currentTarget.value,
            }))
          }
        />
        <TextInput
          label="Промокод (общие KPI)"
          value={draft.promoCode || ""}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              promoCode: event.currentTarget.value,
            }))
          }
        />
      </SimpleGrid>
      <Group>
        <Button loading={applying} onClick={apply}>
          Применить
        </Button>
        <Button disabled={applying} variant="light" onClick={reset}>
          Сбросить
        </Button>
      </Group>
    </Stack>
  );

  return (
    <Stack gap="lg" style={{ minWidth: 0 }}>
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Рефералы</Title>
          <Text c="dimmed" size="sm">
            Время указано по Москве
          </Text>
        </Stack>
        {mobile ? (
          <Button
            leftSection={<IconFilter size={16} />}
            onClick={() => setOpened(true)}
          >
            Фильтры
          </Button>
        ) : null}
      </Group>
      {mobile ? (
        <Drawer
          opened={opened}
          onClose={() => setOpened(false)}
          title="Фильтры"
          size="100%"
          styles={{ content: { maxWidth: "100vw" } }}
        >
          {filters}
        </Drawer>
      ) : (
        <Paper p="md" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          {filters}
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
        <AdminKpiSkeleton count={7} />
      ) : overview.data ? (
        <AdminQuerySection isFetching={overview.isFetching} hasData>
          <Text c="dimmed" size="sm" mb="xs">
            Активность за выбранный период
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <Paper p="md" bg="dark.8">
              <Text c="dimmed">Новые регистрации</Text>
              <Text fz="xl" fw={800}>
                {overview.data.referredRegistrations}
              </Text>
            </Paper>
            <Paper p="md" bg="dark.8">
              <Text c="dimmed">Платящие приглашённые</Text>
              <Text fz="xl" fw={800}>
                {overview.data.referredPayingUsers}
              </Text>
            </Paper>
            <Paper p="md" bg="dark.8">
              <Text c="dimmed">Успешные платежи</Text>
              <Text fz="xl" fw={800}>
                {overview.data.successfulPayments}
              </Text>
            </Paper>
            <Paper p="md" bg="dark.8">
              <Text c="dimmed">Выручка приглашённых</Text>
              <Text fz="xl" fw={800}>
                {formatAdminMoney(overview.data.referredGrossRevenue)}
              </Text>
            </Paper>
            <Paper p="md" bg="dark.8">
              <Text c="dimmed">Начислено бонусов</Text>
              <Text fz="xl" fw={800}>
                {formatAdminMoney(overview.data.awardedBonusTotal)}
              </Text>
            </Paper>
            <Paper p="md" bg="dark.8">
              <Text c="dimmed">Ожидают</Text>
              <Text fz="xl" fw={800}>
                {overview.data.pendingBonusCount}
              </Text>
            </Paper>
            <Paper p="md" bg="dark.8">
              <Text c="dimmed">Отклонены</Text>
              <Text fz="xl" fw={800}>
                {overview.data.rejectedBonusCount}
              </Text>
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
            <div>
              <Title order={3}>Рефереры</Title>
              <Text c="dimmed" size="sm">Конверсия считается за всё время: платящие приглашённые / все приглашённые. «Успешных платежей» — количество транзакций, поэтому оно может быть больше числа платящих.</Text>
              <Text c="dimmed" size="sm">Баланс кошелька — текущий; «Начислено за период» зависит от выбранного периода.</Text>
            </div>
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              loading={referrers.isFetching}
              onClick={() => referrers.refetch()}
            >
              Обновить
            </Button>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <Select
              label="Приглашённые"
              data={[
                { value: "ALL", label: "Все" },
                { value: "true", label: "Есть" },
                { value: "false", label: "Нет" },
              ]}
              value={
                referrerQuery.onlyWithInvited === undefined
                  ? "ALL"
                  : String(referrerQuery.onlyWithInvited)
              }
              disabled={referrers.isFetching}
              onChange={(value) =>
                setReferrerQuery((current) => ({
                  ...current,
                  onlyWithInvited:
                    value === "ALL" ? undefined : value === "true",
                  page: 1,
                }))
              }
            />
            <Select
              label="Платящие"
              data={[
                { value: "ALL", label: "Все" },
                { value: "true", label: "Есть" },
                { value: "false", label: "Нет" },
              ]}
              value={
                referrerQuery.onlyWithPayingInvited === undefined
                  ? "ALL"
                  : String(referrerQuery.onlyWithPayingInvited)
              }
              disabled={referrers.isFetching}
              onChange={(value) =>
                setReferrerQuery((current) => ({
                  ...current,
                  onlyWithPayingInvited:
                    value === "ALL" ? undefined : value === "true",
                  page: 1,
                }))
              }
            />
            <Select
              label="Сортировка"
              data={[
                { value: "invitedUsers", label: "Приглашено" },
                { value: "payingInvitedUsers", label: "Оплатили" },
                { value: "referredGrossRevenue", label: "Выручка" },
                { value: "lifetimeAwardedBonus", label: "Заработано всего" },
                { value: "currentWalletBalance", label: "Баланс" },
                { value: "lastReferralAt", label: "Последнее приглашение" },
              ]}
              value={referrerQuery.sortBy}
              disabled={referrers.isFetching}
              onChange={(sortBy) =>
                setReferrerQuery((current) => ({
                  ...current,
                  sortBy: sortBy as AdminReferrerQuery["sortBy"],
                  page: 1,
                }))
              }
            />
            <Select
              label="Порядок"
              data={ADMIN_SORT_DIRECTION_OPTIONS}
              value={referrerQuery.sortDir}
              disabled={referrers.isFetching}
              onChange={(sortDir) =>
                setReferrerQuery((current) => ({
                  ...current,
                  sortDir: sortDir as AdminReferrerQuery["sortDir"],
                  page: 1,
                }))
              }
            />
          </SimpleGrid>
          {referrers.isError ? (
            <AdminQueryError
              error={referrers.error}
              retry={() => referrers.refetch()}
              stale={Boolean(referrers.data)}
            />
          ) : null}
          <AdminTableLoadingOverlay
            isFetching={referrers.isFetching}
            hasData={Boolean(referrers.data)}
          >
            {referrers.data ? (
              <ScrollArea type="auto" offsetScrollbars>
                <Table miw={1640} striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      {[
                        "Пользователь",
                        "Приглашено всего",
                        "Платящих всего",
                        "Конверсия за всё время",
                        "Успешных платежей всего",
                        "Выручка всего",
                        "Начислено за период",
                        "В кошельке сейчас",
                        "Последнее приглашение",
                        "Подробнее",
                      ].map((title) => (
                        <Table.Th key={title}>{title}</Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {referrers.data.items.map((item) => {
                      return (
                        <Table.Tr key={item.referrer.id}>
                          <Table.Td>
                            <Text fw={700}>{item.referrer.label}</Text>
                            <Text c="dimmed" size="xs">
                              {item.referrer.email || item.referrer.id}
                            </Text>
                          </Table.Td>
                          <Table.Td ta="right">{item.invitedUsers}</Table.Td>
                          <Table.Td ta="right">{item.payingInvitedUsers}</Table.Td>
                          <Table.Td ta="right">{item.referralConversionPercent}%</Table.Td>
                          <Table.Td ta="right">{item.referredSuccessfulPayments}</Table.Td>
                          <Table.Td ta="right">{formatAdminMoney(item.referredGrossRevenue)}</Table.Td>
                          <Table.Td ta="right">{formatAdminMoney(item.periodMetrics.awardedBonus)}</Table.Td>
                          <Table.Td ta="right">{formatAdminMoney(item.currentWalletBalance)}</Table.Td>
                          <Table.Td>
                            {formatAdminDateTime(item.lastReferralAt)}
                          </Table.Td>
                          <Table.Td>
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconEye size={15} />}
                              onClick={() =>
                                setSelectedReferrerId(item.referrer.id || null)
                              }
                            >
                              Открыть
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            ) : null}
          </AdminTableLoadingOverlay>
          {!referrers.isFetching &&
          referrers.data &&
          !referrers.data.items.length ? (
            <Text c="dimmed">Рефереры не найдены.</Text>
          ) : null}
          <Group justify="space-between">
            <Select
              disabled={referrers.isFetching}
              w={120}
              value={String(referrerQuery.pageSize)}
              data={["25", "50", "100"]}
              onChange={(value) =>
                setReferrerQuery((current) => ({
                  ...current,
                  pageSize: Number(value) as 25 | 50 | 100,
                  page: 1,
                }))
              }
            />
            {referrers.data && referrers.data.totalPages > 1 ? (
              <Pagination
                disabled={referrers.isFetching}
                value={referrers.data.page}
                total={referrers.data.totalPages}
                onChange={(page) =>
                  setReferrerQuery((current) => ({ ...current, page }))
                }
              />
            ) : null}
          </Group>
        </Stack>
      </Paper>
      {selectedReferrerId ? (
        <AdminReferrerDetailsDrawer
          key={selectedReferrerId}
          referrerId={selectedReferrerId}
          opened
          onClose={() => setSelectedReferrerId(null)}
          period={{
            preset: referrerQuery.preset,
            dateFrom: referrerQuery.dateFrom,
            dateTo: referrerQuery.dateTo,
          }}
        />
      ) : null}
    </Stack>
  );
}
