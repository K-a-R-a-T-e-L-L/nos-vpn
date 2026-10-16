"use client";

import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

import { quickStartSteps, scenarioOptions } from "../../HomePage.data";
import styles from "../../HomePage.module.css";
import { nbspPrepositions } from "@/shared/lib/nbspPrepositionsю";

export default function HowItWorksSection() {
  const [activeScenarioId, setActiveScenarioId] = useState(
    scenarioOptions[0]?.id ?? "",
  );
  const activeScenario =
    scenarioOptions.find((item) => item.id === activeScenarioId) ??
    scenarioOptions[0];

  return (
    <PageSection>
      <Stack className={styles.section} gap="xl">
        <Stack className={styles.sectionHeader}>
          <Badge
            className={`${styles.eyebrow} ${styles.eyebrowTiltAlt}`}
            size="lg"
          >
            Как это работает
          </Badge>
          <Title order={2} className={styles.sectionTitle}>
            {nbspPrepositions(
              "Выберите свой сценарий, и сайт сам ведет дальше",
            )}
          </Title>
          <Text className={styles.sectionText}>
            {nbspPrepositions(`Мы не заставляем разбираться в технической механике. Есть Telegram, удобно. Нет Telegram, все равно
            подключитесь через сайт.`)}
          </Text>
        </Stack>

        <div className={styles.scenarioTop}>
          <Card
            className={`${styles.panel} ${styles.scenarioSelectorPanel}`}
            radius="xl"
            p="lg"
          >
            <Stack className={styles.scenarioOptions}>
              {scenarioOptions.map((item) => (
                <UnstyledButton
                  key={item.id}
                  type="button"
                  onClick={() => setActiveScenarioId(item.id)}
                  className={`${styles.featureCard} ${styles.scenarioOptionButton} ${item.id === activeScenario.id ? styles.optionCardActive : ""}`}
                >
                  <Stack gap={4} className={styles.scenarioOptionContent}>
                    <Text fw={700} className={styles.scenarioOptionTitle}>
                      {item.title}
                    </Text>
                    <Text
                      size="sm"
                      c="dimmed"
                      className={styles.scenarioOptionButton_text}
                    >
                      {nbspPrepositions(item.text)}
                    </Text>
                  </Stack>
                </UnstyledButton>
              ))}
            </Stack>
          </Card>

          <Card
            className={`${styles.panel} ${styles.scenarioDetailsPanel}`}
            radius="xl"
            p="lg"
          >
            <Stack gap="lg">
              <Stack gap={6}>
                <Text
                  size="sm"
                  tt="uppercase"
                  fw={700}
                  c="brandCyan.3"
                  className={styles.scenarioMetaLabel}
                >
                  Выбранный сценарий
                </Text>
                <Title order={3}>{activeScenario.title}</Title>
                <Text c="dimmed">{activeScenario.text}</Text>
              </Stack>

              <div className={styles.scenarioSteps}>
                {activeScenario.steps.map((item, index) => (
                  <Card
                    key={`${activeScenario.id}-${item.title}`}
                    className={`${styles.panel} ${styles.scenarioStepCard}`}
                    radius="xl"
                    p="lg"
                  >
                    <Stack gap="md" className={styles.scenarioStepContent}>
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
                      <Title order={4}>{nbspPrepositions(item.title)}</Title>
                      <Text size="sm" c="dimmed">
                        {nbspPrepositions(item.text)}
                      </Text>
                      {item.actions.length ? (
                        <Group gap="sm" className={styles.scenarioStepActions}>
                          {item.actions.map((action) => (
                            <Button
                              key={`${item.title}-${action.label}`}
                              component="a"
                              href={action.href}
                              target={action.external ? "_blank" : undefined}
                              rel={action.external ? "noreferrer" : undefined}
                              variant={action.variant ?? "filled"}
                              className={`${styles.scenarioStepButton} ${action.variant === "light" ? "button-neon-soft" : "button-orange"}`}
                            >
                              {action.label}
                            </Button>
                          ))}
                        </Group>
                      ) : null}
                    </Stack>
                  </Card>
                ))}
              </div>
            </Stack>
          </Card>
        </div>

        <Stack gap="lg">
          <Stack className={styles.sectionHeader}>
            <Badge
              className={`${styles.eyebrow} ${styles.eyebrowWarm} ${styles.eyebrowTiltSoft}`}
              size="lg"
            >
              Как подключиться
            </Badge>
            <Title order={2} className={styles.sectionTitle}>
              {nbspPrepositions('4 шага, и VPN уже работает')}
            </Title>
            <Text className={styles.sectionText}>
              {nbspPrepositions(`Сценарий сделан так, чтобы человек не зависал и не думал, что
              нажимать дальше.`)}
            </Text>
          </Stack>

          <div className={styles.quickSteps}>
            {quickStartSteps.map((item, index) => (
              <Card key={item} className={styles.panel} radius="xl" p="lg">
                <Stack gap="md">
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
                  <Text fw={700}>{nbspPrepositions(item)}</Text>
                </Stack>
              </Card>
            ))}
          </div>
        </Stack>
      </Stack>
    </PageSection>
  );
}
