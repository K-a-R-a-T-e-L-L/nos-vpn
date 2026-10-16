import { Badge, Card, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

import { trustItems } from "../../HomePage.data";
import styles from "../../HomePage.module.css";

export default function TrustSection() {
  return (
    <PageSection>
      <Stack className={styles.section} gap="lg">
        <Stack className={styles.sectionHeader}>
          <Badge className={`${styles.eyebrow} ${styles.eyebrowMagenta}`} size="lg">
            Надёжность
          </Badge>
          <Title order={2} className={styles.sectionTitle}>
            Доступ, платежи и привязка аккаунта построены так, чтобы подписка не терялась
          </Title>
        </Stack>

        <SimpleGrid className={styles.trustGrid} cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
          {trustItems.map((item) => (
            <Card key={item.title} className={`${styles.panel} ${styles.featureCard}`} radius="xl">
              <Stack gap="md" h="100%">
                <ThemeIcon color="brandMagenta" variant="light" size={48} radius="md">
                  <item.icon size={22} />
                </ThemeIcon>
                <Title order={3}>{item.title}</Title>
                <Text size="sm" c="dimmed">
                  {item.text}
                </Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </PageSection>
  );
}
