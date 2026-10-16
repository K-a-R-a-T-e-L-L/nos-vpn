import {
  Alert,
  Button,
  Card,
  Divider,
  PasswordInput,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconLogin2, IconUserPlus } from "@tabler/icons-react";
import styles from "../LoginPage.module.css";

type LoginAuthCardProps = {
  mode: "login" | "register";
  email: string;
  password: string;
  error: string | null;
  isPending: boolean;
  onModeChange: (mode: "login" | "register") => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
};

export default function LoginAuthCard({
  mode,
  email,
  password,
  error,
  isPending,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginAuthCardProps) {
  return (
    <Card
      p={{ base: "md", sm: "xl" }}
      bg="dark.8"
      bd="1px solid var(--mantine-color-brandOrange-7)"
    >
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={2}>
            {mode === "login" ? "Войти по email" : "Создать аккаунт"}
          </Title>
          <Text c="dimmed">
            {mode === "login"
              ? "Используйте email и пароль, чтобы открыть кабинет."
              : "Создайте аккаунт перед оплатой, чтобы подписка закрепилась за вами."}
          </Text>
        </Stack>

        <Tabs
          value={mode}
          onChange={(value) =>
            onModeChange(value === "register" ? "register" : "login")
          }
        >
          <Tabs.List grow className={styles.authTabsList}>
            <Tabs.Tab
              className={styles.authTab}
              value="login"
              leftSection={<IconLogin2 size={16} />}
            >
              Вход
            </Tabs.Tab>
            <Tabs.Tab
              className={styles.authTab}
              value="register"
              leftSection={<IconUserPlus size={16} />}
            >
              Регистрация
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {error ? (
          <Alert
            className={styles.loginError}
            color="red"
            icon={<IconAlertCircle size={18} />}
          >
            {error}
          </Alert>
        ) : null}

        <Stack gap="md">
          <TextInput
            className={styles.fullControl}
            label="Email"
            placeholder="name@example.com"
            value={email}
            onChange={(event) => onEmailChange(event.currentTarget.value)}
            type="email"
            required
          />
          <PasswordInput
            className={styles.fullControl}
            label="Пароль"
            value={password}
            onChange={(event) => onPasswordChange(event.currentTarget.value)}
            required
          />
          <Button
            fullWidth
            onClick={onSubmit}
            loading={isPending}
            leftSection={
              mode === "login" ? (
                <IconLogin2 size={18} />
              ) : (
                <IconUserPlus size={18} />
              )
            }
            size="md"
          >
            {mode === "login" ? "Войти" : "Создать аккаунт"}
          </Button>
        </Stack>

        <Divider />

        <Text c="dimmed" size="sm">
          Оплата доступна только после входа. Так тариф, платеж и ссылка доступа
          не потеряются.
        </Text>
      </Stack>
    </Card>
  );
}
