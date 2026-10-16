"use client";

import { Alert, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";

import { disableAutoRenew, enableAutoRenew, getAutoRenewState } from "./account.api";
import { getErrorMessage } from "./account.lib";

export default function AutoRenewCard() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["auto-renew"], queryFn: getAutoRenewState });
  const enable = useMutation({
    mutationFn: enableAutoRenew,
    onSuccess: (data) => queryClient.setQueryData(["auto-renew"], data),
  });
  const disable = useMutation({
    mutationFn: disableAutoRenew,
    onSuccess: (data) => queryClient.setQueryData(["auto-renew"], data),
  });
  const state = query.data;
  const error = query.error || enable.error || disable.error;
  const methodLabel = state?.method
    ? `${state.method.title || state.method.type || "Способ оплаты"}${state.method.last4 ? ` •••• ${state.method.last4}` : ""}`
    : "Сохранённый способ оплаты пока недоступен";

  return (
    <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="md">
        <Group gap="sm"><IconRefresh size={22} /><Title order={2}>Автопродление</Title></Group>
        <Text c="dimmed">
          {state?.status === "ACTIVE"
            ? "Включено"
            : state?.status === "RETRY_SCHEDULED"
              ? "Платёж будет повторён позже"
              : state?.status === "MANUAL_ACTION_REQUIRED"
                ? "Нужна ручная оплата"
                : "Выключено"}
        </Text>
        <Text>{methodLabel}</Text>
        {state?.nextPaymentAt ? <Text size="sm">Следующий платёж: {new Date(state.nextPaymentAt).toLocaleString("ru-RU")}</Text> : null}
        {error ? <Alert color="red" icon={<IconAlertCircle size={18} />}>{getErrorMessage(error)}</Alert> : null}
        {state?.enabled ? (
          <Button color="red" variant="light" loading={disable.isPending} onClick={() => {
            if (window.confirm("Отключить автопродление? Текущая подписка продолжит работать.")) disable.mutate();
          }}>Отключить автопродление</Button>
        ) : (
          <Button loading={enable.isPending} disabled={query.isLoading || !state?.method} onClick={() => enable.mutate()}>
            Включить автопродление
          </Button>
        )}
      </Stack>
    </Card>
  );
}
