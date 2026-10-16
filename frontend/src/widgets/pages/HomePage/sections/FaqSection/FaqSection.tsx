import {
  Accordion,
  AccordionControl,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

import { homeFaqItems } from "../../HomePage.data";
import styles from "../../HomePage.module.css";
import { nbspPrepositions } from "@/shared/lib/nbspPrepositionsю";

export default function FaqSection() {
  return (
    <PageSection>
      <Stack className={styles.section} gap="lg">
        <Stack className={styles.sectionHeader}>
          <Badge
            className={`${styles.eyebrow} ${styles.eyebrowTiltSoft}`}
            size="lg"
          >
            FAQ
          </Badge>
          <Title order={2} className={styles.sectionTitle}>
            Частые вопросы
          </Title>
        </Stack>

        <Card className={`${styles.panel} ${styles.faqCard}`} radius="xl">
          <Accordion
            variant="separated"
            radius="lg"
            classNames={{
              item: styles.faqItem,
              control: styles.faqControl,
            }}
          >
            {homeFaqItems.map((item) => (
              <AccordionItem key={item.value} value={item.value}>
                <AccordionControl>
                  {nbspPrepositions(item.question)}
                </AccordionControl>
                <AccordionPanel>{nbspPrepositions(item.answer)}</AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>

        <Card className={`${styles.panel} ${styles.faqCard}`} radius="xl">
          <Group justify="space-between" gap="lg">
            <Stack gap={4}>
              <Title order={3}>
                {nbspPrepositions("Нужна помощь по оплате или подключению?")}
              </Title>
              <Text c="dimmed">
                {nbspPrepositions(
                  "Поддержка поможет проверить платеж, восстановить доступ или разобраться с привязкой аккаунта.",
                )}
              </Text>
            </Stack>
            <Button component="a" href="/support" className="button-neon-soft">
              Перейти в поддержку
            </Button>
          </Group>
        </Card>
      </Stack>
    </PageSection>
  );
}
