import { Card, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import type { TablerIcon } from "@tabler/icons-react";

type FeatureCardProps = {
  title: string;
  text: string;
  icon: TablerIcon;
  color?: "brandCyan" | "brandOrange" | "brandMagenta" | "brandBlue";
};

export default function FeatureCard({ title, text, icon: Icon, color = "brandCyan" }: FeatureCardProps) {
  return (
    <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="md">
        <ThemeIcon color={color} variant="light" size={44} radius="md">
          <Icon size={22} />
        </ThemeIcon>
        <Stack gap={6}>
          <Title order={4}>{title}</Title>
          <Text c="dimmed" size="sm">
            {text}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}
