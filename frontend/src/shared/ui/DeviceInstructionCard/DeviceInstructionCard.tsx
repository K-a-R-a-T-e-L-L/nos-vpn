import { Card, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import type { TablerIcon } from "@tabler/icons-react";

type DeviceInstructionCardProps = {
  title: string;
  text: string;
  icon: TablerIcon;
};

export default function DeviceInstructionCard({ title, text, icon: Icon }: DeviceInstructionCardProps) {
  return (
    <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="md">
        <ThemeIcon color="brandCyan" variant="light" size={46} radius="md">
          <Icon size={24} />
        </ThemeIcon>
        <Stack gap={4}>
          <Title order={4}>{title}</Title>
          <Text c="dimmed" size="sm">
            {text}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}
