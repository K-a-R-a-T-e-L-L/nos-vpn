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

import { urgencyPoints } from "../../HomePage.data";
import styles from "../../HomePage.module.css";
import { nbspPrepositions } from "@/shared/lib/nbspPrepositionsю";

const promoPoints = urgencyPoints.map((item) => item.text);

export default function ProblemSection() {
  return (
    <PageSection>
      <Stack className={styles.section} gap="lg">
        <Stack className={styles.sectionHeader}>
          <Badge
            className={`${styles.eyebrow} ${styles.eyebrowWarm} ${styles.eyebrowTiltReverse}`}
            size="lg"
          >
            Ценность NOS VPN
          </Badge>
          <Title order={2} className={styles.sectionTitle}>
            Успокоим ваши нервы.
          </Title>
          <Text className={styles.sectionText}>
            {nbspPrepositions(`Пользователю не нужна сложная технология. Ему нужно, чтобы видео грузилось, сайты открывались,
            приложение подключалось, а подписка не терялась.`)}
          </Text>
        </Stack>

        <div className={styles.problemGrid}>
          <Card className={styles.panel} radius="xl" p="lg">
            <Stack gap="md">
              <Title order={3}>Когда VPN нужен прямо сейчас</Title>
              <Stack className={styles.problemList}>
                {urgencyPoints.map((item, index) => (
                  <Card
                    key={item.title}
                    className={`${styles.featureCard} ${index === 2 ? styles.featureCardAccent : ""}`}
                    radius="xl"
                    p="md"
                  >
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                      <ThemeIcon
                        color="brandBlue"
                        variant="light"
                        size={34}
                        radius="md"
                      >
                        <item.icon size={18} />
                      </ThemeIcon>
                      <Stack gap={2}>
                        <Text fw={700}>{nbspPrepositions(item.title)}</Text>
                        <Text size="sm" c="dimmed">
                          {nbspPrepositions(item.text)}
                        </Text>
                      </Stack>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Stack>
          </Card>

          <Card
            className={`${styles.panel} ${styles.promoCard}`}
            radius="xl"
            p="xl"
          >
            <Stack gap="lg" h="100%" justify="space-between">
              <Badge
                className={`${styles.eyebrow} ${styles.eyebrowTiltAlt}`}
                size="lg"
              >
                Главная мысль
              </Badge>
              <Title order={2} className={styles.promoTitle}>
                Заплатил
                <br />
                Получил
                <br />
                Подключился
              </Title>
              <ul className={styles.promoList}>
                {promoPoints.map((item) => (
                  <li key={item} className={styles.promoListItem}>
                    {nbspPrepositions(item)}
                  </li>
                ))}
              </ul>
              <Text c="dimmed" className={styles.promoTextHidden}>
                {nbspPrepositions(`Без ощущения, что вы попали в техническую инструкцию для
                программистов. Все важное находится в личном кабинете: статус
                подписки, ссылка доступа, QR-код, устройства, продление, бонусы
                и поддержка.`)}
              </Text>
              <Button
                component="a"
                href="/tariffs"
                color="brandCyan"
                c="black"
                w="fit-content"
                className="button-neon"
              >
                Выбрать тариф
              </Button>
            </Stack>
          </Card>
        </div>
      </Stack>
    </PageSection>
  );
}



