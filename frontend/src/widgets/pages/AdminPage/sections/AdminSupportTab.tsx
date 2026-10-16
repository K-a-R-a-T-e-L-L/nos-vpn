import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Pagination,
  Paper,
  SimpleGrid,
  Stack,
  Skeleton,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { IconMessageCircle, IconRefresh } from "@tabler/icons-react";

import SupportPhotoAttachmentInput from "@/features/support/SupportPhotoAttachmentInput";
import SupportPhotoPreview from "@/features/support/SupportPhotoPreview";
import { formatDate } from "../admin.lib";
import { formatAdminSupportStatus } from "../admin-stage3";
import type {
  AdminPaginatedResponse,
  SupportThreadDetail,
  SupportDeliveryStatus,
  SupportThreadSummary,
} from "../admin.types";
import { useState } from "react";
import AdminConfirmDialog from "../components/AdminConfirmDialog";

type AdminSupportTabProps = {
  supportSearch: string;
  supportThreads: SupportThreadSummary[];
  supportThreadsPage: AdminPaginatedResponse<SupportThreadSummary> | null;
  selectedSupportThreadId: string | null;
  supportThread: SupportThreadDetail | undefined;
  supportReplyText: string;
  supportReplyPhoto: File | null;
  hasMoreMessages: boolean;
  visibleMessages: SupportThreadDetail["messages"];
  isReplyPending: boolean;
  isClosePending: boolean;
  isThreadsFetching: boolean;
  isThreadFetching: boolean;
  deliveryStatus: SupportDeliveryStatus | null;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onSelectThread: (threadId: string) => void;
  onSupportReplyTextChange: (value: string) => void;
  onSupportReplyPhotoChange: (file: File | null) => void;
  onShowMoreMessages: () => void;
  onSendReply: () => void;
  onCloseThread: () => Promise<void>;
  onPageChange: (page: number) => void;
};

export default function AdminSupportTab({
  supportSearch,
  supportThreads,
  supportThreadsPage,
  selectedSupportThreadId,
  supportThread,
  supportReplyText,
  supportReplyPhoto,
  hasMoreMessages,
  visibleMessages,
  isReplyPending,
  isClosePending,
  isThreadsFetching,
  isThreadFetching,
  deliveryStatus,
  onSearchChange,
  onRefresh,
  onSelectThread,
  onSupportReplyTextChange,
  onSupportReplyPhotoChange,
  onShowMoreMessages,
  onSendReply,
  onCloseThread,
  onPageChange,
}: AdminSupportTabProps) {
  const [closeDialogOpened, setCloseDialogOpened] = useState(false);
  return (
    <>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Paper p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          <Stack gap="md">
            <Group align="end">
              <TextInput
                label="Поиск"
                placeholder="Email, Telegram username или ID"
                value={supportSearch}
                onChange={(event) => onSearchChange(event.currentTarget.value)}
                w="100%"
              />
              <Button
                variant="light"
                leftSection={<IconRefresh size={18} />}
                onClick={onRefresh}
              >
                Обновить
              </Button>
            </Group>
            {supportThreadsPage ? (
              <Text c="dimmed" size="sm">
                Всего обращений: {supportThreadsPage.total}
              </Text>
            ) : null}
            <Stack gap="sm">
              {isThreadsFetching && !supportThreadsPage ? (
                <Stack aria-label="Загрузка обращений">
                  <Skeleton h={72} />
                  <Skeleton h={72} />
                  <Skeleton h={72} />
                </Stack>
              ) : supportThreads.length ? (
                supportThreads.map((thread) => (
                  <Card
                    key={thread.id}
                    p="md"
                    bg={
                      selectedSupportThreadId === thread.id
                        ? "dark.7"
                        : "dark.8"
                    }
                    bd="1px solid var(--mantine-color-dark-6)"
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelectThread(thread.id)}
                  >
                    <Stack gap={6}>
                      <Group justify="space-between" gap="sm">
                        <Text fw={700}>
                          {thread.user?.email ||
                            (thread.user?.telegramUsername
                              ? `@${thread.user.telegramUsername}`
                              : "Пользователь")}
                        </Text>
                        <Badge
                          color={
                            thread.status === "OPEN" ? "brandOrange" : "gray"
                          }
                          variant="light"
                        >
                          {formatAdminSupportStatus(thread.status)}
                        </Badge>
                      </Group>
                      <Text c="dimmed" size="sm">
                        {thread.user?.telegramId
                          ? `Telegram ID: ${thread.user.telegramId}`
                          : "Telegram не привязан"}
                      </Text>
                      <Text lineClamp={2}>
                        {thread.latestMessage?.contentKind === "PHOTO" ? "📷 Изображение из Telegram" : thread.latestMessage?.text || "Сообщений пока нет"}
                      </Text>
                      <Text c="dimmed" size="xs">
                        {formatDate(
                          thread.latestMessage?.createdAt ||
                            thread.lastMessageAt,
                        )}
                      </Text>
                    </Stack>
                  </Card>
                ))
              ) : (
                <Alert
                  color="brandCyan"
                  variant="light"
                  icon={<IconMessageCircle size={18} />}
                >
                  Обращений пока нет.
                </Alert>
              )}
            </Stack>
            {supportThreadsPage && supportThreadsPage.totalPages > 1 ? (
              <Pagination
                value={supportThreadsPage.page}
                total={supportThreadsPage.totalPages}
                onChange={onPageChange}
              />
            ) : null}
          </Stack>
        </Paper>

        <Paper p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          {selectedSupportThreadId && isThreadFetching && !supportThread ? (
            <Stack aria-label="Загрузка диалога">
              <Skeleton h={32} w="45%" />
              <Skeleton h={110} />
              <Skeleton h={110} />
            </Stack>
          ) : selectedSupportThreadId && supportThread ? (
            <Stack gap="md">
              <Group justify="space-between" align="flex-start" gap="md">
                <Stack gap={4}>
                  <Title order={3}>Диалог с пользователем</Title>
                  <Text c="dimmed">
                    {supportThread.user?.email ||
                      (supportThread.user?.telegramUsername
                        ? `@${supportThread.user.telegramUsername}`
                        : supportThread.user?.id || "Пользователь")}
                  </Text>
                  <Text c="dimmed" size="sm">
                    {supportThread.user?.telegramId
                      ? `Telegram ID: ${supportThread.user.telegramId}`
                      : "Telegram не привязан"}
                  </Text>
                </Stack>
                <Button
                  variant="light"
                  color="brandOrange"
                  onClick={() => setCloseDialogOpened(true)}
                  disabled={
                    isReplyPending ||
                    isClosePending ||
                    supportThread.status === "CLOSED"
                  }
                >
                  Закрыть поток
                </Button>
              </Group>

              {hasMoreMessages ? (
                <Button
                  variant="light"
                  onClick={onShowMoreMessages}
                  w="fit-content"
                >
                  Показать более ранние сообщения
                </Button>
              ) : null}

              <Stack gap="sm">
                {deliveryStatus && deliveryStatus !== "SENT" ? (
                  <Alert color={deliveryStatus === "NO_TELEGRAM_ID" ? "brandOrange" : "red"} variant="light">
                    {deliveryStatus === "FAILED"
                      ? "Ответ сохранён, но Telegram-доставка не удалась."
                      : deliveryStatus === "NO_TELEGRAM_ID"
                        ? "Ответ сохранён, но у пользователя нет Telegram для доставки."
                        : deliveryStatus === "SKIPPED_DUPLICATE"
                          ? "Этот ответ уже был сохранён ранее."
                          : "Ответ сохранён, но Telegram-доставка выполнена не полностью."}
                  </Alert>
                ) : null}
                {visibleMessages.map((message) => (
                  <Card
                    key={message.id}
                    p="md"
                    bg={message.authorType === "ADMIN" ? "dark.7" : "dark.9"}
                    bd="1px solid var(--mantine-color-dark-6)"
                  >
                    <Stack gap={6}>
                      <Group justify="space-between" gap="sm">
                        <Badge
                          color={
                            message.authorType === "ADMIN"
                              ? "brandOrange"
                              : "brandCyan"
                          }
                          variant="light"
                        >
                          {message.authorType === "ADMIN"
                            ? "Поддержка"
                            : "Пользователь"}
                        </Badge>
                        <Text c="dimmed" size="xs">
                          {formatDate(message.createdAt)}
                        </Text>
                      </Group>
                      <Text c="dimmed" size="xs">
                        Источник: {message.source}
                      </Text>
                      {message.contentKind === "PHOTO" ? (
                        <Stack gap={2}>
                          <SupportPhotoPreview messageId={message.id} scope="admin" alt="Изображение из обращения в поддержку" />
                          {message.text ? <Text c="dimmed" size="sm" style={{ whiteSpace: "pre-wrap" }}>{message.text}</Text> : null}
                        </Stack>
                      ) : (
                        <Text style={{ whiteSpace: "pre-wrap" }}>{message.text}</Text>
                      )}
                    </Stack>
                  </Card>
                ))}
              </Stack>

              <Textarea
                disabled={isReplyPending || isClosePending}
                label={supportReplyPhoto ? "Подпись к изображению" : "Ответ пользователю"}
                placeholder={supportReplyPhoto ? "Необязательная подпись" : "Напишите ответ"}
                minRows={4}
                autosize
                value={supportReplyText}
                onChange={(event) =>
                  onSupportReplyTextChange(event.currentTarget.value)
                }
              />
              <SupportPhotoAttachmentInput file={supportReplyPhoto} disabled={isReplyPending || isClosePending} onChange={onSupportReplyPhotoChange} />
              <Button
                leftSection={<IconMessageCircle size={18} />}
                loading={isReplyPending}
                disabled={
                  isReplyPending || isClosePending || (!supportReplyText.trim() && !supportReplyPhoto)
                }
                onClick={onSendReply}
                w="fit-content"
              >
                Отправить ответ
              </Button>
            </Stack>
          ) : (
            <Alert
              color="brandCyan"
              variant="light"
              icon={<IconMessageCircle size={18} />}
            >
              Выберите обращение слева, чтобы открыть историю сообщений и
              ответить пользователю.
            </Alert>
          )}
        </Paper>
      </SimpleGrid>
      <AdminConfirmDialog
        opened={closeDialogOpened}
        title="Закрыть обращение?"
        message="Обращение будет переведено в закрытое состояние. Повторное открытие через текущий интерфейс недоступно."
        confirmLabel="Закрыть"
        pending={isClosePending}
        onConfirm={onCloseThread}
        onCancel={() => setCloseDialogOpened(false)}
      />
    </>
  );
}
