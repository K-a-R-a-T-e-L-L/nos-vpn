"use client";

import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconClock, IconCreditCard, IconLifebuoy, IconReceipt2 } from "@tabler/icons-react";

import { useAuthSession } from "@/shared/lib/auth/AuthSessionProvider";
import { PageSection } from "@/shared/ui/PageSection/PageSection";
import { AuthRequired, PageLoader } from "@/widgets/pages/shared/account/account.client";

export default function PaymentsPageClient() {
  const { isAuthenticated, isReady } = useAuthSession();

  if (!isReady) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <AuthRequired text="Войдите, чтобы посмотреть историю оплат." />;
  }

  return (
    <PageSection>
      <Stack gap="lg">
        <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          <Stack gap="md">
            <Badge color="brandCyan" variant="light" w="fit-content">
              Платежи
            </Badge>
            <ThemeIcon color="brandOrange" variant="light" size={52} radius="md">
              <IconCreditCard size={26} />
            </ThemeIcon>
            <Title order={1}>История оплат скоро появится</Title>
            <Text c="dimmed" maw={720}>
              Раздел уже подготовлен под отображение последних платежей, промокодов и статусов продления. Пока проверяйте доступ, срок действия и активную ссылку в кабинете.
            </Text>
            <Group>
              <Button component="a" href="/dashboard">
                Открыть кабинет
              </Button>
              <Button component="a" href="/support" variant="light">
                Написать в поддержку
              </Button>
            </Group>
          </Stack>
        </Card>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
            <Stack gap="sm">
              <ThemeIcon color="brandCyan" variant="light" size={44} radius="md">
                <IconReceipt2 size={22} />
              </ThemeIcon>
              <Text fw={700}>Последние оплаты</Text>
              <Text c="dimmed" size="sm">
                Здесь будут видны подтвержденные платежи и примененные промокоды.
              </Text>
            </Stack>
          </Card>
          <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
            <Stack gap="sm">
              <ThemeIcon color="brandOrange" variant="light" size={44} radius="md">
                <IconClock size={22} />
              </ThemeIcon>
              <Text fw={700}>Продления</Text>
              <Text c="dimmed" size="sm">
                После оплаты срок действия подписки обновляется в кабинете автоматически.
              </Text>
            </Stack>
          </Card>
          <Card p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
            <Stack gap="sm">
              <ThemeIcon color="brandMagenta" variant="light" size={44} radius="md">
                <IconLifebuoy size={22} />
              </ThemeIcon>
              <Text fw={700}>Спорные ситуации</Text>
              <Text c="dimmed" size="sm">
                Если платеж прошел, а доступ не обновился, приложите чек и описание проблемы в поддержку.
              </Text>
            </Stack>
          </Card>
        </SimpleGrid>
      </Stack>
    </PageSection>
  );
}
