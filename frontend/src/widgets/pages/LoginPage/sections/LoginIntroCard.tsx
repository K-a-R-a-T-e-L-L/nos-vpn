import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconBrandTelegram,
  IconCreditCard,
  IconLink,
} from "@tabler/icons-react";
import styles from "../LoginPage.module.css";

type LoginIntroCardProps = {
  telegramWaiting: boolean;
  telegramError: string | null;
  isTelegramPending: boolean;
  onTelegramLogin: () => void;
  onCancelTelegramAuth: () => void;
};

export default function LoginIntroCard({
  telegramWaiting,
  telegramError,
  isTelegramPending,
  onTelegramLogin,
  onCancelTelegramAuth,
}: LoginIntroCardProps) {
  return (
    <Card
      p={{ base: "md", sm: "xl" }}
      bg="dark.8"
      bd="1px solid var(--mantine-color-dark-6)"
    >
      <Stack gap="xl" h="100%">
        <Stack gap="md">
          <Badge color="brandCyan" variant="light" w="fit-content">
            Личный кабинет
          </Badge>
          <Title order={1}>Вход в NOS VPN</Title>
          <Text c="dimmed" size="lg">
            Управляйте подпиской, оплатой и ссылкой доступа на сайте. Telegram
            можно подключить сразу или привязать позже.
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-6)">
            <Stack gap="xs">
              <ThemeIcon
                color="brandOrange"
                variant="light"
                size={42}
                radius="md"
              >
                <IconCreditCard size={21} />
              </ThemeIcon>
              <Text fw={700}>Оплата не потеряется</Text>
              <Text c="dimmed" size="sm">
                Подписка всегда привязана к аккаунту.
              </Text>
            </Stack>
          </Card>
          <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-6)">
            <Stack gap="xs">
              <ThemeIcon
                color="brandCyan"
                variant="light"
                size={42}
                radius="md"
              >
                <IconLink size={21} />
              </ThemeIcon>
              <Text fw={700}>Ссылка доступа в кабинете</Text>
              <Text c="dimmed" size="sm">
                Скопируйте ссылку после оплаты и подключите устройство.
              </Text>
            </Stack>
          </Card>
        </SimpleGrid>

        <Card
          p={{ base: "md", sm: "lg" }}
          bg="dark.7"
          bd="1px solid var(--mantine-color-dark-6)"
          mt="auto"
        >
          <Stack gap="sm">
            <Group
              className={styles.telegramIntro}
              gap="sm"
              wrap="nowrap"
              align="flex-start"
            >
              <ThemeIcon
                color="brandBlue"
                variant="light"
                size={44}
                radius="md"
              >
                <IconBrandTelegram size={22} />
              </ThemeIcon>
              <Stack gap={2}>
                <Text fw={800}>Вход через Telegram</Text>
                <Text c="dimmed" size="sm">
                  Нажмите кнопку, подтвердите вход в боте и вернитесь на сайт.
                  Кабинет откроется автоматически.
                </Text>
              </Stack>
            </Group>

            {telegramWaiting ? (
              <Alert
                color="brandCyan"
                variant="light"
                icon={<IconBrandTelegram size={18} />}
              >
                Ожидаем подтверждение в Telegram. После сообщения бота вернитесь
                на эту страницу.
              </Alert>
            ) : null}

            {telegramError ? (
              <Alert
                color="brandOrange"
                variant="light"
                icon={<IconAlertCircle size={18} />}
              >
                {telegramError}
              </Alert>
            ) : null}

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Button
                fullWidth
                onClick={onTelegramLogin}
                loading={isTelegramPending || telegramWaiting}
                leftSection={<IconBrandTelegram size={18} />}
              >
                {telegramWaiting
                  ? "Ждём подтверждение"
                  : "Войти через Telegram"}
              </Button>
              {telegramWaiting ? (
                <Button
                  fullWidth
                  variant="light"
                  onClick={onCancelTelegramAuth}
                >
                  Отменить
                </Button>
              ) : null}
            </SimpleGrid>
          </Stack>
        </Card>
      </Stack>
    </Card>
  );
}
