import { Card, Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconChevronRight, type TablerIcon } from "@tabler/icons-react";

type DashboardCardProps = {
  title: string;
  text: string;
  icon: TablerIcon;
  color?: "brandCyan" | "brandOrange" | "brandMagenta" | "brandBlue";
};

export default function DashboardCard({ title, text, icon: Icon, color = "brandOrange" }: DashboardCardProps) {
  return (
    <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Group justify="space-between" wrap="nowrap">
        <Group wrap="nowrap">
          <ThemeIcon color={color} variant="light" size={44} radius="md">
            <Icon size={22} />
          </ThemeIcon>
          <Stack gap={2}>
            <Title order={4}>{title}</Title>
            <Text c="dimmed" size="sm">
              {text}
            </Text>
          </Stack>
        </Group>
        <IconChevronRight size={20} />
      </Group>
    </Card>
  );
}
