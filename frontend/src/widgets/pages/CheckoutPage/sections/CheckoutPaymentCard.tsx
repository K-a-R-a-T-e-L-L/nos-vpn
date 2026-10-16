import {
  Alert,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconCreditCard,
  IconDiscount2,
  IconUsers,
} from "@tabler/icons-react";

import type { PromoPreview } from "@/widgets/pages/shared/account/account.client";

import type { CheckoutMethod } from "../checkout-methods";
import CheckoutLegalNotice from "./CheckoutLegalNotice";

export const RECURRENT_PAYMENT_NOTICE =
  "При оплате через СБП подключается автоматическое продление подписки посредством рекуррентных платежей.";

type CheckoutPaymentCardProps = {
  planTitle: string;
  planDescription: string;
  planAmount: number;
  durationDays: number;
  devicesLabel: string;
  checkoutAmount: number;
  promoCode: string;
  appliedPromo: PromoPreview | null;
  errorText: string | null;
  isValidatingPromo: boolean;
  isCheckoutPending: boolean;
  pendingMethod: CheckoutMethod | null;
  availableMethods: CheckoutMethod[];
  onPromoCodeChange: (value: string) => void;
  onValidatePromo: () => void;
  onCheckout: (method: CheckoutMethod) => void;
};

export default function CheckoutPaymentCard({
  planTitle,
  planDescription,
  planAmount,
  durationDays,
  devicesLabel,
  checkoutAmount,
  promoCode,
  appliedPromo,
  errorText,
  isValidatingPromo,
  isCheckoutPending,
  pendingMethod,
  availableMethods,
  onPromoCodeChange,
  onValidatePromo,
  onCheckout,
}: CheckoutPaymentCardProps) {
  const discountAmount = appliedPromo?.discountAmount ?? 0;
  const hasDiscount = Boolean(appliedPromo && discountAmount > 0);
  const hasExternalPayment = checkoutAmount > 0;

  return (
    <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="lg">
        <ThemeIcon color="brandOrange" variant="light" size={52} radius="md">
          <IconCreditCard size={26} />
        </ThemeIcon>

        <Stack gap={4}>
          <Title order={1}>Оплата тарифа {planTitle}</Title>
          <Text c="dimmed">{planDescription}</Text>
        </Stack>

        <Group justify="space-between">
          <Text c="dimmed">Стоимость</Text>
          <Title order={3}>{planAmount} ₽</Title>
        </Group>
        <Group justify="space-between">
          <Text c="dimmed">Срок</Text>
          <Text>{durationDays} дней</Text>
        </Group>
        <Group justify="space-between">
          <Text c="dimmed">Устройства</Text>
          <Text>{devicesLabel}</Text>
        </Group>
        <Group justify="space-between">
          <Text c="dimmed">К оплате</Text>
          <Group gap="xs">
            {hasDiscount ? (
              <Text c="dimmed" td="line-through">
                {planAmount} ₽
              </Text>
            ) : null}
            <Title order={3}>{checkoutAmount} ₽</Title>
          </Group>
        </Group>

        <Alert color="brandCyan" variant="light" icon={<IconUsers size={18} />}>
          Приглашайте друзей и получайте 50% с каждой их оплаты в кошелёк. Пара
          активных друзей может заметно снизить стоимость вашей подписки.
        </Alert>

        <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-6)">
          <Stack gap="md">
            <SimpleGrid
              cols={{ base: 1, xs: 2 }}
              spacing="sm"
              verticalSpacing="sm"
            >
              <TextInput
                label="Промокод"
                placeholder="Введите промокод"
                value={promoCode}
                onChange={(event) =>
                  onPromoCodeChange(event.currentTarget.value)
                }
                leftSection={<IconDiscount2 size={18} />}
              />
              <Button
                variant="light"
                onClick={onValidatePromo}
                loading={isValidatingPromo}
                leftSection={<IconDiscount2 size={18} />}
              >
                Применить
              </Button>
            </SimpleGrid>
            {appliedPromo ? (
              <Alert
                color="brandCyan"
                variant="light"
                icon={<IconCheck size={18} />}
              >
                Промокод {appliedPromo.code} применён: скидка{" "}
                {appliedPromo.valuePercent}%, срок{" "}
                {appliedPromo.durationDays > 0
                  ? `${appliedPromo.durationDays} дней`
                  : "как у выбранного тарифа"}
                , устройств{" "}
                {appliedPromo.devicesLimit > 0
                  ? appliedPromo.devicesLimit
                  : "как у выбранного тарифа"}
                .
              </Alert>
            ) : null}
          </Stack>
        </Card>

        {hasExternalPayment && availableMethods.length > 0 ? (
          <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-6)">
            <Stack gap="sm">
              <Text fw={600}>Способ оплаты</Text>
              {availableMethods.includes("RECURRENT") ? (
                <Text c="dimmed" size="sm">
                  {RECURRENT_PAYMENT_NOTICE}
                </Text>
              ) : null}

              {availableMethods.includes("RECURRENT") ? (
                <Button
                  fullWidth
                  color="green"
                  onClick={() => onCheckout("RECURRENT")}
                  loading={isCheckoutPending && pendingMethod === "RECURRENT"}
                  disabled={isCheckoutPending}
                >
                  Оплатить через СБП
                </Button>
              ) : null}

              {availableMethods.includes("CRYPTO") ? (
                <Button
                  fullWidth
                  color="blue"
                  onClick={() => onCheckout("CRYPTO")}
                  loading={isCheckoutPending && pendingMethod === "CRYPTO"}
                  disabled={isCheckoutPending}
                >
                  Оплатить криптой
                </Button>
              ) : null}

              {availableMethods.includes("ONE_TIME") ? (
                <Button
                  fullWidth
                  variant="default"
                  onClick={() => onCheckout("ONE_TIME")}
                  loading={isCheckoutPending && pendingMethod === "ONE_TIME"}
                  disabled={isCheckoutPending}
                >
                  Оплатить (без автосписаний)
                </Button>
              ) : null}
            </Stack>
          </Card>
        ) : null}

        {errorText ? (
          <Alert color="red" icon={<IconAlertCircle size={18} />}>
            {errorText}
          </Alert>
        ) : null}

        <CheckoutLegalNotice />

        {!hasExternalPayment ? (
          <Button
            onClick={() => onCheckout("ONE_TIME")}
            loading={isCheckoutPending}
            disabled={isCheckoutPending}
            leftSection={<IconCheck size={18} />}
          >
            Активировать тариф
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}
