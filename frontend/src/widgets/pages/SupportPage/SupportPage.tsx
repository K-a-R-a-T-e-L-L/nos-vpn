import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconBrandTelegram, IconChecklist, IconCreditCard, IconPhoto } from "@tabler/icons-react";

import { TELEGRAM_SUPPORT_BOT_URL, TELEGRAM_SUPPORT_USERNAME } from "@/shared/lib/links/support";
import { PageSection } from "@/shared/ui/PageSection/PageSection";

const supportCards = [
  {
    title: "Опишите проблему подробно",
    text: "Напишите, что вы пытались сделать, на каком шаге возникла ошибка и что уже пробовали.",
    icon: IconChecklist,
  },
  {
    title: "Приложите скриншоты",
    text: "Скриншоты ускоряют разбор проблемы, особенно если не открывается ссылка, клиент или статус подписки.",
    icon: IconPhoto,
  },
  {
    title: "По оплате добавьте чек",
    text: "Если вопрос связан с платежом, приложите сумму, дату и чек или скриншот успешной оплаты.",
    icon: IconCreditCard,
  },
] as const;

export default function SupportPage() {
  return (
    <PageSection>
      <Stack gap="xl">
        <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          <Stack gap="lg">
            <Badge color="brandCyan" variant="light" w="fit-content">
              Поддержка
            </Badge>
            <Stack gap="xs">
              <Title order={1}>Как обратиться в поддержку</Title>
              <Text c="dimmed" size="lg">
                Чем подробнее описание проблемы, тем быстрее получится помочь. Если вопрос связан с оплатой или доступом, сразу приложите скриншоты и детали.
              </Text>
            </Stack>
            <Group>
              <Button component="a" href={TELEGRAM_SUPPORT_BOT_URL} target="_blank" rel="noreferrer" leftSection={<IconBrandTelegram size={18} />}>
                Написать в Telegram
              </Button>
            </Group>
          </Stack>
        </Card>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          {supportCards.map((item) => (
            <Card key={item.title} p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
              <Stack gap="md">
                <ThemeIcon color="brandOrange" variant="light" size={48} radius="md">
                  <item.icon size={24} />
                </ThemeIcon>
                <Title order={3}>{item.title}</Title>
                <Text c="dimmed">{item.text}</Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>

        <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          <Stack gap="md">
            <Title order={3}>Куда писать</Title>
            <Text c="dimmed">
              Временно основной канал поддержки на сайте: {TELEGRAM_SUPPORT_USERNAME}. Напишите туда напрямую в Telegram и опишите проблему как можно подробнее.
            </Text>
          </Stack>
        </Card>
      </Stack>
    </PageSection>
  );
}
