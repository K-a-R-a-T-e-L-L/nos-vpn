import { Alert, Badge, Button, Card, Group, Stack, Text, Textarea, ThemeIcon, Title } from "@mantine/core";
import { IconAlertCircle, IconCheck, IconMessageCircle } from "@tabler/icons-react";

import SupportPhotoAttachmentInput from "@/features/support/SupportPhotoAttachmentInput";
import SupportPhotoPreview from "@/features/support/SupportPhotoPreview";
import { formatDate } from "@/widgets/pages/shared/account/account.client";
import type { SupportThreadMessage } from "@/widgets/pages/shared/account/account.client";

type DashboardSupportCardProps = {
  supportMessages: SupportThreadMessage[];
  supportText: string;
  supportPhoto: File | null;
  isFetching: boolean;
  isSending: boolean;
  errorText: string | null;
  success: boolean;
  visibleCount: number;
  onRefresh: () => void;
  onSupportTextChange: (value: string) => void;
  onSupportPhotoChange: (file: File | null) => void;
  onShowMore: () => void;
  onSend: () => void;
};

export default function DashboardSupportCard({
  supportMessages,
  supportText,
  supportPhoto,
  isFetching,
  isSending,
  errorText,
  success,
  visibleCount,
  onRefresh,
  onSupportTextChange,
  onSupportPhotoChange,
  onShowMore,
  onSend,
}: DashboardSupportCardProps) {
  const visibleSupportMessages = supportMessages.slice(-visibleCount);
  const hasMoreSupportMessages = supportMessages.length > visibleCount;

  return (
    <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Group gap="md" align="flex-start">
            <ThemeIcon color="brandCyan" variant="light" size={44} radius="md">
              <IconMessageCircle size={22} />
            </ThemeIcon>
            <Stack gap={4}>
              <Title order={3}>Поддержка</Title>
              <Text c="dimmed">Здесь видна вся история переписки. Если Telegram привязан, ответы поддержки также придут туда.</Text>
            </Stack>
          </Group>
          <Button variant="light" onClick={onRefresh} loading={isFetching}>
            Обновить
          </Button>
        </Group>

        {errorText ? (
          <Alert color="brandOrange" variant="light" icon={<IconAlertCircle size={18} />}>
            {errorText}
          </Alert>
        ) : null}

        {supportMessages.length ? (
          <Stack gap="sm">
            {hasMoreSupportMessages ? (
              <Button variant="light" onClick={onShowMore} w="fit-content">
                Показать более ранние сообщения
              </Button>
            ) : null}
            {visibleSupportMessages.map((message) => (
              <Card key={message.id} p="md" bg={message.authorType === "ADMIN" ? "dark.7" : "dark.9"} bd="1px solid var(--mantine-color-dark-6)">
                <Stack gap={6}>
                  <Group justify="space-between" gap="sm">
                    <Badge color={message.authorType === "ADMIN" ? "brandOrange" : "brandCyan"} variant="light">
                      {message.authorType === "ADMIN" ? "Поддержка" : "Вы"}
                    </Badge>
                    <Text c="dimmed" size="xs">
                      {formatDate(message.createdAt)}
                    </Text>
                  </Group>
                  {message.contentKind === "PHOTO" ? (
                    <Stack gap={2}>
                      <SupportPhotoPreview messageId={message.id} scope="user" alt="Изображение из обращения в поддержку" />
                      {message.text ? <Text c="dimmed" size="sm" style={{ whiteSpace: "pre-wrap" }}>{message.text}</Text> : null}
                    </Stack>
                  ) : (
                    <Text style={{ whiteSpace: "pre-wrap" }}>{message.text}</Text>
                  )}
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <Alert color="brandCyan" variant="light" icon={<IconMessageCircle size={18} />}>
            Обращений пока нет. Напишите сообщение ниже, и оно сразу появится в админке.
          </Alert>
        )}

        {success ? (
          <Alert color="brandCyan" variant="light" icon={<IconCheck size={18} />}>
            Сообщение отправлено. Ответ появится здесь и, если Telegram привязан, придет в бота.
          </Alert>
        ) : null}

        <Textarea
          label={supportPhoto ? "Подпись к изображению" : "Новое сообщение"}
          placeholder={supportPhoto ? "Необязательная подпись" : "Опишите проблему как можно подробнее"}
          value={supportText}
          minRows={4}
          autosize
          onChange={(event) => onSupportTextChange(event.currentTarget.value)}
        />
        <SupportPhotoAttachmentInput file={supportPhoto} disabled={isSending} onChange={onSupportPhotoChange} />
        <Button leftSection={<IconMessageCircle size={18} />} loading={isSending} disabled={!supportText.trim() && !supportPhoto} onClick={onSend} w="fit-content">
          Отправить в поддержку
        </Button>
      </Stack>
    </Card>
  );
}
