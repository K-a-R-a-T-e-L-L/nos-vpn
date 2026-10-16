import { Badge, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  text?: string;
  action?: ReactNode;
};

export default function SectionHeader({ eyebrow, title, description, text, action }: SectionHeaderProps) {
  const body = description ?? text;

  return (
    <Stack gap="sm" maw={760}>
      {eyebrow ? (
        <Badge color="brandCyan" variant="light" w="fit-content">
          {eyebrow}
        </Badge>
      ) : null}
      <Title order={2}>{title}</Title>
      {body ? (
        <Text c="dimmed" size="lg">
          {body}
        </Text>
      ) : null}
      {action}
    </Stack>
  );
}
