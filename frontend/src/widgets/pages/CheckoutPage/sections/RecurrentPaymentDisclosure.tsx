import { Anchor, Card, Checkbox, Stack, Text, Title } from "@mantine/core";

import { LEGAL_ROUTES } from "@/shared/config/legal";

import { buildRecurrentDisclosure } from "../recurrent-disclosure";

type RecurrentPaymentDisclosureProps = {
  amountRub: number;
  intervalLabel: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

/** Prepared for a future recurrent checkout. It is intentionally not wired into today's payment flow. */
export default function RecurrentPaymentDisclosure({
  amountRub,
  intervalLabel,
  checked,
  onCheckedChange,
}: RecurrentPaymentDisclosureProps) {
  const disclosure = buildRecurrentDisclosure({ amountRub, intervalLabel });

  return (
    <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="xs">
        <Title order={3}>{disclosure.title}</Title>
        <Text c="dimmed" size="sm">
          {disclosure.chargeText}
        </Text>
        <Text c="dimmed" size="sm">
          {disclosure.cancellationText}
        </Text>
        <Text c="dimmed" size="sm">
          Подробности: <Anchor href={LEGAL_ROUTES.terms}>условия</Anchor>,{" "}
          <Anchor href={LEGAL_ROUTES.privacy}>конфиденциальность</Anchor>,{" "}
          <Anchor href={LEGAL_ROUTES.refund}>возвраты</Anchor>.
        </Text>
        <Checkbox
          checked={checked}
          onChange={(event) => onCheckedChange(event.currentTarget.checked)}
          label={disclosure.consentLabel}
        />
      </Stack>
    </Card>
  );
}
