"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Button,
  Drawer,
  Group,
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
import { useState } from "react";

import { getAdminReferrerInvites } from "../admin.lib";
import {
  ADMIN_SORT_DIRECTION_OPTIONS,
  formatAdminDateTime,
  formatAdminMerchant,
  formatAdminMoney,
  formatAdminLedgerStatus,
  stableAdminQueryKey,
} from "../admin-stage3";
import type {
  AdminReferrerInvitesQuery,
  AdminReferrerQuery,
} from "../admin.types";
import {
  ADMIN_ANALYTICS_STALE_TIME,
  ADMIN_QUERY_GC_TIME,
  AdminQueryError,
  AdminQuerySection,
  AdminTableLoadingOverlay,
  AdminTableSkeleton,
} from "./AdminQueryLoading";

type Props = {
  referrerId: string;
  opened: boolean;
  onClose: () => void;
  period: Pick<AdminReferrerQuery, "preset" | "dateFrom" | "dateTo">;
};

export default function AdminReferrerDetailsDrawer({
  referrerId,
  opened,
  onClose,
  period,
}: Props) {
  const [draftSearch, setDraftSearch] = useState("");
  const [query, setQuery] = useState<AdminReferrerInvitesQuery>({
    ...period,
    paidState: "ALL",
    page: 1,
    pageSize: 25,
    sortBy: "registeredAt",
    sortDir: "DESC",
  });
  const details = useQuery({
    queryKey: stableAdminQueryKey(`referrer-${referrerId}-invites`, query),
    queryFn: ({ signal }) => getAdminReferrerInvites(referrerId, query, signal),
    enabled: opened,
    placeholderData: keepPreviousData,
    staleTime: ADMIN_ANALYTICS_STALE_TIME,
    gcTime: ADMIN_QUERY_GC_TIME,
  });
  const data = details.data;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Приглашённые реферера"
      position="right"
      size="min(920px, 100vw)"
      styles={{ content: { maxWidth: "100vw" } }}
    >
      <Stack gap="lg">
        {details.isError ? (
          <AdminQueryError
            error={details.error}
            retry={() => details.refetch()}
            stale={Boolean(data)}
          />
        ) : null}
        {!data && details.isFetching ? <AdminTableSkeleton rows={7} /> : null}
        {data ? (
          <AdminQuerySection isFetching={details.isFetching} hasData>
            <Stack gap="lg">
              <Paper p="md" bg="dark.8">
                <Title order={4}>{data.referrer.label}</Title>
                <Text size="sm">
                  {data.referrer.email || "Email не указан"}
                </Text>
                <Text c="dimmed" size="xs">
                  {data.referrer.id}
                </Text>
                <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md">
                  <div>
                    <Text c="dimmed" size="sm">
                      Заработано всего
                    </Text>
                    <Text fw={800}>
                      {formatAdminMoney(data.lifetimeAwardedBonus)}
                    </Text>
                  </div>
                  <div>
                    <Text c="dimmed" size="sm">
                      Доступно в кошельке
                    </Text>
                    <Text fw={800}>
                      {formatAdminMoney(data.currentWalletBalance)}
                    </Text>
                  </div>
                </SimpleGrid>
                <Text c="dimmed" size="xs" mt="sm">
                  Разница не трактуется как вывод или расход: отдельной
                  payout-модели нет.
                </Text>
              </Paper>

              <Paper p="md" bg="dark.8">
                <Stack gap="sm">
                  <div>
                    <Title order={4}>Заработок</Title>
                    <Text c="dimmed" size="xs">
                      Фактически начисленные реферальные вознаграждения · время
                      по Москве
                    </Text>
                  </div>
                  <SimpleGrid cols={{ base: 1, sm: 3 }}>
                    <div>
                      <Text c="dimmed" size="sm">
                        Текущий месяц
                      </Text>
                      <Text fw={800}>
                        {formatAdminMoney(data.earnings.currentMonth)}
                      </Text>
                    </div>
                    <div>
                      <Text c="dimmed" size="sm">
                        Прошлый месяц
                      </Text>
                      <Text fw={800}>
                        {formatAdminMoney(data.earnings.previousMonth)}
                      </Text>
                    </div>
                    <div>
                      <Text c="dimmed" size="sm">
                        За всё время
                      </Text>
                      <Text fw={800}>
                        {formatAdminMoney(data.earnings.allTime)}
                      </Text>
                    </div>
                  </SimpleGrid>
                </Stack>
              </Paper>

              <Paper p="md" bg="dark.8">
                <Stack gap="sm">
                  <Title order={4}>Приглашённые за выбранный период</Title>
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                    <TextInput
                      label="Поиск"
                      value={draftSearch}
                      onChange={(event) =>
                        setDraftSearch(event.currentTarget.value)
                      }
                    />
                    <Select
                      label="Оплата"
                      data={[
                        { value: "ALL", label: "Все" },
                        { value: "EVER_PAID", label: "Оплатили" },
                        { value: "NEVER_PAID", label: "Не оплатили" },
                      ]}
                      value={query.paidState}
                      disabled={details.isFetching}
                      onChange={(paidState) =>
                        setQuery((current) => ({
                          ...current,
                          paidState:
                            paidState as AdminReferrerInvitesQuery["paidState"],
                          page: 1,
                        }))
                      }
                    />
                    <Select
                      label="Сортировка"
                      data={[
                        { value: "registeredAt", label: "Регистрация" },
                        { value: "firstPaidAt", label: "Первая оплата" },
                        { value: "successfulRevenue", label: "Выручка" },
                      ]}
                      value={query.sortBy}
                      disabled={details.isFetching}
                      onChange={(sortBy) =>
                        setQuery((current) => ({
                          ...current,
                          sortBy: sortBy as AdminReferrerInvitesQuery["sortBy"],
                          page: 1,
                        }))
                      }
                    />
                    <Select
                      label="Порядок"
                      data={ADMIN_SORT_DIRECTION_OPTIONS}
                      value={query.sortDir}
                      disabled={details.isFetching}
                      onChange={(sortDir) =>
                        setQuery((current) => ({
                          ...current,
                          sortDir:
                            sortDir as AdminReferrerInvitesQuery["sortDir"],
                          page: 1,
                        }))
                      }
                    />
                  </SimpleGrid>
                  <Group>
                    <Button
                      loading={details.isFetching}
                      onClick={() =>
                        setQuery((current) => ({
                          ...current,
                          invitedSearch: draftSearch || undefined,
                          page: 1,
                        }))
                      }
                    >
                      Применить поиск
                    </Button>
                    <Button
                      variant="light"
                      disabled={details.isFetching}
                      onClick={() => {
                        setDraftSearch("");
                        setQuery((current) => ({
                          ...current,
                          invitedSearch: undefined,
                          page: 1,
                        }));
                      }}
                    >
                      Сбросить
                    </Button>
                  </Group>
                  <AdminTableLoadingOverlay
                    isFetching={details.isFetching}
                    hasData
                  >
                    <ScrollArea type="auto" offsetScrollbars>
                      <Table miw={1080} striped withTableBorder>
                        <Table.Thead>
                          <Table.Tr>
                            {[
                              "Пользователь",
                              "Регистрация",
                              "Первая оплата",
                              "Успешных платежей",
                              "Выручка",
                              "Начислено",
                              "Статус",
                              "Канал",
                              "Тариф",
                              "Промокод",
                            ].map((title) => (
                              <Table.Th key={title}>{title}</Table.Th>
                            ))}
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {data.items.map((item) => (
                            <Table.Tr key={item.invitedUser.id}>
                              <Table.Td>{item.invitedUser.label}</Table.Td>
                              <Table.Td>
                                {formatAdminDateTime(item.registeredAt)}
                              </Table.Td>
                              <Table.Td>
                                {formatAdminDateTime(item.firstPaidAt)}
                              </Table.Td>
                              <Table.Td>{item.successfulPayments}</Table.Td>
                              <Table.Td>
                                {formatAdminMoney(item.successfulRevenue)}
                              </Table.Td>
                              <Table.Td>
                                {formatAdminMoney(item.awardedBonus)}
                              </Table.Td>
                              <Table.Td>
                                {formatAdminLedgerStatus(
                                  item.latestLedgerStatus,
                                )}
                              </Table.Td>
                              <Table.Td>
                                {formatAdminMerchant(item.latestMerchant)}
                              </Table.Td>
                              <Table.Td>
                                {item.latestPlan.title ||
                                  item.latestPlan.code ||
                                  "—"}
                              </Table.Td>
                              <Table.Td>{item.latestPromoCode || "—"}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </AdminTableLoadingOverlay>
                  {!details.isFetching && !data.items.length ? (
                    <Text c="dimmed">Приглашённые не найдены.</Text>
                  ) : null}
                  <Group justify="space-between">
                    <Select
                      disabled={details.isFetching}
                      w={120}
                      value={String(query.pageSize)}
                      data={["25", "50", "100"]}
                      onChange={(value) =>
                        setQuery((current) => ({
                          ...current,
                          pageSize: Number(value) as 25 | 50 | 100,
                          page: 1,
                        }))
                      }
                    />
                    {data.totalPages > 1 ? (
                      <Pagination
                        disabled={details.isFetching}
                        value={data.page}
                        total={data.totalPages}
                        onChange={(page) =>
                          setQuery((current) => ({ ...current, page }))
                        }
                      />
                    ) : null}
                  </Group>
                </Stack>
              </Paper>
            </Stack>
          </AdminQuerySection>
        ) : null}
      </Stack>
    </Drawer>
  );
}
