"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
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
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCopy,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";

import {
  configureAdminUserSubscription,
  cancelAdminUserRecurrent,
  deleteAdminUser,
  disableAdminUserYooKassaAutoRenew,
  getAdminUserAccess,
  getAdminUserDetails,
  getAdminUserRecurrent,
  getErrorMessage,
  stopAdminUserSubscription,
  reconcileAdminUserRecurrent,
} from "@/widgets/pages/AdminPage/admin.lib";
import {
  formatAdminDateTime,
  formatAdminMoney,
  formatAdminPaymentStatus,
  formatAdminPaymentType,
  formatAdminRole,
  formatAdminSubscriptionStatus,
  formatAdminSupportStatus,
} from "@/widgets/pages/AdminPage/admin-stage3";
import AdminConfirmDialog from "@/widgets/pages/AdminPage/components/AdminConfirmDialog";
import {
  ADMIN_ANALYTICS_STALE_TIME,
  ADMIN_QUERY_GC_TIME,
  AdminQueryError,
  AdminQuerySection,
  AdminTableSkeleton,
} from "@/widgets/pages/AdminPage/components/AdminQueryLoading";

type AdminUserDetailsDrawerProps = {
  userId: string | null;
  opened: boolean;
  planOptions: { value: string; label: string }[];
  onClose: () => void;
  onDeleted: () => void;
};

export function AdminUserDetailsDrawer({
  userId,
  opened,
  planOptions,
  onClose,
  onDeleted,
}: AdminUserDetailsDrawerProps) {
  const queryClient = useQueryClient();
  const [paymentPage, setPaymentPage] = useState(1);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [issueConfirmOpened, setIssueConfirmOpened] = useState(false);
  const [stopConfirmOpened, setStopConfirmOpened] = useState(false);
  const [autoRenewConfirmOpened, setAutoRenewConfirmOpened] = useState(false);
  const [recurrentCancelConfirmOpened, setRecurrentCancelConfirmOpened] = useState(false);
  const [deleteConfirmOpened, setDeleteConfirmOpened] = useState(false);
  const details = useQuery({
    queryKey: ["admin-stage3", "user-details", userId, paymentPage, 25],
    queryFn: ({ signal }) =>
      getAdminUserDetails(userId!, paymentPage, 25, signal),
    enabled: Boolean(userId && opened),
    placeholderData: (previousData) =>
      previousData?.profile?.id === userId ? previousData : undefined,
    staleTime: ADMIN_ANALYTICS_STALE_TIME,
    gcTime: ADMIN_QUERY_GC_TIME,
  });
  const access = useQuery({
    queryKey: ["admin-stage3", "user-access", userId],
    queryFn: ({ signal }) => getAdminUserAccess(userId!, signal),
    enabled: Boolean(userId && opened),
    staleTime: ADMIN_ANALYTICS_STALE_TIME,
    gcTime: ADMIN_QUERY_GC_TIME,
  });
  const recurrent = useQuery({
    queryKey: ["admin-stage3", "user-recurrent", userId],
    queryFn: ({ signal }) => getAdminUserRecurrent(userId!, signal),
    enabled: Boolean(userId && opened),
    staleTime: ADMIN_ANALYTICS_STALE_TIME,
    gcTime: ADMIN_QUERY_GC_TIME,
  });
  useEffect(() => {
    // Reset card-local controls when the selected account changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaymentPage(1);
    setSelectedPlanId(null);
  }, [userId]);
  useEffect(() => {
    if (
      opened &&
      details.data?.profile.id === userId &&
      details.data.profile.subscription.planId
    )
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPlanId(details.data.profile.subscription.planId);
  }, [opened, details.data?.profile.id, details.data?.profile.subscription.planId, userId]);
  const invalidateManagement = async (includeAccess = false) => {
    if (!userId) return;
    if (includeAccess)
      await queryClient.invalidateQueries({
        queryKey: ["admin-stage3", "user-access", userId],
      });
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["admin-stage3", "user-details", userId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["admin-stage3", "user-recurrent", userId],
      }),
      queryClient.invalidateQueries({ queryKey: ["admin-stage3"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-summary"] }),
    ]);
  };
  const configureMutation = useMutation({
    mutationFn: () => configureAdminUserSubscription(userId!, selectedPlanId!),
    onSuccess: async () => {
      setIssueConfirmOpened(false);
      await invalidateManagement(true);
    },
  });
  const stopMutation = useMutation({
    mutationFn: () => stopAdminUserSubscription(userId!),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: ["admin-stage3", "user-access", userId],
      });
      setStopConfirmOpened(false);
      await invalidateManagement(true);
    },
  });
  const autoRenewMutation = useMutation({
    mutationFn: () => disableAdminUserYooKassaAutoRenew(userId!),
    onSuccess: async () => {
      setAutoRenewConfirmOpened(false);
      await invalidateManagement();
    },
  });
  const cancelRecurrentMutation = useMutation({
    mutationFn: (agreementId: string) => cancelAdminUserRecurrent(userId!, agreementId),
    onSuccess: async () => {
      setRecurrentCancelConfirmOpened(false);
      await invalidateManagement();
    },
  });
  const reconcileRecurrentMutation = useMutation({
    mutationFn: (agreementId: string) => reconcileAdminUserRecurrent(userId!, agreementId),
    onSuccess: async () => {
      await invalidateManagement();
    },
  });
  const deleteUserMutation = useMutation({
    mutationFn: () => deleteAdminUser(userId!),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: ["admin-stage3", "user-details", userId],
      });
      queryClient.removeQueries({
        queryKey: ["admin-stage3", "user-access", userId],
      });
      setDeleteConfirmOpened(false);
      onDeleted();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-stage3"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-support-threads"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-promo-codes"] }),
        queryClient.invalidateQueries({
          queryKey: ["admin-analytics-overview"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-analytics-sources"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-analytics-attributions"],
        }),
      ]);
    },
  });
  const actionsLocked =
    configureMutation.isPending ||
    stopMutation.isPending ||
    autoRenewMutation.isPending ||
    cancelRecurrentMutation.isPending ||
    reconcileRecurrentMutation.isPending ||
    deleteUserMutation.isPending;
  const data = details.data?.profile.id === userId ? details.data : undefined;
  const hasSubscription = Boolean(
    data?.profile.subscription.status || data?.profile.subscription.planId,
  );
  const canStop =
    hasSubscription && data?.profile.subscription.status !== "STOPPED";
  const currentRecurrent =
    recurrent.data?.find(
      (agreement) =>
        agreement.status !== "CANCELLED" && agreement.status !== "FAILED",
    ) || recurrent.data?.[0];
  const recurrentStatusLabel: Record<string, string> = {
    CREATING: "Создаётся",
    PENDING_AGREEMENT: "Ожидает подтверждения",
    ACTIVE: "Активно",
    PAST_DUE: "Проблема со списанием",
    CANCELLED: "Отменено",
    FAILED: "Не подключено",
    UNKNOWN: "Неизвестно",
  };
  const mutationError = (mutation: { isError: boolean; error: unknown }) =>
    mutation.isError ? (
      <Alert color="red" icon={<IconAlertCircle size={18} />}>
        {getErrorMessage(mutation.error)}
      </Alert>
    ) : null;
  return (
    <>
      <Drawer
        opened={opened}
        onClose={actionsLocked ? () => undefined : onClose}
        title="Карточка пользователя"
        position="right"
        size="min(760px, 100vw)"
        closeOnEscape={!actionsLocked}
        closeOnClickOutside={!actionsLocked}
        withCloseButton={!actionsLocked}
        styles={{ content: { maxWidth: "100vw" } }}
      >
        {details.isError ? (
          <AdminQueryError
            error={details.error}
            retry={() => details.refetch()}
            stale={Boolean(data)}
          />
        ) : null}
        {data ? (
          <AdminQuerySection isFetching={details.isFetching} hasData>
            <Stack gap="lg">
              <Paper p="md" bg="dark.8">
                <Title order={4}>Профиль</Title>
                <Text fw={700}>{data.profile.label}</Text>
                <Text size="sm">{data.profile.email || "Email не указан"}</Text>
                <Text c="dimmed" size="xs">
                  {data.profile.id}
                </Text>
                <Group mt="xs">
                  <Badge>{formatAdminRole(data.profile.role)}</Badge>
                  <Badge color={data.profile.isBlocked ? "red" : "teal"}>
                    {data.profile.isBlocked ? "Заблокирован" : "Активен"}
                  </Badge>
                </Group>
              </Paper>
              <Paper p="md" bg="dark.8">
                <Title order={4}>Подписка</Title>
                <Text>
                  {data.profile.subscription.state} ·{" "}
                  {formatAdminSubscriptionStatus(
                    data.profile.subscription.status,
                  )}
                </Text>
                <Text>
                  {data.profile.subscription.planTitle || "Тариф не указан"}
                </Text>
                <Text c="dimmed">
                  До {formatAdminDateTime(data.profile.subscription.endsAt)} ·
                  автопродление{" "}
                  {data.profile.subscription.autoRenewEnabled
                    ? "включено"
                    : "выключено"}
                </Text>
              </Paper>
              <Paper p="md" bg="dark.8">
                <Stack gap="sm">
                  <Title order={4}>Управление подпиской</Title>
                  <Select
                    label="Тариф"
                    placeholder="Выберите тариф"
                    searchable
                    data={planOptions}
                    value={selectedPlanId}
                    onChange={setSelectedPlanId}
                    disabled={actionsLocked}
                  />
                  <Text c="dimmed" size="sm">
                    Администратор выдаёт или перенастраивает подписку без
                    создания платежа.
                  </Text>
                  {mutationError(configureMutation)}
                  <Button
                    loading={configureMutation.isPending}
                    disabled={actionsLocked || !selectedPlanId}
                    onClick={() => {
                      configureMutation.reset();
                      setIssueConfirmOpened(true);
                    }}
                  >
                    {hasSubscription ? "Изменить подписку" : "Выдать подписку"}
                  </Button>
                </Stack>
              </Paper>
              <Paper p="md" bg="dark.8">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Title order={4}>Доступ</Title>
                    <Button
                      size="xs"
                      variant="subtle"
                      leftSection={<IconRefresh size={14} />}
                      onClick={() => access.refetch()}
                      disabled={actionsLocked || access.isFetching}
                    >
                      Обновить
                    </Button>
                  </Group>
                  {access.isError ? (
                    <Alert color="red" icon={<IconAlertCircle size={18} />}>
                      {getErrorMessage(access.error)}
                    </Alert>
                  ) : access.isFetching ? (
                    <Text c="dimmed">Загрузка доступа…</Text>
                  ) : access.data?.subscriptionUrl ? (
                    <>
                      <Text size="sm">
                        Статус: {access.data.status || "—"} ·{" "}
                        {access.data.deliveryMode}
                      </Text>
                      <Text style={{ overflowWrap: "anywhere" }}>
                        {access.data.subscriptionUrl}
                      </Text>
                      <Button
                        variant="light"
                        leftSection={<IconCopy size={16} />}
                        onClick={() =>
                          navigator.clipboard.writeText(
                            access.data!.subscriptionUrl!,
                          )
                        }
                      >
                        Скопировать ссылку
                      </Button>
                      <Text c="yellow.3" size="sm">
                        Ссылка является чувствительным учётным данным доступа.
                        Не публикуйте и не передавайте её посторонним.
                      </Text>
                    </>
                  ) : (
                    <Text c="dimmed">
                      Доступ пока недоступен.{" "}
                      {access.data?.deliveryMode
                        ? `Режим: ${access.data.deliveryMode}.`
                        : ""}
                    </Text>
                  )}
                </Stack>
              </Paper>
              <Paper p="md" bg="dark.8">
                <Stack gap="sm">
                  <Title order={4}>Автопродление</Title>
                  <Checkbox
                    label="Автопродление YooKassa"
                    checked={data.profile.subscription.autoRenewEnabled}
                    disabled={
                      actionsLocked ||
                      !data.profile.subscription.autoRenewEnabled
                    }
                    onChange={() => {
                      autoRenewMutation.reset();
                      setAutoRenewConfirmOpened(true);
                    }}
                  />
                  <Text c="dimmed" size="sm">
                    Администратор может только отключить текущие будущие
                    списания YooKassa.
                  </Text>
                  {mutationError(autoRenewMutation)}
                  {recurrent.isError ? (
                    <Alert color="red" icon={<IconAlertCircle size={18} />}>
                      {getErrorMessage(recurrent.error)}
                    </Alert>
                  ) : recurrent.isFetching && !recurrent.data ? (
                    <Text c="dimmed">Загрузка автопродления…</Text>
                  ) : !currentRecurrent ? (
                    <Text c="dimmed">Автопродление не подключено</Text>
                  ) : (
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text fw={600}>Platega</Text>
                        <Badge color={currentRecurrent.status === "PAST_DUE" ? "yellow" : "teal"}>
                          {recurrentStatusLabel[currentRecurrent.status] || "Неизвестно"}
                        </Badge>
                      </Group>
                      <Text>{currentRecurrent.planName || "Тариф не указан"}</Text>
                      <Text c="dimmed" size="sm">
                        {formatAdminMoney(String(currentRecurrent.amount), currentRecurrent.currency)} · {currentRecurrent.cadence === "MONTHLY" ? "Ежемесячно" : currentRecurrent.cadence === "YEARLY" ? "Ежегодно" : "Период не определён"}
                      </Text>
                      <Text c="dimmed" size="sm">
                        Источник: {currentRecurrent.merchant === "SITE" ? "Сайт" : "Telegram-бот"}
                      </Text>
                      <Text c="dimmed" size="sm">Следующее списание / доступ до: {formatAdminDateTime(currentRecurrent.nextChargeAt)}</Text>
                      <Text c="dimmed" size="sm">Последнее успешное списание: {formatAdminDateTime(currentRecurrent.lastChargeAt)}</Text>
                      <Text c="dimmed" size="sm">Отмена: {formatAdminDateTime(currentRecurrent.cancelledAt)}</Text>
                      <Text c="dimmed" size="sm">Согласие: {formatAdminDateTime(currentRecurrent.consentAcceptedAt)}{currentRecurrent.consentLegalVersion ? ` · версия ${currentRecurrent.consentLegalVersion}` : ""}</Text>
                      <Text c="dimmed" size="sm">Создано: {formatAdminDateTime(currentRecurrent.createdAt)}</Text>
                      {mutationError(cancelRecurrentMutation)}
                      {mutationError(reconcileRecurrentMutation)}
                      <Group grow>
                        {currentRecurrent.canCancel ? (
                          <Button
                            color="red"
                            variant="light"
                            loading={cancelRecurrentMutation.isPending}
                            disabled={actionsLocked}
                            onClick={() => {
                              cancelRecurrentMutation.reset();
                              setRecurrentCancelConfirmOpened(true);
                            }}
                          >
                            Отменить автопродление
                          </Button>
                        ) : null}
                        {currentRecurrent.canReconcile ? (
                          <Button
                            variant="light"
                            loading={reconcileRecurrentMutation.isPending}
                            disabled={actionsLocked}
                            onClick={() => {
                              reconcileRecurrentMutation.reset();
                              reconcileRecurrentMutation.mutate(currentRecurrent.id);
                            }}
                          >
                            Сверить с Platega
                          </Button>
                        ) : null}
                      </Group>
                    </Stack>
                  )}
                </Stack>
              </Paper>
              <Paper
                p="md"
                bg="dark.8"
                bd="1px solid var(--mantine-color-red-8)"
              >
                <Stack gap="sm">
                  <Title order={4} c="red.4">
                    Деактивация
                  </Title>
                  <Text c="dimmed" size="sm">
                    Отключает VPN-доступ, но не блокирует и не удаляет
                    пользователя.
                  </Text>
                  {mutationError(stopMutation)}
                  <Button
                    color="red"
                    variant="light"
                    loading={stopMutation.isPending}
                    disabled={actionsLocked || !canStop}
                    onClick={() => {
                      stopMutation.reset();
                      setStopConfirmOpened(true);
                    }}
                  >
                    Деактивировать подписку
                  </Button>
                </Stack>
              </Paper>
              <Paper p="md" bg="dark.8" style={{ minWidth: 0 }}>
                <Title order={4} mb="sm">
                  Платежи
                </Title>
                <ScrollArea type="auto" offsetScrollbars>
                  <Table miw={760}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Дата</Table.Th>
                        <Table.Th>Тип</Table.Th>
                        <Table.Th>Тариф</Table.Th>
                        <Table.Th>Сумма</Table.Th>
                        <Table.Th>Статус</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data.paymentHistory.map((payment) => (
                        <Table.Tr key={payment.id}>
                          <Table.Td>
                            {formatAdminDateTime(
                              payment.paidAt || payment.createdAt,
                            )}
                          </Table.Td>
                          <Table.Td>
                            {formatAdminPaymentType(payment.paymentType)}
                          </Table.Td>
                          <Table.Td>
                            {payment.plan.title || payment.plan.code || "—"}
                          </Table.Td>
                          <Table.Td>
                            {formatAdminMoney(payment.amount, payment.currency)}
                          </Table.Td>
                          <Table.Td>
                            {formatAdminPaymentStatus(payment.status)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
                {data.paymentTotal > data.paymentPageSize ? (
                  <Pagination
                    mt="sm"
                    value={data.paymentPage}
                    total={Math.ceil(data.paymentTotal / data.paymentPageSize)}
                    onChange={setPaymentPage}
                  />
                ) : null}
              </Paper>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Paper p="md" bg="dark.8">
                  <Title order={4}>Промокоды</Title>
                  {data.promoUsages.length ? (
                    data.promoUsages.map((promo) => (
                      <Text key={`${promo.promoCode}-${promo.appliedAt}`}>
                        {promo.promoCode} · {promo.status} ·{" "}
                        {formatAdminDateTime(promo.appliedAt)}
                      </Text>
                    ))
                  ) : (
                    <Text c="dimmed">Нет применений</Text>
                  )}
                </Paper>
                <Paper p="md" bg="dark.8">
                  <Title order={4}>Рефералы</Title>
                  <Text>Приглашено: {data.referral.referredUsersCount}</Text>
                  <Text>Оплатили: {data.referral.referredPayingUsers}</Text>
                  <Text>
                    Начислено:{" "}
                    {formatAdminMoney(data.referral.awardedBonusTotal)}
                  </Text>
                  <Text>
                    Баланс:{" "}
                    {formatAdminMoney(data.referral.currentWalletBalance)}
                  </Text>
                </Paper>
              </SimpleGrid>
              <Paper p="md" bg="dark.8">
                <Title order={4}>Поддержка</Title>
                <Text>
                  Статус:{" "}
                  {data.supportSummary.status
                    ? formatAdminSupportStatus(data.supportSummary.status)
                    : "Нет обращения"}
                </Text>
                <Text>Сообщений: {data.supportSummary.messagesCount}</Text>
                <Text c="dimmed">
                  Последнее:{" "}
                  {formatAdminDateTime(data.supportSummary.lastMessageAt)}
                </Text>
              </Paper>
              <Paper
                p="md"
                bg="dark.8"
                bd="1px solid var(--mantine-color-red-8)"
              >
                <Stack gap="sm">
                  <Title order={4} c="red.4">
                    Необратимое действие
                  </Title>
                  <Text c="dimmed" size="sm">
                    Полное удаление учётной записи и всех связанных данных.
                  </Text>
                  {mutationError(deleteUserMutation)}
                  <Button
                    color="red"
                    variant="light"
                    leftSection={<IconTrash size={16} />}
                    loading={deleteUserMutation.isPending}
                    disabled={actionsLocked}
                    onClick={() => {
                      deleteUserMutation.reset();
                      setDeleteConfirmOpened(true);
                    }}
                  >
                    Удалить пользователя
                  </Button>
                </Stack>
              </Paper>
            </Stack>
          </AdminQuerySection>
        ) : details.isFetching ? (
          <AdminTableSkeleton rows={6} />
        ) : null}
      </Drawer>
      <AdminConfirmDialog
        opened={issueConfirmOpened}
        title={hasSubscription ? "Изменить подписку?" : "Выдать подписку?"}
        message="Это административная выдача или настройка: платеж не создаётся. Для существующей подписки выбранный тариф применяется с текущего момента, а даты подписки могут быть заменены периодом выбранного тарифа."
        confirmLabel={hasSubscription ? "Изменить подписку" : "Выдать подписку"}
        cancelLabel="Отмена"
        pending={configureMutation.isPending}
        onConfirm={async () => {
          await configureMutation.mutateAsync();
        }}
        onCancel={() => setIssueConfirmOpened(false)}
      />
      <AdminConfirmDialog
        opened={stopConfirmOpened}
        title="Деактивировать подписку?"
        message="VPN-доступ будет отключён немедленно. Учётная запись, платежи и история не удаляются; историческая дата окончания сохраняется. Позже подписку можно снова выдать через админку."
        confirmLabel="Деактивировать"
        cancelLabel="Отмена"
        danger
        pending={stopMutation.isPending}
        onConfirm={async () => {
          await stopMutation.mutateAsync();
        }}
        onCancel={() => setStopConfirmOpened(false)}
      />
      <AdminConfirmDialog
        opened={autoRenewConfirmOpened}
        title="Отключить автопродление YooKassa?"
        message="Будущие автоматические списания YooKassa прекратятся. Текущий оплаченный доступ сохранится до текущей даты окончания, а сохранённый способ оплаты не будет удалён или отозван."
        confirmLabel="Отключить YooKassa"
        cancelLabel="Отмена"
        pending={autoRenewMutation.isPending}
        onConfirm={async () => {
          await autoRenewMutation.mutateAsync();
        }}
        onCancel={() => setAutoRenewConfirmOpened(false)}
      />
      <AdminConfirmDialog
        opened={recurrentCancelConfirmOpened}
        title="Отменить автопродление?"
        message="Будущие списания будут остановлены. Уже оплаченный период доступа сохранится."
        confirmLabel="Отменить автопродление"
        cancelLabel="Отмена"
        danger
        pending={cancelRecurrentMutation.isPending}
        onConfirm={async () => {
          if (currentRecurrent) await cancelRecurrentMutation.mutateAsync(currentRecurrent.id);
        }}
        onCancel={() => setRecurrentCancelConfirmOpened(false)}
      />
      <AdminConfirmDialog
        opened={deleteConfirmOpened}
        title="Удалить пользователя?"
        message={`Пользователь «${data?.profile.label || "выбранный пользователь"}» и все связанные с его аккаунтом данные будут безвозвратно удалены: подписка, платежи, реферальные начисления, обращения и другие связанные записи. Восстановить данные будет невозможно.`}
        confirmLabel="Удалить навсегда"
        cancelLabel="Отмена"
        danger
        pending={deleteUserMutation.isPending}
        onConfirm={async () => {
          await deleteUserMutation.mutateAsync();
        }}
        onCancel={() => setDeleteConfirmOpened(false)}
      />
    </>
  );
}
