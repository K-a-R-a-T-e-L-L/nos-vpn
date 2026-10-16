import { Alert, Button, Card, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconAlertCircle, IconCheck, IconUserPlus } from "@tabler/icons-react";

type DashboardEmailCardProps = {
  isVisible: boolean;
  email: string;
  password: string;
  temporaryLogin: string | null;
  isTemporary: boolean;
  success: boolean;
  errorText: string | null;
  isPending: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
};

export default function DashboardEmailCard({
  isVisible,
  email,
  password,
  temporaryLogin,
  isTemporary,
  success,
  errorText,
  isPending,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: DashboardEmailCardProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="md">
        <Title order={3}>{isTemporary ? "Замените временный логин" : "Добавьте вход по email"}</Title>
        <Text c="dimmed">
          {isTemporary
            ? "Сейчас для сайта используется технический логин, который был создан вместе с Telegram-аккаунтом. Задайте свои email и пароль, чтобы убрать его полностью."
            : "Укажите почту и пароль, чтобы входить в этот же аккаунт без Telegram. Подписка и кошелек останутся в этом же аккаунте."}
        </Text>

        {temporaryLogin ? (
          <Alert color="brandOrange" variant="light" icon={<IconAlertCircle size={18} />}>
            Текущий временный логин: <strong>{temporaryLogin}</strong>
          </Alert>
        ) : null}

        {success ? (
          <Alert color="brandCyan" variant="light" icon={<IconCheck size={18} />}>
            {isTemporary ? "Временный логин удален. Теперь аккаунт использует ваши данные." : "Email и пароль добавлены к аккаунту."}
          </Alert>
        ) : null}

        {errorText ? (
          <Alert color="brandOrange" variant="light" icon={<IconAlertCircle size={18} />}>
            {errorText}
          </Alert>
        ) : null}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label="Email"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => onEmailChange(event.currentTarget.value)}
            type="email"
            required
          />
          <PasswordInput
            label="Пароль"
            value={password}
            onChange={(event) => onPasswordChange(event.currentTarget.value)}
            required
          />
        </SimpleGrid>

        <Button onClick={onSubmit} loading={isPending} leftSection={<IconUserPlus size={18} />} w="fit-content">
          {isTemporary ? "Сохранить мои данные" : "Добавить email и пароль"}
        </Button>
      </Stack>
    </Card>
  );
}
