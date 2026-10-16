import {
  Badge,
  Card,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";

import {
  IconBolt,
  IconBrandTelegram,
  IconGift,
  IconQrcode,
} from "@tabler/icons-react";

import { PageSection } from "@/shared/ui/PageSection/PageSection";
import PlanCatalogSelector from "@/widgets/pages/shared/plans/PlanCatalogSelector.client";
import { getPublicPlansCatalog } from "@/widgets/pages/shared/plans/public-plans.server";

import styles from "../../HomePage.module.css";
import { nbspPrepositions } from "@/shared/lib/nbspPrepositionsю";

const tariffHighlights = [
  {
    title: "Моментальная выдача ссылки и QR",
    icon: IconBolt,
    color: "brandOrange" as const,
  },
  {
    title: "Инструкции для каждой платформы",
    icon: IconQrcode,
    color: "brandCyan" as const,
  },
  {
    title: "Поддержка через Telegram",
    icon: IconBrandTelegram,
    color: "brandBlue" as const,
  },
  {
    title: "Бонусы за приглашения",
    icon: IconGift,
    color: "brandOrange" as const,
  },
] as const;

export default async function TariffsSection() {
  const catalog = await getPublicPlansCatalog();

  return (
    <PageSection>
      <Stack className={`${styles.section} ${styles.tariffsShell}`} gap="lg">
        <Stack className={styles.sectionHeader}>
          <Badge
            className={`${styles.eyebrow} ${styles.eyebrowTiltReverse}`}
            size="lg"
          >
            Тарифы
          </Badge>
          <Title order={2} className={styles.sectionTitle}>
            {nbspPrepositions("Выберите срок и количество устройств")}
          </Title>
          <Text className={styles.sectionText}>
            {nbspPrepositions(`Чем дольше период, тем выгоднее месяц. Отличается только срок подписки и число устройств на одном
            аккаунте.`)}
          </Text>
        </Stack>

        <SimpleGrid
          cols={{ base: 1, sm: 2, xl: 4 }}
          spacing="md"
          className={styles.tariffHighlightsGrid}
        >
          {tariffHighlights.map((item) => (
            <Card
              key={item.title}
              className={`${styles.panel} ${styles.tariffHighlightCard}`}
              radius="xl"
              p="lg"
            >
              <Stack gap="md" h="100%">
                <ThemeIcon
                  color={item.color}
                  variant="light"
                  size={38}
                  radius="md"
                >
                  <item.icon size={18} />
                </ThemeIcon>
                <Title order={3} className={styles.tariffHighlightTitle}>
                  {nbspPrepositions(item.title)}
                </Title>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>

        <div className={styles.tariffsSelectorShell}>
          <PlanCatalogSelector
            catalog={catalog}
            title="Подберите тариф под свой сценарий"
            description={nbspPrepositions(
              "Сначала выберите период, затем количество устройств. Ссылка доступа и QR-код появятся сразу после оплаты.",
            )}
            ctaLabel="Перейти к оплате"
          />
        </div>
      </Stack>
    </PageSection>
  );
}
