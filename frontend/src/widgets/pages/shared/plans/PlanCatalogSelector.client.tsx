"use client";

import {
  Badge,
  Button,
  Card,
  Grid,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArrowRight,
  IconClockHour4,
  IconDevices,
  IconLink,
  IconQrcode,
  IconWallet,
} from "@tabler/icons-react";
import styles from "./styles.module.css";

import type { PlanCatalogResponse } from "./plan.types";
import { nbspPrepositions } from "@/shared/lib/nbspPrepositionsю";
import { formatPlanPrice } from "@/features/plans/plan-selection";
import { usePlanCatalogSelection } from "@/features/plans/usePlanCatalogSelection";

type PlanCatalogSelectorProps = {
  catalog: PlanCatalogResponse;
  title?: string;
  description?: string;
  ctaLabel?: string;
};

export default function PlanCatalogSelector({
  catalog,
  title = nbspPrepositions("Выберите срок и количество устройств"),
  description = nbspPrepositions(
    "Сначала выберите период, затем число устройств. Чем длиннее срок, тем выгоднее итоговая стоимость месяца.",
  ),
  ctaLabel = "Перейти к оплате",
}: PlanCatalogSelectorProps) {
  const {
    selectedPeriod,
    selectedDevices,
    selectedDuration,
    selectedRow,
    selectedPlan,
    setSelectedPeriod,
    setSelectedDevices,
  } = usePlanCatalogSelection(catalog);

  return (
    <Grid gutter="lg" align="stretch">
      <Grid.Col span={{ base: 12, xl: 7 }}>
        <Card
          bg="dark.8"
          bd="1px solid var(--mantine-color-dark-6)"
          h="100%"
          radius="xl"
        >
          <Stack gap="xl">
            <Stack gap="xs">
              <Badge color="brandOrange" variant="light" w="fit-content">
                Тарифы NOS VPN
              </Badge>
              <Title order={2}>{title}</Title>
              <Text c="dimmed" maw={760}>
                {description}
              </Text>
            </Stack>

            <Stack gap="sm">
              <Group justify="space-between" align="baseline" gap="md">
                <Text fw={700}>Период подписки</Text>
              </Group>
              <Group gap={10} wrap="nowrap" className={styles.group}>
                {catalog.durations.map((duration) => {
                  const isSelected = selectedPeriod === duration.periodDays;

                  return (
                    <Card
                      key={duration.periodDays}
                      p="md"
                      bg={isSelected ? "dark.7" : "dark.8"}
                      bd={`${isSelected ? "1px solid brandCyan.5" : "1px solid brandCyan.9"}`}
                      radius="xl"
                      style={{ cursor: "pointer", height: 160, width: "100%" }}
                      onClick={() => setSelectedPeriod(duration.periodDays)}
                      className={`card ${styles.card}`}
                    >
                      <Group
                        justify="space-between"
                        align="flex-start"
                        gap="md"
                        wrap="nowrap"
                      >
                        <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            fw={700}
                            lh={1.15}
                            c="dimmed"
                            fz="lg"
                            style={{ textWrap: "pretty" }}
                          >
                            {duration.label}
                          </Text>
                          <Text size="sm" lh={1.15} fw={900} fz={20} mt={10}>
                            от {formatPlanPrice(duration.startingPriceRub)}
                          </Text>
                          {!duration.savingsPercent ? (
                            <Text
                              mt={5}
                              c={
                                duration.savingsPercent
                                  ? "brandCyan.3"
                                  : "dimmed"
                              }
                              size="sm"
                              lh={1.2}
                              fw={duration.savingsPercent ? 600 : 400}
                            >
                              {duration.savingsPercent
                                ? `Выгода ${duration.savingsPercent}%`
                                : "Базовый месяц"}
                            </Text>
                          ) : (
                            <Badge
                              mt={5}
                              tt={"lowercase"}
                              py={15}
                              px={10}
                              variant="light"
                              c="brandCyan"
                              color="brandCyan"
                            >
                              <Text
                                c={
                                  duration.savingsPercent
                                    ? "brandCyan.3"
                                    : "dimmed"
                                }
                                size="xs"
                                lh={1.2}
                                fw={duration.savingsPercent ? 600 : 400}
                              >
                                {duration.savingsPercent
                                  ? `Выгода ${duration.savingsPercent}%`
                                  : "Базовый месяц"}
                              </Text>
                            </Badge>
                          )}
                        </Stack>
                      </Group>
                    </Card>
                  );
                })}
              </Group>
            </Stack>

            <Stack gap="sm">
              <Text fw={700}>Количество устройств</Text>
              <SimpleGrid cols={{ base: 1, sm: 2, xl: 3 }} spacing="md">
                {catalog.rows.map((row) => {
                  const periodIndex = catalog.durations.findIndex(
                    (duration) => duration.periodDays === selectedPeriod,
                  );
                  const plan = periodIndex >= 0 ? row.plans[periodIndex] : null;
                  const isSelected = selectedDevices === row.devicesLimit;

                  return (
                    <Card
                      className="card"
                      key={row.devicesLimit}
                      p="md"
                      bg={isSelected ? "dark.7" : "dark.8"}
                      bd={`${isSelected ? "1px solid brandCyan.4" : "1px solid brandCyan.8"}`}
                      c={`${isSelected ? "brandCyan.4" : "white"}`}
                      radius="xl"
                      style={{
                        cursor: plan ? "pointer" : "not-allowed",
                        minHeight: 50,
                      }}
                      onClick={() => {
                        if (plan) {
                          setSelectedDevices(row.devicesLimit);
                        }
                      }}
                    >
                      <Stack gap={8} h="100%" justify="space-between">
                        <Stack
                          gap={4}
                          style={{ flex: 1, minWidth: 0 }}
                          align="center"
                          justify="center"
                        >
                          <Text
                            fw={700}
                            lh={1.15}
                            fz="xs"
                            ta="center"
                            style={{ textWrap: "pretty" }}
                          >
                            {row.devicesLabel}
                          </Text>
                        </Stack>
                      </Stack>
                    </Card>
                  );
                })}
              </SimpleGrid>
            </Stack>

            <Card
              className="card"
              p="md"
              bg="dark.7"
              bd="1px solid var(--mantine-color-dark-6)"
              radius="xl"
            >
              <Stack gap="sm">
                <Group gap="xs" wrap="nowrap">
                  <ThemeIcon
                    color="brandCyan"
                    variant="light"
                    size={34}
                    radius="md"
                  >
                    <IconWallet size={18} />
                  </ThemeIcon>
                  <Text fw={600}>
                    {nbspPrepositions(`После оплаты можно вернуть часть стоимости подписки через
                    реферальную программу`)}
                  </Text>
                </Group>
                <Text c="dimmed" size="sm">
                  {nbspPrepositions(` Приглашайте друзей и получайте 50% с каждой их оплаты в
                  кошелек. Пара активных приглашений уже может заметно снизить
                  ваши расходы на VPN.`)}
                </Text>
              </Stack>
            </Card>
          </Stack>
        </Card>
      </Grid.Col>

      <Grid.Col span={{ base: 12, xl: 5 }}>
        <Card
          p={{ base: "lg", md: 28 }}
          bg="dark.8"
          bd="1px solid var(--mantine-color-dark-6)"
          h="100%"
          radius="xl"
        >
          <Stack gap="xl" h="100%">
            <Stack gap="sm">
              <Badge color="brandBlue" variant="light" w="fit-content">
                Ваш вариант
              </Badge>
              <Stack gap={2}>
                <Title order={2} lh={1.05} style={{ textWrap: "balance" }}>
                  {selectedRow?.devicesLabel ?? "Выберите устройства"}
                </Title>
                <Text fw={700} size="lg">
                  {selectedDuration?.label ?? "Выберите период"}
                </Text>
              </Stack>
              <Text c="dimmed" lh={1.5} maw={420}>
                {nbspPrepositions(` После оплаты ссылка доступа и QR-код появятся в кабинете.
                Подключиться можно сразу через сайт, а Telegram привязать позже.`)}
              </Text>
            </Stack>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Card
                p="lg"
                bg="dark.7"
                bd="1px solid var(--mantine-color-dark-6)"
                radius="xl"
              >
                <Stack gap={8}>
                  <Group gap="xs">
                    <ThemeIcon
                      color="brandOrange"
                      variant="light"
                      size={30}
                      radius="md"
                    >
                      <IconClockHour4 size={16} />
                    </ThemeIcon>
                    <Text fw={700}>Срок</Text>
                  </Group>
                  <Text size="lg" fw={700}>
                    {selectedDuration?.label ?? "—"}
                  </Text>
                  {selectedDuration?.savingsPercent ? (
                    <Badge color="brandCyan" variant="light" w="fit-content">
                      Выгода {selectedDuration.savingsPercent}%
                    </Badge>
                  ) : null}
                </Stack>
              </Card>

              <Card
                p="lg"
                bg="dark.7"
                bd="1px solid var(--mantine-color-dark-6)"
                radius="xl"
              >
                <Stack gap={8}>
                  <Group gap="xs">
                    <ThemeIcon
                      color="brandBlue"
                      variant="light"
                      size={30}
                      radius="md"
                    >
                      <IconDevices size={16} />
                    </ThemeIcon>
                    <Text fw={700}>Устройства</Text>
                  </Group>
                  <Text size="lg" fw={700}>
                    {selectedRow?.devicesLabel ?? "—"}
                  </Text>
                  <Text c="dimmed" size="sm">
                    {nbspPrepositions(
                      "Один аккаунт, единый доступ и один QR-код.",
                    )}
                  </Text>
                </Stack>
              </Card>
            </SimpleGrid>

            <Card
              p={{ base: "lg", md: "xl" }}
              bg="dark.7"
              bd="1px solid var(--mantine-color-dark-6)"
              radius="xl"
            >
              <Stack gap="md">
                <Group justify="space-between" align="flex-end" gap="sm">
                  <Stack gap={2}>
                    <Text c="dimmed" size="sm">
                      К оплате
                    </Text>
                    <Text fw={800} fz={{ base: 30, md: 38 }} lh={1}>
                      {selectedPlan
                        ? formatPlanPrice(selectedPlan.amount)
                        : "—"}
                    </Text>
                  </Stack>
                  {selectedPlan?.savingsPercent ? (
                    <Badge color="brandCyan" variant="light" size="lg">
                      Экономия {selectedPlan.savingsPercent}%
                    </Badge>
                  ) : null}
                </Group>

                <SimpleGrid cols={{ base: 1 }} spacing="md">
                  <Card
                    p="lg"
                    bg="dark.8"
                    bd="1px solid var(--mantine-color-dark-6)"
                    radius="xl"
                  >
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                      <ThemeIcon
                        color="brandOrange"
                        variant="light"
                        size={30}
                        radius="md"
                      >
                        <IconLink size={16} />
                      </ThemeIcon>
                      <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                        <Text fw={600}>Ссылка доступа</Text>
                        <Text c="dimmed" size="sm" lh={1.45}>
                          {nbspPrepositions(
                            "Появится в кабинете сразу после подтверждения оплаты.",
                          )}
                        </Text>
                      </Stack>
                    </Group>
                  </Card>

                  <Card
                    p="lg"
                    bg="dark.8"
                    bd="1px solid var(--mantine-color-dark-6)"
                    radius="xl"
                  >
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                      <ThemeIcon
                        color="brandBlue"
                        variant="light"
                        size={30}
                        radius="md"
                      >
                        <IconQrcode size={16} />
                      </ThemeIcon>
                      <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                        <Text fw={600}>QR-код</Text>
                        <Text c="dimmed" size="sm" lh={1.45}>
                          {nbspPrepositions(`Для быстрого импорта в приложение на телефоне или
                          компьютере.`)}
                        </Text>
                      </Stack>
                    </Group>
                  </Card>
                </SimpleGrid>
              </Stack>
            </Card>

            <Button
              component="a"
              href={
                selectedPlan
                  ? `/checkout?planId=${selectedPlan.id}`
                  : "/tariffs"
              }
              color="brandOrange"
              rightSection={<IconArrowRight size={18} />}
              disabled={!selectedPlan}
              mt="auto"
              size="lg"
              className="button-orange"
            >
              {ctaLabel}
            </Button>
          </Stack>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
