import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";

import { TELEGRAM_SUPPORT_BOT_URL, TELEGRAM_SUPPORT_USERNAME } from "@/shared/lib/links/support";

export default function LegalSupportCard() {
  return (
    <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="md">
        <Title order={3}>Связаться с поддержкой</Title>
        <Text c="dimmed">
          Временно все обращения на сайте принимаются через личный Telegram контакт <Text span inherit fw={700}>{TELEGRAM_SUPPORT_USERNAME}</Text>.
        </Text>
        <Group>
          <Button component="a" href={TELEGRAM_SUPPORT_BOT_URL} target="_blank" rel="noreferrer">
            Открыть поддержку в Telegram
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
