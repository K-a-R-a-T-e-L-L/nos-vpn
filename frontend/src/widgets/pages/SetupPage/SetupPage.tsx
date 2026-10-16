"use client";

import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArrowRight,
  IconCircleCheck,
  IconDownload,
  IconExternalLink,
  IconHelpCircle,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

import { setupIntroSteps, setupPlatforms } from "./setup.data";
import styles from "./SetupPage.module.css";

export default function SetupPage() {
  const [platformId, setPlatformId] =
    useState<(typeof setupPlatforms)[number]["id"]>("windows");
  const platform = useMemo(
    () =>
      setupPlatforms.find((item) => item.id === platformId) ??
      setupPlatforms[0],
    [platformId],
  );
  const [clientId, setClientId] = useState(platform.clients[0]?.id ?? "");

  const activeClient = useMemo(
    () =>
      platform.clients.find((item) => item.id === clientId) ??
      platform.clients[0],
    [platform.clients, clientId],
  );

  const PlatformIcon = platform.icon;
  const isAndroid = platform.id === "android";
  const isWindows = platform.id === "windows";
  const setupOverview = [
    {
      title: "Создайте аккаунт и оплатите тариф",
      text: "Сначала оформите подписку на сайте, чтобы сохранить доступ, QR-код и все устройства в одном кабинете.",
    },
    {
      title: "Откройте личный кабинет",
      text: "После оплаты в кабинете сразу появятся ссылка доступа, QR-код и базовый путь подключения.",
    },
    {
      title: "Выберите платформу и клиент",
      text: "Ниже выберите свою ОС и удобный клиент. Для каждого варианта уже подготовлены понятные шаги.",
    },
    {
      title: "Импортируйте доступ и включите VPN",
      text: "Скопируйте ссылку или импортируйте QR-код в выбранный клиент, затем проверьте подключение.",
    },
  ] as const;

  return (
    <PageSection>
      <Stack className={styles.page} gap="xl">
        <Stack className={styles.hero} gap="lg">
          <Badge className={styles.eyebrow}>Инструкции</Badge>
          <Title order={1} className={styles.heading}>
            Инструкции по подключению
          </Title>
          <Text className={styles.sub}>
            Выберите платформу, откройте подходящий клиент и скачайте нужную
            сборку по прямой ссылке. Ссылка доступа и QR-код уже лежат в личном
            кабинете сразу после оплаты.
          </Text>
        </Stack>

        <Card className={styles.overviewCard} radius="xl" p="xl">
          <Stack gap="lg">
            <Stack gap="xs">
              <Badge className={styles.processBadge}>Как подключиться</Badge>
              <Title order={2}>
                Сначала общая схема, потом шаги под ваше устройство
              </Title>
              <Text className={styles.overviewText}>
                Сначала посмотрите общий порядок подключения, чтобы сразу понять
                весь путь. Затем выберите свою ОС и клиент ниже и просто
                выполните точные шаги для своего устройства.
              </Text>
            </Stack>

            <div className={styles.overviewGrid}>
              {setupOverview.map((item, index) => (
                <Card
                  key={item.title}
                  className={styles.overviewStep}
                  radius="xl"
                  p="lg"
                >
                  <Stack gap="md" h="100%">
                    <ThemeIcon
                      color="brandCyan"
                      variant="light"
                      size={34}
                      radius="xl"
                    >
                      <Text fw={800} size="sm">
                        {index + 1}
                      </Text>
                    </ThemeIcon>
                    <Title order={4}>{item.title}</Title>
                    <Text size="sm" c="dimmed">
                      {item.text}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </div>
          </Stack>
        </Card>
        <Card className={styles.detailCard} radius="xl" p="xl">
          <Stack gap="xl">
            <div className={styles.topBar}>
              <Stack gap="xs">
                <Title order={2}>Установка</Title>
                <Text c="dimmed">{platform.summary}</Text>
              </Stack>

              <div className={styles.selectWrap}>
                <Select
                  value={platform.id}
                  onChange={(value) => {
                    const next = (value as typeof platformId) || "windows";
                    setPlatformId(next);
                    const nextPlatform =
                      setupPlatforms.find((item) => item.id === next) ??
                      setupPlatforms[0];
                    setClientId(nextPlatform.clients[0]?.id ?? "");
                  }}
                  data={setupPlatforms.map((item) => ({
                    value: item.id,
                    label: item.title,
                  }))}
                  leftSection={<PlatformIcon size={18} />}
                  radius="lg"
                  size="md"
                />
              </div>
            </div>

            <div
              className={`${styles.grid} ${isAndroid ? styles.androidGrid : ""} ${isWindows ? styles.windowsGrid : ""}`}
            >
              {platform.clients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className={`${styles.clientCard} ${client.id === activeClient.id ? styles.clientCardActive : ""}`}
                  onClick={() => setClientId(client.id)}
                >
                  {client.recommended ? (
                    <span className={styles.recommendedDot} />
                  ) : null}
                  <div className={styles.clientInner}>
                    <span className={styles.clientName}>{client.name}</span>
                  </div>
                </button>
              ))}
            </div>

            <Stack gap="lg">
              <div className={styles.detailTop}>
                <Stack gap="xs">
                  <Group gap="sm">
                    <ThemeIcon
                      color="brandBlue"
                      variant="light"
                      size={42}
                      radius="md"
                    >
                      <PlatformIcon size={20} />
                    </ThemeIcon>
                    <Stack gap={2}>
                      <Title order={3}>{activeClient.name}</Title>
                      {activeClient.recommended ? (
                        <Text size="sm" c="brandOrange.3">
                          Рекомендуем для быстрого старта
                        </Text>
                      ) : null}
                    </Stack>
                  </Group>
                  <Text>{activeClient.description}</Text>
                  <Text c="dimmed" size="sm">
                    {activeClient.details}
                  </Text>
                </Stack>

                <div className={styles.downloadButtons}>
                  {activeClient.downloads.map((download) => {
                    const isStore =
                      download.label.includes("Store") ||
                      download.label.includes("Play");

                    return (
                      <Button
                        key={download.label}
                        component="a"
                        href={download.href}
                        target="_blank"
                        rel="noreferrer"
                        leftSection={<IconDownload size={16} />}
                        rightSection={<IconExternalLink size={16} />}
                        color={isStore ? "brandOrange" : "brandCyan"}
                        c={isStore ? "white" : "black"}
                      >
                        {download.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.stepsColumns}>
                <Card className={styles.stepsCard} p="lg">
                  <Stack gap="sm">
                    <Badge color="brandCyan" variant="light" w="fit-content">
                      Под вашу платформу
                    </Badge>
                    <div className={styles.stepsList}>
                      {platform.steps.map((step) => (
                        <div key={step} className={styles.stepRow}>
                          <ThemeIcon
                            color="brandCyan"
                            variant="light"
                            size={24}
                            radius="xl"
                          >
                            <IconCircleCheck size={14} />
                          </ThemeIcon>
                          <Text size="sm">{step}</Text>
                        </div>
                      ))}
                    </div>
                  </Stack>
                </Card>

                <Card className={styles.stepsCard} p="lg">
                  <Stack gap="sm">
                    <Badge color="brandOrange" variant="light" w="fit-content">
                      Общая схема
                    </Badge>
                    <div className={styles.stepsList}>
                      {setupIntroSteps.map((step) => (
                        <div key={step} className={styles.stepRow}>
                          <ThemeIcon
                            color="brandOrange"
                            variant="light"
                            size={24}
                            radius="xl"
                          >
                            <IconArrowRight size={14} />
                          </ThemeIcon>
                          <Text size="sm">{step}</Text>
                        </div>
                      ))}
                    </div>
                  </Stack>
                </Card>
              </div>

              <div className={styles.supportRow}>
                <ThemeIcon
                  color="brandOrange"
                  variant="light"
                  size={40}
                  radius="md"
                >
                  <IconHelpCircle size={18} />
                </ThemeIcon>
                <Stack gap={4}>
                  <Text fw={700}>
                    Если подключение не завелось с первого раза
                  </Text>
                  <Text size="sm" c="dimmed">
                    Обновите подписку в приложении и попробуйте еще раз. Если
                    проблема осталась, откройте поддержку и приложите скриншоты
                    клиента.
                  </Text>
                </Stack>
              </div>
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </PageSection>
  );
}
