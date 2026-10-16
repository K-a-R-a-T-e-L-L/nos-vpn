import { Badge, Button, Card, Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconLogout, IconUserCircle } from "@tabler/icons-react";

type DashboardHeaderCardProps = {
  accountName: string;
  isLogoutPending: boolean;
  onLogout: () => void;
};

export default function DashboardHeaderCard({ accountName, isLogoutPending, onLogout }: DashboardHeaderCardProps) {
  return (
    <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Group justify="space-between" align="flex-start" gap="lg">
        <Group gap="md" align="flex-start">
          <ThemeIcon color="brandOrange" variant="light" size={56} radius="md">
            <IconUserCircle size={30} />
          </ThemeIcon>
          <Stack gap={4}>
            <Badge color="brandOrange" variant="light" w="fit-content">
              Кабинет
            </Badge>
            <Title order={1}>Профиль NOS VPN</Title>
            <Text c="dimmed">{accountName}</Text>
          </Stack>
        </Group>
        <Button variant="light" color="brandOrange" leftSection={<IconLogout size={18} />} onClick={onLogout} loading={isLogoutPending}>
          Выйти
        </Button>
      </Group>
    </Card>
  );
}
