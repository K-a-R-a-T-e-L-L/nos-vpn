import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

import { finalMetrics } from "../../HomePage.data";
import styles from "../../HomePage.module.css";
import { nbspPrepositions } from "@/shared/lib/nbspPrepositionsю";

export default function FinalCtaSection() {
  return (
    <PageSection>
      <Card className={`${styles.panel} ${styles.finalCard}`} radius="xl">
        <div className={styles.finalInner}>
          <Stack gap="lg">
            <Badge
              className={`${styles.eyebrow} ${styles.eyebrowWarm} ${styles.eyebrowTiltAlt}`}
              size="lg"
            >
              {nbspPrepositions("Готово к подключению")}
            </Badge>
            <Title order={2} className={styles.sectionTitle}>
              {nbspPrepositions("Начните с аккаунта и тарифа")}
            </Title>
            <Text className={styles.sectionText}>
              {nbspPrepositions(
                "Выберите подходящий срок, количество устройств и получите доступ сразу после оплаты.",
              )}
            </Text>
            <Group className={styles.ctaGroup}>
              <Button
                component="a"
                href="/tariffs"
                color="brandOrange"
                size="lg"
              >
                Подключить VPN
              </Button>
            </Group>
          </Stack>

          <div className={styles.finalMetrics}>
            {finalMetrics.map((item) => (
              <Card
                key={item.title}
                className={styles.panel}
                radius="xl"
                p="md"
              >
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <ThemeIcon
                    color="brandCyan"
                    variant="light"
                    size={38}
                    radius="md"
                  >
                    <item.icon size={18} />
                  </ThemeIcon>
                  <Stack gap={2}>
                    <Text fw={700}>{item.title}</Text>
                    <Text size="sm" c="dimmed">
                      {nbspPrepositions(item.text)}
                    </Text>
                  </Stack>
                </Group>
              </Card>
            ))}
          </div>
        </div>
      </Card>
    </PageSection>
  );
}
