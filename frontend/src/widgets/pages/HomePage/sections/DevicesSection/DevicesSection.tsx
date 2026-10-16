import { Badge, Button, Card, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

import { deviceItems } from "../../HomePage.data";
import styles from "../../HomePage.module.css";
import { nbspPrepositions } from "@/shared/lib/nbspPrepositionsю";

export default function DevicesSection() {
  return (
    <PageSection>
      <Stack className={styles.section} gap="lg">
        <Stack className={styles.sectionHeader}>
          <Badge className={`${styles.eyebrow} ${styles.eyebrowTiltSoft}`} size="lg">
            Инструкции
          </Badge>
          <Title order={2} className={styles.sectionTitle}>
            {nbspPrepositions('Работает на телефоне, ноутбуке и компьютере')}
          </Title>
          <Text className={styles.sectionText}>
            {nbspPrepositions('Инструкции лучше показывать не как документацию, а как быстрый путь для конкретного устройства.')}
          </Text>
        </Stack>

        <div className={styles.deviceGrid}>
          {deviceItems.map((item) => (
            <Card key={item.title} className={styles.panel} radius="xl" p="lg">
              <Stack gap="md" h="100%">
                <ThemeIcon color="brandBlue" variant="light" size={42} radius="md">
                  <item.icon size={20} />
                </ThemeIcon>
                <Title order={3}>{item.title}</Title>
                <Text size="sm" c="dimmed">
                  {nbspPrepositions(item.text)}
                </Text>

              </Stack>
            </Card>
          ))}
        </div>

        <Button component="a" href="/setup" variant="light" size="lg" className={`button-neon-soft ${styles.deviceCta}`} rightSection={<IconArrowRight size={16} />}>
          Открыть инструкции
        </Button>
      </Stack>
    </PageSection>
  );
}


