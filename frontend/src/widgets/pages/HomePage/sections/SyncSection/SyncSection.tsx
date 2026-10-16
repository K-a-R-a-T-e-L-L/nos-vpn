import { Badge, Card, Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

import { referralSteps } from "../../HomePage.data";
import styles from "../../HomePage.module.css";
import { nbspPrepositions } from "@/shared/lib/nbspPrepositionsю";

export default function SyncSection() {
  return (
    <PageSection>
      <Stack className={styles.section} gap="lg">
        <Stack className={styles.sectionHeader}>
          <Badge className={`${styles.eyebrow} ${styles.eyebrowWarm} ${styles.eyebrowTiltReverse}`} size="lg">
            Реферальная программа
          </Badge>
          <Title order={2} className={styles.sectionTitle} >
            {nbspPrepositions(`Зарабатывайте и возвращайте часть стоимости подписки через приглашения`)}
          </Title>
          <Text className={styles.sectionText}>
            {nbspPrepositions(`Пригласили друга, он оплатил подписку, бонус начислился в кошелек. Бонусы можно использовать для
            оплаты или вывести через поддержку.`)}
          </Text>
        </Stack>

        <div className={styles.referralGrid}>
          <Card className={`${styles.panel} ${styles.referralPromo}`} radius="xl" p="xl">
            <Stack gap="lg" h="100%" justify="center">
              <Title order={2} style={{fontWeight: 'bold'}} lh={.5} fz={74} c='brandOrange.5' ff={'text'}>до 50%</Title>
              <Text opacity={0.7}>с оплат приглашенных пользователей</Text>
              <Stack gap={6}>
                <Text >
                  {nbspPrepositions(`Бонус начисляется с успешных оплат приглашенных пользователей и может заметно снижать ваши
                  расходы на VPN.`)}
                </Text>
              </Stack>
            </Stack>
          </Card>

          <div className={styles.referralSteps}>
            {referralSteps.map((item, index) => (
              <Card key={item.title} className={styles.panel} radius="xl" p="lg">
                <Group gap="md" wrap="nowrap" align="flex-start">
                  <ThemeIcon color="brandCyan" variant="light" size={34} radius="xl">
                    <Text fw={800} size="sm">
                      {index + 1}
                    </Text>
                  </ThemeIcon>
                  <Stack gap={4}>
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
      </Stack>
    </PageSection>
  );
}
