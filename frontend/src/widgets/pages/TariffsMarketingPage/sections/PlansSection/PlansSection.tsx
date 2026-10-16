import { Alert, Button, Group, Stack } from "@mantine/core";

import PlanCatalogSelector from "@/widgets/pages/shared/plans/PlanCatalogSelector.client";
import type { PlanCatalogResponse } from "@/widgets/pages/shared/plans/plan.types";

type PlansSectionProps = {
  catalog: PlanCatalogResponse | null;
  hasError: boolean;
};

export default function PlansSection({ catalog, hasError }: PlansSectionProps) {
  if (hasError || !catalog) {
    return (
      <Stack gap="md">
        <Alert color="brandOrange" variant="light" title="Не удалось загрузить тарифы">
          Попробуйте обновить страницу или откройте раздел поддержки. Если вы уже авторизованы, тарифы также доступны в
          личном кабинете.
        </Alert>
        <Group>
          <Button component="a" href="/tariffs">
            Обновить
          </Button>
          <Button component="a" href="/support" variant="light">
            Поддержка
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <PlanCatalogSelector
      catalog={catalog}
      title="Выберите срок и количество устройств"
      description="Сначала выберите период, затем количество устройств. Чем дольше срок, тем выгоднее подписка."
      ctaLabel="Перейти к оплате"
    />
  );
}
