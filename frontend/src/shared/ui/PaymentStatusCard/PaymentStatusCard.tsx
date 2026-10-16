import {
  Button,
  Card,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import type { TablerIcon } from "@tabler/icons-react";

type PaymentStatusCardProps = {
  title: string;
  text: string;
  icon: TablerIcon;
  color: "brandCyan" | "brandOrange" | "brandMagenta";
  primaryAction: string;
  primaryHref?: string;
  secondaryAction?: string;
  secondaryHref?: string;
};

export default function PaymentStatusCard({
  title,
  text,
  icon: Icon,
  color,
  primaryAction,
  primaryHref = "/dashboard",
  secondaryAction,
  secondaryHref = "/dashboard",
}: PaymentStatusCardProps) {
  return (
    <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="xl" align="center" ta="center">
        <ThemeIcon color={color} variant="light" size={96} radius="xl">
          <Icon size={46} />
        </ThemeIcon>
        <Stack gap="xs">
          <Title order={1}>{title}</Title>
          <Text c="dimmed" size="lg" maw={560}>
            {text}
          </Text>
        </Stack>
        <SimpleGrid
          cols={{ base: 1, xs: secondaryAction ? 2 : 1 }}
          spacing="sm"
          w="100%"
          maw={560}
        >
          <Button component="a" href={primaryHref} color={color} size="lg">
            {primaryAction}
          </Button>
          {secondaryAction ? (
            <Button
              component="a"
              href={secondaryHref}
              variant="light"
              size="lg"
            >
              {secondaryAction}
            </Button>
          ) : null}
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
