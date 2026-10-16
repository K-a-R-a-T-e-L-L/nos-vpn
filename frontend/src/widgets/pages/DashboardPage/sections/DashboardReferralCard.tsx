import {
  Badge,
  Card,
  CopyButton,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCheck,
  IconCoin,
  IconCopy,
  IconGift,
  IconUsers,
} from "@tabler/icons-react";

type DashboardReferralCardProps = {
  invitedCount: number;
  totalBonusRub: number;
  walletBalanceRub: number;
  websiteReferralLink: string;
  telegramReferralLink: string | null;
  shareText: string;
};

function CopyAction({
  value,
  idleLabel,
  copiedLabel,
}: {
  value: string;
  idleLabel: string;
  copiedLabel: string;
}) {
  return (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? copiedLabel : idleLabel}>
          <UnstyledButton
            onClick={copy}
            style={{ minHeight: 44, maxWidth: "100%" }}
          >
            <Group gap={8}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              <Text size="sm" fw={600}>
                {copied ? copiedLabel : idleLabel}
              </Text>
            </Group>
          </UnstyledButton>
        </Tooltip>
      )}
    </CopyButton>
  );
}

export default function DashboardReferralCard({
  invitedCount,
  totalBonusRub,
  walletBalanceRub,
  websiteReferralLink,
  telegramReferralLink,
  shareText,
}: DashboardReferralCardProps) {
  return (
    <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="lg">
        <Stack gap={4}>
          <Badge color="brandCyan" variant="light" w="fit-content">
            Реферальная программа
          </Badge>
          <Text size="xl" fw={800}>
            Приглашайте друзей и получайте 50% с каждой оплаты
          </Text>
          <Text c="dimmed">
            Двое активных друзей на вашем тарифе уже могут покрыть стоимость
            подписки. Всё, что сверху, остаётся в вашем кошельке: можно оплатить
            следующий период или запросить вывод через поддержку.
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
          <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
            <Stack gap={6}>
              <IconUsers size={20} />
              <Text fw={700}>Приглашено</Text>
              <Text c="dimmed">{invitedCount} пользователей</Text>
            </Stack>
          </Card>
          <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
            <Stack gap={6}>
              <IconCoin size={20} />
              <Text fw={700}>Всего начислено</Text>
              <Text c="dimmed">{totalBonusRub} ₽</Text>
            </Stack>
          </Card>
          <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
            <Stack gap={6}>
              <IconGift size={20} />
              <Text fw={700}>Сейчас в кошельке</Text>
              <Text c="dimmed">{walletBalanceRub} ₽</Text>
            </Stack>
          </Card>
        </SimpleGrid>

        <Card p="lg" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
          <Stack gap="sm">
            <Text fw={700}>Ссылка на сайт</Text>
            <Text c="dimmed" size="sm">
              Отправьте её, если у друга не открывается Telegram. Сайт сам
              запомнит, что пользователь пришёл от вас.
            </Text>
            <Text ff="monospace" style={{ wordBreak: "break-all" }}>
              {websiteReferralLink}
            </Text>
            <CopyAction
              value={websiteReferralLink}
              idleLabel="Скопировать ссылку"
              copiedLabel="Ссылка скопирована"
            />
          </Stack>
        </Card>

        {telegramReferralLink ? (
          <Card p="lg" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
            <Stack gap="sm">
              <Text fw={700}>Ссылка на Telegram-бота</Text>
              <Text c="dimmed" size="sm">
                Это прямая ссылка для друга, если у него Telegram работает и он
                хочет сразу открыть бота.
              </Text>
              <Text ff="monospace" style={{ wordBreak: "break-all" }}>
                {telegramReferralLink}
              </Text>
              <CopyAction
                value={telegramReferralLink}
                idleLabel="Скопировать ссылку"
                copiedLabel="Ссылка скопирована"
              />
            </Stack>
          </Card>
        ) : null}

        <Card p="lg" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
          <Stack gap="sm">
            <Text fw={700}>Готовый текст для отправки</Text>
            <Text c="dimmed" size="sm">
              Пользователю не придётся ничего объяснять вручную. Скопируйте
              текст целиком и отправьте другу.
            </Text>
            <Card p="md" bg="dark.8" bd="1px solid var(--mantine-color-dark-4)">
              <Text
                component="pre"
                ff="monospace"
                size="sm"
                style={{ whiteSpace: "pre-wrap", margin: 0 }}
              >
                {shareText}
              </Text>
            </Card>
            <CopyAction
              value={shareText}
              idleLabel="Скопировать текст"
              copiedLabel="Текст скопирован"
            />
          </Stack>
        </Card>
      </Stack>
    </Card>
  );
}
