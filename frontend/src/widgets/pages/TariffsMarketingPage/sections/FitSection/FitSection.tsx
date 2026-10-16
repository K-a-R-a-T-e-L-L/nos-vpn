import type { ComponentType } from "react";

import { Card, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";

type FitCard = {
  title: string;
  text: string;
  icon: ComponentType<{ size?: number }>;
  color: string;
};

type FitSectionProps = {
  items: readonly FitCard[];
};

export default function FitSection({ items }: FitSectionProps) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
      {items.map((item) => (
        <Card key={item.title} p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          <Stack gap="md">
            <ThemeIcon color={item.color} variant="light" size={48} radius="md">
              <item.icon size={24} />
            </ThemeIcon>
            <Title order={3}>{item.title}</Title>
            <Text c="dimmed">{item.text}</Text>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}
