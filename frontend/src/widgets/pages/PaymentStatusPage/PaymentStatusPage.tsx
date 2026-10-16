import { IconAlertCircle, IconCircleCheck, IconClock } from "@tabler/icons-react";

import { PageSection } from "@/shared/ui/PageSection/PageSection";
import PaymentStatusCard from "@/shared/ui/PaymentStatusCard/PaymentStatusCard";

type PaymentStatus = "success" | "activation" | "pending" | "fail" | "unknown" | "retry";

type PaymentStatusPageProps = {
  status: PaymentStatus;
  autoRenewEnabled?: boolean | null;
};

const content: Record<
  PaymentStatus,
  {
    title: string;
    text: string;
    primaryAction: string;
    primaryHref: string;
    secondaryAction?: string;
    secondaryHref?: string;
    color: "brandCyan" | "brandOrange" | "brandMagenta";
    icon: typeof IconCircleCheck;
  }
> = {
  success: {
    title: "Оплата прошла успешно",
    text: "Подписка активируется автоматически. Ссылка доступа появится в кабинете сразу после подтверждения платежа. После активации вы сможете приглашать друзей и получать 50% с каждой их оплаты в кошелёк.",
    primaryAction: "Открыть кабинет",
    primaryHref: "/dashboard",
    secondaryAction: "Инструкции",
    secondaryHref: "/setup",
    color: "brandCyan",
    icon: IconCircleCheck,
  },
  activation: {
    title: "Оплата подтверждена",
    text: "Платёж успешно подтверждён. Мы завершаем активацию доступа; страница обновится автоматически.",
    primaryAction: "Открыть кабинет",
    primaryHref: "/dashboard",
    secondaryAction: "Поддержка",
    secondaryHref: "/support",
    color: "brandCyan",
    icon: IconClock,
  },
  pending: {
    title: "Платёж ещё проверяется",
    text: "Обычно подтверждение занимает немного времени. Если статус долго не меняется, откройте кабинет или напишите в поддержку.",
    primaryAction: "Открыть кабинет",
    primaryHref: "/dashboard",
    secondaryAction: "Поддержка",
    secondaryHref: "/support",
    color: "brandOrange",
    icon: IconClock,
  },
  fail: {
    title: "Оплата не завершена",
    text: "Платёж не был подтверждён. Вы можете вернуться к выбору тарифа и попробовать снова или обратиться в поддержку.",
    primaryAction: "Выбрать тариф",
    primaryHref: "/tariffs",
    secondaryAction: "Поддержка",
    secondaryHref: "/support",
    color: "brandMagenta",
    icon: IconAlertCircle,
  },
  unknown: {
    title: "Результат создания уточняется",
    text: "Не создавайте новый платёж: мы безопасно проверяем результат предыдущего запроса.",
    primaryAction: "Открыть кабинет",
    primaryHref: "/dashboard",
    secondaryAction: "Поддержка",
    secondaryHref: "/support",
    color: "brandOrange",
    icon: IconClock,
  },
  retry: {
    title: "Проверка временно недоступна",
    text: "Платёж не потерян. Мы повторим проверку автоматически; попробуйте открыть кабинет чуть позже.",
    primaryAction: "Открыть кабинет",
    primaryHref: "/dashboard",
    secondaryAction: "Поддержка",
    secondaryHref: "/support",
    color: "brandOrange",
    icon: IconAlertCircle,
  },
};

export default function PaymentStatusPageView({ status, autoRenewEnabled }: PaymentStatusPageProps) {
  const item = content[status];
  const successText = autoRenewEnabled === true
    ? "Оплата прошла успешно. Автопродление включено — способ оплаты сохранён в ЮKassa."
    : autoRenewEnabled === false
      ? "Оплата прошла успешно. Автопродление не включено."
      : item.text;

  return (
    <PageSection size="md">
      <PaymentStatusCard
        title={item.title}
        text={status === "success" ? successText : item.text}
        icon={item.icon}
        color={item.color}
        primaryAction={item.primaryAction}
        primaryHref={item.primaryHref}
        secondaryAction={status === "success" ? "Управление подпиской" : item.secondaryAction}
        secondaryHref={status === "success" ? "/subscription" : item.secondaryHref}
      />
    </PageSection>
  );
}
