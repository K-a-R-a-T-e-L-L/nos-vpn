import type { ComponentType } from "react";

import { Card, Stack, Text, ThemeIcon, Title } from "@mantine/core";

type AdminMetricCardProps = {
  title: string;
  value: string | number;
  hint: string;
  icon: ComponentType<{ size?: number }>;
};

export default function AdminMetricCard({ title, value, hint, icon: Icon }: AdminMetricCardProps) {
  return (
    <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="xs">
        <ThemeIcon color="brandOrange" variant="light" size={44} radius="md">
          <Icon size={22} />
        </ThemeIcon>
        <Title order={3}>{value}</Title>
        <Text fw={700}>{title}</Text>
        <Text c="dimmed" size="sm">
          {hint}
        </Text>
      </Stack>
    </Card>
  );
}
