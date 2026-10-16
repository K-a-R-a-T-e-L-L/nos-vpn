import {
  Alert,
  Button,
  Card,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconLink } from "@tabler/icons-react";

type DashboardTelegramCardProps = {
  isVisible: boolean;
  isPending: boolean;
  isCodePending: boolean;
  code: string;
  errorText: string | null;
  onCodeChange: (value: string) => void;
  onSubmitCode: () => void;
  onCreateLink: () => void;
};

export default function DashboardTelegramCard({
  isVisible,
  isPending,
  isCodePending,
  code,
  errorText,
  onCodeChange,
  onSubmitCode,
  onCreateLink,
}: DashboardTelegramCardProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={3}>Привяжите Telegram</Title>
          <Text c="dimmed">
            Выберите удобный способ: сразу перейти по ссылке из кабинета или
            вставить код, который вы получили в Telegram-боте.
          </Text>
        </Stack>

        {errorText ? (
          <Alert
            color="brandOrange"
            variant="light"
            icon={<IconAlertCircle size={18} />}
          >
            {errorText}
          </Alert>
        ) : null}

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
            <Stack gap="sm">
              <Title order={5}>Перейти по ссылке</Title>
              <Text c="dimmed" size="sm">
                Откройте бота по одноразовой ссылке и подтвердите привязку прямо
                в Telegram.
              </Text>
              <Button
                onClick={onCreateLink}
                loading={isPending}
                leftSection={<IconLink size={18} />}
                fullWidth
              >
                Открыть Telegram для привязки
              </Button>
            </Stack>
          </Card>

          <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
            <Stack gap="sm">
              <Title order={5}>Вставить код из бота</Title>
              <Text c="dimmed" size="sm">
                Если бот уже открыт, получите код привязки и вставьте его сюда.
              </Text>
              <SimpleGrid
                cols={{ base: 1, xs: 2 }}
                spacing="sm"
                verticalSpacing="sm"
              >
                <TextInput
                  label="Код из бота"
                  placeholder="Например, 7F3A9C1D"
                  value={code}
                  onChange={(event) => onCodeChange(event.currentTarget.value)}
                  styles={{ root: { flex: 1 } }}
                />
                <Button
                  onClick={onSubmitCode}
                  loading={isCodePending}
                  variant="light"
                >
                  Подтвердить код
                </Button>
              </SimpleGrid>
            </Stack>
          </Card>
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
