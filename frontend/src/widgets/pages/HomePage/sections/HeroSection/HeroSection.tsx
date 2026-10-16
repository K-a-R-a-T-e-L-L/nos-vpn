import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import Image from "next/image";

import { MEDIA } from "@/shared/lib/media";
import { PageSection } from "@/shared/ui/PageSection/PageSection";

import { heroBullets, heroMetrics } from "../../HomePage.data";
import styles from "../../HomePage.module.css";
import { nbspPrepositions } from "@/shared/lib/nbspPrepositionsю";

export default function HeroSection() {
  return (
    <PageSection pt={20}>
      <div className={`${styles.section} ${styles.heroGrid}`}>
        <Card
          className={`${styles.panel} ${styles.heroPanel}`}
          radius="xl"
          p={{ base: "lg", md: "xl" }}
        >
          <Stack gap="xl" h="100%" justify="space-between">
            <Stack gap="lg">
              <Badge
                className={`${styles.eyebrow} ${styles.eyebrowTiltSoft}`}
                classNames={{
                  label: styles.eyebrowLabel,
                }}
                size="lg"
              >
                ⚡ VPN, который просто работает
              </Badge>

              <Title order={1} className={styles.heroTitle}>
                NOS VPN <br /> Мы утерли всем нос
                <Box c="brandCyan">и у нас все работает!</Box>
              </Title>

              <Stack gap="sm" mt={20}>
                {heroBullets.map((item) => (
                  <Group key={item} gap="sm" wrap="nowrap">
                    <ThemeIcon
                      color="brandCyan"
                      variant="outline"
                      size={28}
                      radius="xl"
                    >
                      <IconCheck size={15} />
                    </ThemeIcon>
                    <Text className={styles.heroBullet}>
                      {nbspPrepositions(item)}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Stack>

            <div className={styles.heroMetrics}>
              {heroMetrics.map((item) => (
                <Card
                  key={item.label}
                  className={styles.metricCard}
                  radius="xl"
                  p="md"
                >
                  <Stack gap={4}>
                    <Text className={styles.metricValue}>{item.value}</Text>
                    <Text size="sm" c="dimmed">
                      {nbspPrepositions(item.label)}
                    </Text>
                  </Stack>
                </Card>
              ))}
            </div>

            <Group className={styles.heroButtons}>
              <Button
                component="a"
                href="/tariffs"
                color="brandOrange"
                size="lg"
                className="button-orange"
              >
                Подключить VPN
              </Button>
              <Button component="a" href="/setup" variant="light" size="lg" className="button-neon-soft">
                Открыть инструкции
              </Button>
            </Group>
          </Stack>
        </Card>

        <div
          className={`${styles.panel} ${styles.heroFrame} ${styles.heroPanel}`}
          style={{ width: "100%" }}
        >
          <Image
            src={MEDIA.images.homeHeroGuide}
            alt="NOS VPN hero"
            className={styles.heroImage}
            priority
          />
        </div>
      </div>
    </PageSection>
  );
}
