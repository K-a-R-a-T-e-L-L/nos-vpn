import { Anchor, Text } from "@mantine/core";

import { LEGAL_ROUTES } from "@/shared/config/legal";

export default function CheckoutLegalNotice() {
  return (
    <Text c="dimmed" size="sm">
      Переходя к оплате, вы принимаете{" "}
      <Anchor href={LEGAL_ROUTES.terms}>пользовательское соглашение</Anchor>,{" "}
      подтверждаете ознакомление с{" "}
      <Anchor href={LEGAL_ROUTES.privacy}>политикой конфиденциальности</Anchor>{" "}
      и <Anchor href={LEGAL_ROUTES.refund}>условиями возврата</Anchor>. Если
      выбран разовый способ оплаты, автоматические списания не подключаются.
      Автопродление может быть подключено только при отдельном выборе
      соответствующего способа оплаты и явном согласии пользователя.
    </Text>
  );
}
