import { Accordion, AccordionControl, AccordionItem, AccordionPanel, Badge, Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconCreditCard, IconHelp, IconLink, IconWallet } from "@tabler/icons-react";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

const faqGroups = [
  {
    title: "Оплата и доступ",
    icon: IconCreditCard,
    items: [
      {
        value: "account",
        question: "Почему перед оплатой нужно войти в аккаунт?",
        answer: "Так подписка, платеж и ссылка доступа всегда остаются привязаны к вашему кабинету.",
      },
      {
        value: "telegram-down",
        question: "Можно ли купить VPN, если Telegram не работает?",
        answer: "Да. Оформите тариф на сайте, оплатите его и получите ссылку доступа в личном кабинете.",
      },
      {
        value: "renew",
        question: "Как продлить подписку?",
        answer: "Откройте кабинет, выберите тариф и оплатите следующий период. Обновление применяется к вашему аккаунту.",
      },
    ],
  },
  {
    title: "Подключение",
    icon: IconLink,
    items: [
      {
        value: "link",
        question: "Где взять ссылку доступа?",
        answer: "Ссылка появляется в кабинете после оплаты. Там же доступен QR-код для быстрого импорта в приложение.",
      },
      {
        value: "devices",
        question: "На каких устройствах работает NOS VPN?",
        answer: "Вы можете подключить iPhone, Android, Windows и macOS. Для каждой платформы есть отдельная инструкция.",
      },
      {
        value: "telegram-bind",
        question: "Можно ли привязать Telegram после покупки на сайте?",
        answer: "Да. После привязки бот увидит тот же тариф, срок действия и статус доступа.",
      },
    ],
  },
  {
    title: "Бонусы и поддержка",
    icon: IconWallet,
    items: [
      {
        value: "wallet",
        question: "Что такое бонусные рубли?",
        answer: "Это ваш кошелек внутри сервиса. Его можно пополнять за счет рефералов, тратить на тарифы и выводить через поддержку.",
      },
      {
        value: "withdraw",
        question: "Можно ли вывести бонусные рубли?",
        answer: "Да. Когда накопится нужная сумма, обратитесь в поддержку для вывода на карту.",
      },
      {
        value: "support",
        question: "Что написать в поддержку?",
        answer: "Подробно опишите проблему, приложите скриншоты, а по вопросам оплаты добавьте чек или данные платежа.",
      },
    ],
  },
] as const;

export default function FaqPage() {
  return (
    <PageSection>
      <Stack gap="xl">
        <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Stack gap="lg">
              <Badge color="brandCyan" variant="light" w="fit-content">
                FAQ
              </Badge>
              <Stack gap="xs">
                <Title order={1}>Ответы на частые вопросы</Title>
                <Text c="dimmed" size="lg">
                  Здесь собраны базовые сценарии: покупка, продление, получение ссылки доступа, привязка Telegram и работа с бонусами.
                </Text>
              </Stack>
            </Stack>

            <Card p="lg" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
              <Stack gap="md">
                <ThemeIcon color="brandOrange" variant="light" size={48} radius="md">
                  <IconHelp size={24} />
                </ThemeIcon>
                <Title order={3}>Если вопроса нет в списке</Title>
                <Text c="dimmed">
                  Откройте поддержку и отправьте подробное описание проблемы со скриншотами. Это быстрее, чем длинная переписка в несколько этапов.
                </Text>
                <Button component="a" href="/support" w="fit-content">
                  Открыть поддержку
                </Button>
              </Stack>
            </Card>
          </SimpleGrid>
        </Card>

        <Stack gap="lg">
          {faqGroups.map((group) => (
            <Card key={group.title} p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
              <Stack gap="lg">
                <Group gap="sm">
                  <ThemeIcon color="brandMagenta" variant="light" size={44} radius="md">
                    <group.icon size={22} />
                  </ThemeIcon>
                  <Title order={3}>{group.title}</Title>
                </Group>
                <Accordion variant="separated">
                  {group.items.map((item) => (
                    <AccordionItem key={item.value} value={item.value}>
                      <AccordionControl>{item.question}</AccordionControl>
                      <AccordionPanel>{item.answer}</AccordionPanel>
                    </AccordionItem>
                  ))}
                </Accordion>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Stack>
    </PageSection>
  );
}
