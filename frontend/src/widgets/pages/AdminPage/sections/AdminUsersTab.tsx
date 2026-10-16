"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Badge,
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
import { useMediaQuery } from "@mantine/hooks";
import { IconEye, IconFilter } from "@tabler/icons-react";
import { useState } from "react";

import { queryAdminUsers } from "../admin.lib";
import {
  ADMIN_AUTH_CHANNEL_OPTIONS,
  ADMIN_REFERRAL_STATE_OPTIONS,
  ADMIN_ROLE_OPTIONS,
  ADMIN_SORT_DIRECTION_OPTIONS,
  ADMIN_SUBSCRIPTION_STATE_OPTIONS,
  ADMIN_USER_PAYMENT_STATE_OPTIONS,
  formatAdminAuthChannel,
  formatAdminDateTime,
  formatAdminMoney,
  formatAdminSubscriptionState,
  stableAdminQueryKey,
} from "../admin-stage3";
import type { AdminSafeUserItem, AdminUserQuery } from "../admin.types";
import {
  ADMIN_ANALYTICS_STALE_TIME,
  ADMIN_QUERY_GC_TIME,
  AdminQueryError,
  AdminTableLoadingOverlay,
} from "../components/AdminQueryLoading";
import { AdminUserDetailsDrawer } from "@/features/admin/users/AdminUserDetailsDrawer";

const defaults: AdminUserQuery = {
  authChannel: "ALL",
  subscriptionState: "ALL",
  paymentState: "ALL",
  referralState: "ALL",
  page: 1,
  pageSize: 25,
  sortBy: "createdAt",
  sortDir: "DESC",
};

const userTableColumns = [
  ["Пользователь", 240],
  ["Каналы входа", 130],
  ["Регистрация", 150],
  ["Роль", 120],
  ["Подписка", 130],
  ["Тариф", 200],
  ["Окончание", 150],
  ["Автопродление", 150],
  ["Оплачено всего", 150],
  ["Последняя оплата", 150],
  ["Рефералы", 140],
  ["Подробнее", 120],
] as const;

export default function AdminUsersTab({
  planOptions,
}: {
  planOptions: { value: string; label: string }[];
}) {
  const mobile = useMediaQuery("(max-width: 47.99em)");
  const [filterOpened, setFilterOpened] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminUserQuery>(defaults);
  const [query, setQuery] = useState<AdminUserQuery>(defaults);
  const users = useQuery({
    queryKey: stableAdminQueryKey("users", query),
    queryFn: ({ signal }) => queryAdminUsers(query, signal),
    placeholderData: keepPreviousData,
    staleTime: ADMIN_ANALYTICS_STALE_TIME,
    gcTime: ADMIN_QUERY_GC_TIME,
  });
  const set = (patch: Partial<AdminUserQuery>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const filters = (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <TextInput
          label="Email / username"
          value={draft.search || ""}
          onChange={(event) => set({ search: event.currentTarget.value })}
        />
        <TextInput
          label="Telegram ID точно"
          value={draft.telegramId || ""}
          onChange={(event) => set({ telegramId: event.currentTarget.value })}
        />
        <TextInput
          label="Промокод"
          value={draft.promoCode || ""}
          onChange={(event) => set({ promoCode: event.currentTarget.value })}
        />
        <TextInput
          type="date"
          label="Регистрация от"
          value={draft.registeredFrom || ""}
          onChange={(event) =>
            set({ registeredFrom: event.currentTarget.value })
          }
        />
        <TextInput
          type="date"
          label="Регистрация до"
          value={draft.registeredTo || ""}
          onChange={(event) => set({ registeredTo: event.currentTarget.value })}
        />
        <Select
          label="Роль"
          clearable
          data={ADMIN_ROLE_OPTIONS}
          value={draft.role || null}
          onChange={(role) => set({ role: role || undefined })}
        />
        <Select
          label="Блокировка"
          data={[
            { value: "ALL", label: "Все" },
            { value: "true", label: "Заблокирован" },
            { value: "false", label: "Не заблокирован" },
          ]}
          value={draft.blocked === undefined ? "ALL" : String(draft.blocked)}
          onChange={(value) =>
            set({ blocked: value === "ALL" ? undefined : value === "true" })
          }
        />
        <Select
          label="Канал входа"
          data={ADMIN_AUTH_CHANNEL_OPTIONS}
          value={draft.authChannel}
          onChange={(authChannel) =>
            set({ authChannel: authChannel as AdminUserQuery["authChannel"] })
          }
        />
        <Select
          label="Подписка"
          data={ADMIN_SUBSCRIPTION_STATE_OPTIONS}
          value={draft.subscriptionState}
          onChange={(subscriptionState) =>
            set({
              subscriptionState:
                subscriptionState as AdminUserQuery["subscriptionState"],
            })
          }
        />
        <Select
          label="Тариф"
          data={[{ value: "ALL", label: "Все" }, ...planOptions]}
          searchable
          value={draft.planId || "ALL"}
          onChange={(planId) =>
            set({ planId: planId === "ALL" ? undefined : planId || undefined })
          }
        />
        <Select
          label="Автопродление"
          data={[
            { value: "ALL", label: "Все" },
            { value: "true", label: "Включено" },
            { value: "false", label: "Выключено" },
          ]}
          value={
            draft.autoRenewEnabled === undefined
              ? "ALL"
              : String(draft.autoRenewEnabled)
          }
          onChange={(value) =>
            set({
              autoRenewEnabled: value === "ALL" ? undefined : value === "true",
            })
          }
        />
        <TextInput
          type="date"
          label="Истекает после"
          value={draft.expiresAfter || ""}
          onChange={(event) => set({ expiresAfter: event.currentTarget.value })}
        />
        <TextInput
          type="date"
          label="Истекает до"
          value={draft.expiresBefore || ""}
          onChange={(event) =>
            set({ expiresBefore: event.currentTarget.value })
          }
        />
        <Select
          label="Платежи"
          data={ADMIN_USER_PAYMENT_STATE_OPTIONS}
          value={draft.paymentState}
          onChange={(paymentState) =>
            set({
              paymentState: paymentState as AdminUserQuery["paymentState"],
            })
          }
        />
        <Select
          label="Рефералы"
          data={ADMIN_REFERRAL_STATE_OPTIONS}
          value={draft.referralState}
          onChange={(referralState) =>
            set({
              referralState: referralState as AdminUserQuery["referralState"],
            })
          }
        />
      </SimpleGrid>
      <Group>
        <Button
          loading={users.isFetching}
          onClick={() => {
            setQuery({ ...draft, page: 1 });
            setFilterOpened(false);
          }}
        >
          Применить
        </Button>
        <Button
          disabled={users.isFetching}
          variant="light"
          onClick={() => {
            setDraft(defaults);
            setQuery(defaults);
            setFilterOpened(false);
          }}
        >
          Сбросить
        </Button>
      </Group>
    </Stack>
  );

  return (
    <Stack gap="lg" style={{ minWidth: 0 }}>
      <Group justify="space-between">
        <Title order={2}>Пользователи</Title>
        {mobile ? (
          <Button
            leftSection={<IconFilter size={16} />}
            onClick={() => setFilterOpened(true)}
          >
            Фильтры
          </Button>
        ) : null}
      </Group>
      {mobile ? (
        <Drawer
          opened={filterOpened}
          onClose={() => setFilterOpened(false)}
          title="Фильтры пользователей"
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
      {users.isError ? (
        <AdminQueryError
          error={users.error}
          retry={() => users.refetch()}
          stale={Boolean(users.data)}
        />
      ) : null}
      <Paper
        p="md"
        bg="dark.8"
        bd="1px solid var(--mantine-color-dark-6)"
        style={{ minWidth: 0 }}
      >
        <Stack gap="md">
          <Text c="dimmed">
            {users.data ? `Всего: ${users.data.total}` : "Загрузка…"}
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select
              label="Сортировка"
              data={[
                { value: "createdAt", label: "Регистрация" },
                { value: "email", label: "Email" },
                { value: "subscriptionEndsAt", label: "Окончание" },
                { value: "successfulPaidTotal", label: "Оплачено" },
                { value: "lastPaidAt", label: "Последняя оплата" },
              ]}
              value={query.sortBy}
              onChange={(sortBy) =>
                setQuery((current) => ({
                  ...current,
                  sortBy: sortBy as AdminUserQuery["sortBy"],
                  page: 1,
                }))
              }
            />
            <Select
              label="Порядок"
              data={ADMIN_SORT_DIRECTION_OPTIONS}
              value={query.sortDir}
              onChange={(sortDir) =>
                setQuery((current) => ({
                  ...current,
                  sortDir: sortDir as AdminUserQuery["sortDir"],
                  page: 1,
                }))
              }
            />
          </SimpleGrid>
          <AdminTableLoadingOverlay
            isFetching={users.isFetching}
            hasData={Boolean(users.data)}
          >
            {users.data ? (
              <ScrollArea type="auto" offsetScrollbars>
                <Table miw={1770} striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      {userTableColumns.map(([title, minWidth]) => (
                        <Table.Th
                          key={title}
                          style={{ minWidth, whiteSpace: "nowrap" }}
                        >
                          {title}
                        </Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {users.data.items.map((user: AdminSafeUserItem) => (
                      <Table.Tr key={user.id}>
                        <Table.Td style={{ minWidth: 240 }}>
                          <Text fw={700}>{user.label}</Text>
                          <Text
                            size="xs"
                            c="dimmed"
                            style={{ overflowWrap: "anywhere" }}
                          >
                            {user.email || user.id}
                          </Text>
                        </Table.Td>
                        <Table.Td
                          style={{ minWidth: 130, whiteSpace: "nowrap" }}
                        >
                          {user.authChannels
                            .map(formatAdminAuthChannel)
                            .join(" + ") || "—"}
                        </Table.Td>
                        <Table.Td
                          style={{ minWidth: 150, whiteSpace: "nowrap" }}
                        >
                          {formatAdminDateTime(user.createdAt)}
                        </Table.Td>
                        <Table.Td
                          style={{ minWidth: 120, whiteSpace: "nowrap" }}
                        >
                          <Group gap={4} wrap="nowrap">
                            <Badge
                              color={user.role === "ADMIN" ? "violet" : "gray"}
                              variant={
                                user.role === "ADMIN" ? "filled" : "light"
                              }
                            >
                              {user.role}
                            </Badge>
                            {user.isBlocked ? (
                              <Badge color="red">BLOCKED</Badge>
                            ) : null}
                          </Group>
                        </Table.Td>
                        <Table.Td
                          style={{ minWidth: 130, whiteSpace: "nowrap" }}
                        >
                          {formatAdminSubscriptionState(
                            user.subscription.state,
                          )}
                        </Table.Td>
                        <Table.Td style={{ minWidth: 200, maxWidth: 220 }}>
                          {user.subscription.planTitle || "—"}
                        </Table.Td>
                        <Table.Td
                          style={{ minWidth: 150, whiteSpace: "nowrap" }}
                        >
                          {formatAdminDateTime(user.subscription.endsAt)}
                        </Table.Td>
                        <Table.Td
                          style={{ minWidth: 150, whiteSpace: "nowrap" }}
                        >
                          {user.subscription.autoRenewEnabled ? "Да" : "Нет"}
                        </Table.Td>
                        <Table.Td
                          style={{ minWidth: 150, whiteSpace: "nowrap" }}
                        >
                          {formatAdminMoney(user.successfulPaidTotal)} (
                          {user.successfulPayments})
                        </Table.Td>
                        <Table.Td
                          style={{ minWidth: 150, whiteSpace: "nowrap" }}
                        >
                          {formatAdminDateTime(user.lastPaidAt)}
                        </Table.Td>
                        <Table.Td
                          style={{ minWidth: 140, whiteSpace: "nowrap" }}
                        >
                          {user.referredUsersCount}
                          {user.wasReferred ? " · приглашён" : ""}
                        </Table.Td>
                        <Table.Td
                          style={{ minWidth: 120, whiteSpace: "nowrap" }}
                        >
                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconEye size={15} />}
                            onClick={() => setSelectedUserId(user.id)}
                          >
                            Открыть
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            ) : null}
          </AdminTableLoadingOverlay>
          {!users.isFetching && users.data && !users.data.items.length ? (
            <Text c="dimmed">Пользователи не найдены.</Text>
          ) : null}
          <Group justify="space-between">
            <Select
              disabled={users.isFetching}
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
            {users.data && users.data.totalPages > 1 ? (
              <Pagination
                disabled={users.isFetching}
                value={users.data.page}
                total={users.data.totalPages}
                onChange={(page) =>
                  setQuery((current) => ({ ...current, page }))
                }
              />
            ) : null}
          </Group>
        </Stack>
      </Paper>
      <AdminUserDetailsDrawer
        userId={selectedUserId}
        opened={Boolean(selectedUserId)}
        planOptions={planOptions}
        onClose={() => setSelectedUserId(null)}
        onDeleted={() => setSelectedUserId(null)}
      />
    </Stack>
  );
}
