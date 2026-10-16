"use client";

import { Badge, Button, Card, Group, Loader, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { IconCreditCard, IconLogin2, IconRocket, IconStar, IconTicket } from "@tabler/icons-react";

import { planControllerGet } from "@/shared/api/.generated/clients/plansController/planControllerGet";
import { PageSection } from "@/shared/ui/PageSection/PageSection";

export function usePlansQuery() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: () => planControllerGet({ limit: 60, sortBy: ["id:ASC"] }),
  });
}

export function PageLoader() {
  return (
    <PageSection>
      <Group justify="center" py="xl">
        <Loader color="brandOrange" />
      </Group>
    </PageSection>
  );
}

export function AuthRequired({ text = "Войдите в аккаунт, чтобы продолжить." }: { text?: string }) {
  return (
    <PageSection>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          <Stack gap="md">
            <Badge color="brandCyan" variant="light" w="fit-content">
              Личный кабинет
            </Badge>
            <ThemeIcon color="brandOrange" variant="light" size={52} radius="md">
              <IconLogin2 size={26} />
            </ThemeIcon>
            <Title order={2}>Нужен вход</Title>
            <Text c="dimmed">{text}</Text>
            <Group>
              <Button component="a" href="/login" leftSection={<IconLogin2 size={18} />}>
                Войти
              </Button>
              <Button component="a" href="/tariffs" variant="light" leftSection={<IconStar size={18} />}>
                К тарифам
              </Button>
            </Group>
          </Stack>
        </Card>

        <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          <Stack gap="md">
            <Title order={3}>После входа будет доступно</Title>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
                <Stack gap="xs">
                  <ThemeIcon color="brandCyan" variant="light" size={40} radius="md">
                    <IconRocket size={20} />
                  </ThemeIcon>
                  <Text fw={700}>Ссылка доступа</Text>
                  <Text c="dimmed" size="sm">
                    Открывайте персональную ссылку и QR-код прямо в кабинете.
                  </Text>
                </Stack>
              </Card>
              <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
                <Stack gap="xs">
                  <ThemeIcon color="brandOrange" variant="light" size={40} radius="md">
                    <IconCreditCard size={20} />
                  </ThemeIcon>
                  <Text fw={700}>Оплата и продление</Text>
                  <Text c="dimmed" size="sm">
                    Подписка, платежи и продление будут привязаны к вашему аккаунту.
                  </Text>
                </Stack>
              </Card>
              <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
                <Stack gap="xs">
                  <ThemeIcon color="brandMagenta" variant="light" size={40} radius="md">
                    <IconTicket size={20} />
                  </ThemeIcon>
                  <Text fw={700}>Промокоды и бонусы</Text>
                  <Text c="dimmed" size="sm">
                    Применяйте промокоды и используйте бонусные рубли в кошельке.
                  </Text>
                </Stack>
              </Card>
            </SimpleGrid>
          </Stack>
        </Card>
      </SimpleGrid>
    </PageSection>
  );
}

type EmptyAccessStateProps = {
  title?: string;
  description?: string;
  buttonLabel?: string;
};

export function EmptyAccessState({
  title = "Ссылка доступа появится после оплаты",
  description = "Сейчас активная ссылка доступа не найдена. Выберите тариф, оплатите подписку, и ссылка появится прямо в этом блоке.",
  buttonLabel = "Выбрать тариф",
}: EmptyAccessStateProps) {
  return (
    <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="md">
        <Group>
          <ThemeIcon color="brandCyan" variant="light" size={44} radius="md">
            <IconRocket size={22} />
          </ThemeIcon>
          <Title order={3}>{title}</Title>
        </Group>
        <Text c="dimmed">{description}</Text>
        <Button component="a" href="/tariffs" leftSection={<IconStar size={18} />} w="fit-content">
          {buttonLabel}
        </Button>
      </Stack>
    </Card>
  );
}
