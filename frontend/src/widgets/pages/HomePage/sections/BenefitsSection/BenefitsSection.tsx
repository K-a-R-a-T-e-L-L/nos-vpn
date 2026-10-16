import { Badge, Card, Stack, Text, ThemeIcon, Title } from "@mantine/core";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

import { homeBenefits } from "../../HomePage.data";
import styles from "../../HomePage.module.css";
import { nbspPrepositions } from "@/shared/lib/nbspPrepositionsю";

export default function BenefitsSection() {
  return (
    <PageSection>
      <Stack className={styles.section} gap="lg">
        <Stack className={styles.sectionHeader}>
          <Badge className={`${styles.eyebrow} ${styles.eyebrowTiltAlt}`} size="lg">
            Личный кабинет
          </Badge>
          <Title order={2} className={styles.sectionTitle}>
            Все для подключения в одном кабинете
          </Title>
        </Stack>

        <div className={styles.benefitGrid}>
          {homeBenefits.map((item, index) => (
            <Card key={item.title} className={`${styles.panel} ${styles.benefitCard} ${styles[`benefitCard${(index % 3) + 1}`]}`} radius="xl" p="lg">
              <Stack gap="md" h="100%">
                <ThemeIcon color={index % 3 === 0 ? "brandCyan" : index % 3 === 1 ? "brandBlue" : "brandOrange"} variant="light" size={42} radius="md" className={styles.benefitIcon}>
                  <item.icon size={20} />
                </ThemeIcon>
                <Title order={3}>{nbspPrepositions(item.title)}</Title>
                <Text size="sm" c="dimmed">
                  {nbspPrepositions(item.text)}
                </Text>
              </Stack>
            </Card>
          ))}
        </div>
      </Stack>
    </PageSection>
  );
}
