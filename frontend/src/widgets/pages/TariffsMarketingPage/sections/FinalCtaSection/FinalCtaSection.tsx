import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { IconCreditCard, IconLink } from "@tabler/icons-react";

type FinalCtaSectionProps = {
  primaryHref: string;
};

export default function FinalCtaSection({ primaryHref }: FinalCtaSectionProps) {
  return (
    <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Group justify="space-between" align="center" gap="lg">
        <Stack gap={4}>
          <Title order={3}>Не хотите ждать?</Title>
          <Text c="dimmed">Выберите тариф, оплатите доступ и получите персональную ссылку для подключения прямо в кабинете.</Text>
        </Stack>
        <Group>
          <Button component="a" href={primaryHref}>
            Оформить тариф
          </Button>
          <Button component="a" href="/setup" variant="light" leftSection={<IconLink size={18} />}>
            Инструкции
          </Button>
          <Button component="a" href="/login" variant="light" leftSection={<IconCreditCard size={18} />}>
            Войти в кабинет
          </Button>
        </Group>
      </Group>
    </Card>
  );
}
