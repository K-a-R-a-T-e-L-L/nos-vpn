import { Badge, Button, Card, Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconCheck, IconRocket, IconShieldCheck, IconSparkles, IconStar } from "@tabler/icons-react";

import type { MarketingPlan } from "./plan.types";

const planIcons = [IconStar, IconSparkles, IconShieldCheck];
const planColors = ["brandCyan", "brandOrange", "brandMagenta"] as const;

export default function MarketingPlanCard({
  plan,
  index,
  href,
  cta,
}: {
  plan: MarketingPlan;
  index: number;
  href: string;
  cta: string;
}) {
  const Icon = planIcons[index] ?? IconRocket;
  const color = planColors[index] ?? "brandOrange";

  return (
    <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)" h="100%">
      <Stack gap="lg" h="100%">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <ThemeIcon color={color} variant="light" size={50} radius="md">
            <Icon size={24} />
          </ThemeIcon>
          {plan.popular ? (
            <Badge color="brandOrange" variant="light">
              Популярный
            </Badge>
          ) : null}
        </Group>

        <Stack gap={4}>
          <Title order={3}>{plan.title}</Title>
          <Text c="dimmed">{plan.devicesLabel}</Text>
          <Text c="dimmed">{plan.periodDays} дней</Text>
        </Stack>

        <Title order={2}>{plan.priceRub} ₽</Title>

        <Stack gap="xs" style={{ flex: 1 }}>
          {plan.bullets.map((bullet) => (
            <Group key={bullet} gap="xs" wrap="nowrap" align="flex-start">
              <IconCheck size={16} />
              <Text size="sm">{bullet}</Text>
            </Group>
          ))}
        </Stack>

        <Button component="a" href={href} color={color} fullWidth>
          {cta}
        </Button>
      </Stack>
    </Card>
  );
}
