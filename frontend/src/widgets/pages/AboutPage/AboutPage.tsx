import {
  Badge,
  Button,
  Card,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArrowRight,
  IconBrandTelegram,
  IconCoin,
  IconGift,
  IconLink,
  IconUsers,
} from "@tabler/icons-react";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

const items = [
  {
    title: "Пригласили друга",
    text: "Отправьте другу ссылку на сайт или на Telegram-бота. Если Telegram не работает, достаточно веб-ссылки.",
    icon: IconLink,
  },
  {
    title: "Друг оплатил тариф",
    text: "Сайт запоминает, кто пригласил пользователя. Отдельный промокод для рефералки не нужен.",
    icon: IconUsers,
  },
  {
    title: "Вы получили 50%",
    text: "После успешной оплаты друга вам начисляется 50% в кошелек. Эти деньги можно тратить на тарифы или выводить через поддержку.",
    icon: IconGift,
  },
] as const;

export default function AboutPage() {
  return (
    <PageSection>
      <Stack gap="xl">
        <Stack gap="xs">
          <Badge color="brandCyan" variant="light" w="fit-content">
            Партнерская программа
          </Badge>
          <Title order={1}>Заработать с NOS VPN</Title>
          <Text c="dimmed" size="lg">
            Механика простая: пригласили друга, он оплатил тариф, вам
            начислилось 50% в бонусный кошелек. Если у друга не работает
            Telegram, можно отправить ссылку прямо на сайт.
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          {items.map((item) => (
            <Card
              key={item.title}
              p="xl"
              bg="dark.8"
              bd="1px solid var(--mantine-color-dark-6)"
            >
              <Stack gap="md">
                <ThemeIcon
                  color="brandOrange"
                  variant="light"
                  size={48}
                  radius="md"
                >
                  <item.icon size={24} />
                </ThemeIcon>
                <Title order={3}>{item.title}</Title>
                <Text c="dimmed">{item.text}</Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>

        <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Stack gap="md">
              <ThemeIcon
                color="brandOrange"
                variant="light"
                size={48}
                radius="md"
              >
                <IconBrandTelegram size={24} />
              </ThemeIcon>
              <Title order={3}>Если Telegram у друга работает</Title>
              <Text c="dimmed">
                Можно отправить ссылку на бота. Друг откроет Telegram, выберет
                тариф и оплатит доступ.
              </Text>
            </Stack>

            <Stack gap="md">
              <ThemeIcon
                color="brandMagenta"
                variant="light"
                size={48}
                radius="md"
              >
                <IconCoin size={24} />
              </ThemeIcon>
              <Title order={3}>Если Telegram не открывается</Title>
              <Text c="dimmed">
                Отправьте ссылку на сайт. Сервис автоматически запомнит
                приглашение, и после оплаты бонус все равно будет начислен вам в
                кошелек.
              </Text>
            </Stack>
          </SimpleGrid>
        </Card>

        <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          <Stack gap="md">
            <Badge color="brandOrange" variant="light" w="fit-content">
              Как это работает на сайте
            </Badge>
            <Title order={3}>Рефералка привязывается автоматически</Title>
            <Text c="dimmed">
              Если человек перешел по вашей персональной ссылке на сайт, NOS VPN
              запомнит это приглашение. Когда пользователь зарегистрируется и
              оплатит тариф, бонус начислится автоматически.
            </Text>
            <Button
              component="a"
              href="/login"
              fullWidth
              rightSection={<IconArrowRight size={18} />}
            >
              Открыть кабинет и получить свою ссылку
            </Button>
          </Stack>
        </Card>
      </Stack>
    </PageSection>
  );
}
