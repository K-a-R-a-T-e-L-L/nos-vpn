import { Card, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconRefresh, IconShieldCheck, IconWallet } from "@tabler/icons-react";

type DashboardOverviewSectionProps = {
  subscriptionLabel: string;
  expiresAtTitle: string;
  expiresAtLabel: string;
  expiresAtCaption: string;
  walletBalance: number;
};

export default function DashboardOverviewSection({
  subscriptionLabel,
  expiresAtTitle,
  expiresAtLabel,
  expiresAtCaption,
  walletBalance,
}: DashboardOverviewSectionProps) {
  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
      <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
        <Stack gap="xs">
          <ThemeIcon color="brandCyan" variant="light" size={44} radius="md">
            <IconShieldCheck size={22} />
          </ThemeIcon>
          <Title order={3}>Подписка</Title>
          <Text c="dimmed">{subscriptionLabel}</Text>
        </Stack>
      </Card>

      <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
        <Stack gap="xs">
          <ThemeIcon color="brandOrange" variant="light" size={44} radius="md">
            <IconRefresh size={22} />
          </ThemeIcon>
          <Title order={3}>{expiresAtTitle}</Title>
          <Text>{expiresAtLabel}</Text>
          <Text c="dimmed" size="sm">{expiresAtCaption}</Text>
        </Stack>
      </Card>

      <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
        <Stack gap="xs">
          <ThemeIcon color="brandMagenta" variant="light" size={44} radius="md">
            <IconWallet size={22} />
          </ThemeIcon>
          <Title order={3}>Кошелек</Title>
          <Text c="dimmed">{walletBalance} ₽ в бонусном кошельке. Эти средства можно потратить на тариф или вывести через поддержку.</Text>
        </Stack>
      </Card>
    </SimpleGrid>
  );
}
