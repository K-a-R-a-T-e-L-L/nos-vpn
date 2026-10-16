import {
  Alert,
  Button,
  Card,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconCheck,
  IconStar,
  IconUserCircle,
  IconUsers,
} from "@tabler/icons-react";

type CheckoutSuccessCardProps = {
  promoCode?: string;
  planTitle: string;
};

export default function CheckoutSuccessCard({
  promoCode,
  planTitle,
}: CheckoutSuccessCardProps) {
  return (
    <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="lg">
        <ThemeIcon color="brandCyan" variant="light" size={56} radius="md">
          <IconCheck size={28} />
        </ThemeIcon>
        <Stack gap={6}>
          <Title order={1}>Тариф активирован</Title>
          <Text c="dimmed">
            Промокод {promoCode} применён. Подписка {planTitle} активирована без
            перехода на оплату.
          </Text>
        </Stack>
        <Alert color="brandCyan" variant="light" icon={<IconCheck size={18} />}>
          Ссылка доступа и QR-код появятся в кабинете. Если они ещё обновляются,
          откройте кабинет через несколько секунд.
        </Alert>
        <Alert
          color="brandOrange"
          variant="light"
          icon={<IconUsers size={18} />}
        >
          Теперь вы тоже можете приглашать друзей и получать 50% с каждой их
          оплаты в кошелёк. Несколько активных приглашений способны полностью
          окупить ваш тариф.
        </Alert>
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
          <Button
            component="a"
            href="/dashboard"
            leftSection={<IconUserCircle size={18} />}
          >
            Открыть кабинет
          </Button>
          <Button
            component="a"
            href="/tariffs"
            variant="light"
            leftSection={<IconStar size={18} />}
          >
            К тарифам
          </Button>
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
