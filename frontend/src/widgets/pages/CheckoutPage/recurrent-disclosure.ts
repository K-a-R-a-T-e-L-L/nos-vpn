export type RecurrentDisclosureInput = {
  amountRub: number;
  intervalLabel: string;
};

export type RecurrentDisclosureModel = {
  title: string;
  chargeText: string;
  cancellationText: string;
  consentLabel: string;
};

export function buildRecurrentDisclosure({
  amountRub,
  intervalLabel,
}: RecurrentDisclosureInput): RecurrentDisclosureModel {
  return {
    title: "Автопродление",
    chargeText: `При выборе автопродления ${amountRub} ₽ списываются ${intervalLabel}. Первое списание производится при подключении автопродления.`,
    cancellationText:
      "Отменить будущие списания можно через поддержку. Отмена не сокращает уже оплаченный период. Последующие списания прекращаются после отмены либо иного прекращения платёжной подписки.",
    consentLabel:
      "Я согласен на регулярные списания на указанных условиях и подтверждаю подключение автопродления.",
  };
}
