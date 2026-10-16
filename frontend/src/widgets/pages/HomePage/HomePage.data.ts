import {
  IconBrandAndroid,
  IconBrandApple,
  IconBrandTelegram,
  IconBrandWindows,
  IconCheck,
  IconCreditCard,
  IconDeviceLaptop,
  IconGift,
  IconHeadset,
  IconLink,
  IconQrcode,
  IconShieldCheck,
  IconSparkles,
  IconStatusChange,
  IconWallet,
  type TablerIcon,
} from "@tabler/icons-react";

import { SERVICE_LINKS } from "@/shared/config/legal";

export type HomeCardItem = {
  title: string;
  text: string;
  icon: TablerIcon;
};

export type HomeScenarioStep = {
  title: string;
  text: string;
  actions: {
    label: string;
    href: string;
    variant?: "filled" | "light" | "subtle";
    external?: boolean;
  }[];
};

export type HomeScenarioOption = {
  id: string;
  title: string;
  text: string;
  steps: HomeScenarioStep[];
};

const TELEGRAM_BOT_ENTRY_URL = SERVICE_LINKS.telegramBot;

export const heroMetrics = [
  { value: "2 мин", label: "на подключение" },
  { value: "10", label: "устройств в одном аккаунте" },
  { value: "24/7", label: "кабинет и доступ" },
] as const;

export const heroBullets = [
  "Работает без Telegram",
  "VPN на смартфон, ноутбук и компьютер",
  "QR-код и ссылка сразу после оплаты в личном кабинете",
  "Поддержка рядом, если не получится подключиться",
] as const;

export const heroStepCards = [
  "Выберите период",
  "Укажите устройства",
  "Оплатите тариф",
  "Получите ссылку и QR-код",
] as const;

export const urgencyPoints = [
  {
    title: "Telegram не открывается",
    text: "Можно создать аккаунт на сайте, оплатить тариф и получить доступ без входа в бота.",
    icon: IconBrandTelegram,
  },
  {
    title: "Не хочется разбираться в настройках",
    text: "В кабинете есть понятные инструкции для каждой платформы.",
    icon: IconQrcode,
  },
  {
    title: "Нужно подключить несколько устройств",
    text: "Выбираете количество устройств: телефон, ноутбук, компьютер и другие.",
    icon: IconShieldCheck,
  },
  {
    title: "Потом удобно управлять через Telegram",
    text: "Когда Telegram заработает, просто привяжите бота к тому же аккаунту.",
    icon: IconStatusChange,
  },
] as const;

export const scenarioOptions: HomeScenarioOption[] = [
  {
    id: "site-signup",
    title: "Telegram не открывается",
    text: "Регистрация на сайте, оплата, ссылка доступа и QR-код в кабинете.",
    steps: [
      {
        title: "Создайте аккаунт на сайте",
        text: "Начните с личного кабинета: он сохранит оплату, доступ и устройства в одном аккаунте, даже если Telegram сейчас не открывается.",
        actions: [
          { label: "Создать аккаунт", href: "/login", variant: "filled" },
        ],
      },
      {
        title: "Выберите подходящий тариф",
        text: "Определите срок подписки и количество устройств, затем оплатите доступ удобным способом прямо на сайте.",
        actions: [
          { label: "Выбрать тариф", href: "/tariffs", variant: "filled" },
        ],
      },
      {
        title: "Получите ссылку и инструкцию",
        text: "После оплаты в кабинете появятся персональная ссылка доступа, QR-код и короткие инструкции для iPhone, Android, Windows и macOS.",
        actions: [
          { label: "Открыть инструкции", href: "/setup", variant: "light" },
        ],
      },
      {
        title: "Подключите устройство",
        text: "Откройте любой совместимый клиент, импортируйте ссылку или QR-код и включите VPN без дополнительных настроек.",
        actions: [],
      },
    ],
  },
  {
    id: "telegram-bot",
    title: "Telegram работает",
    text: "Вход через Telegram, пробный старт при доступности, управление в боте.",
    steps: [
      {
        title: "Откройте Telegram-бота",
        text: "Если Telegram работает, проще всего начать через бота: там сразу доступны вход, выбор тарифа и дальнейшее управление доступом.",
        actions: [
          {
            label: "Перейти в Telegram",
            href: TELEGRAM_BOT_ENTRY_URL,
            variant: "filled",
            external: true,
          },
        ],
      },
      {
        title: "Выберите тариф и оформите доступ",
        text: "Подберите срок подписки и количество устройств, затем оплатите тариф в привычном Telegram-сценарии.",
        actions: [
          { label: "Открыть тарифы", href: "/tariffs", variant: "light" },
        ],
      },
      {
        title: "Откройте инструкцию для своего устройства",
        text: "После оплаты останется только выбрать платформу и пройти короткие шаги подключения без технической рутины.",
        actions: [
          { label: "Смотреть инструкции", href: "/setup", variant: "light" },
        ],
      },
      {
        title: "Подключите VPN",
        text: "Скопируйте ссылку доступа или импортируйте QR-код в клиент и включите защищённое соединение.",
        actions: [],
      },
    ],
  },
  {
    id: "connect-device",
    title: "Хочу подключить устройство",
    text: "Выбираете платформу и открываете короткую инструкцию.",
    steps: [
      {
        title: "Выберите удобный способ старта",
        text: "Можно сразу перейти в Telegram-бота или создать аккаунт на сайте, если хотите пройти весь путь через веб-кабинет.",
        actions: [
          {
            label: "Открыть Telegram",
            href: TELEGRAM_BOT_ENTRY_URL,
            variant: "filled",
            external: true,
          },
          { label: "Создать аккаунт", href: "/login", variant: "light" },
        ],
      },
      {
        title: "Подберите тариф под свои устройства",
        text: "Выберите подходящий план по сроку и числу подключений, чтобы сразу активировать нужный объём доступа.",
        actions: [
          { label: "Посмотреть тарифы", href: "/tariffs", variant: "filled" },
        ],
      },
      {
        title: "Откройте нужную инструкцию",
        text: "Для каждой платформы уже подготовлены понятные шаги, поэтому подключение не превращается в поиск по документации.",
        actions: [
          { label: "Перейти к инструкциям", href: "/setup", variant: "light" },
        ],
      },
      {
        title: "Подключите устройство за пару минут",
        text: "Импортируйте ссылку доступа или QR-код в клиент и запустите VPN на нужном устройстве.",
        actions: [],
      },
    ],
  },
] as const;

export const quickStartSteps = [
  "Создайте аккаунт через сайт или Telegram, если он доступен.",
  "Выберите тариф: срок подписки и количество устройств.",
  "Получите доступ: ссылка подключения и QR-код появятся в кабинете.",
  "Откройте инструкцию для своего устройства и включите VPN.",
] as const;

export const homeBenefits: HomeCardItem[] = [
  {
    title: "Персональная ссылка доступа",
    text: "Скопируйте ссылку или откройте QR-код для подключения устройства.",
    icon: IconLink,
  },
  {
    title: "Статус подписки",
    text: "Видно тариф, дату окончания, количество устройств и статус доступа.",
    icon: IconStatusChange,
  },
  {
    title: "Оплата и продление",
    text: "Продлевайте доступ и меняйте тариф без лишних шагов прямо на сайте.",
    icon: IconCreditCard,
  },
  {
    title: "Telegram-привязка",
    text: "После подключения VPN можно связать сайт и бота с одним аккаунтом.",
    icon: IconBrandTelegram,
  },
  {
    title: "Кошелек и бонусы",
    text: "Приглашайте друзей, копите бонусные рубли и используйте их для оплаты.",
    icon: IconWallet,
  },
  {
    title: "Поддержка рядом",
    text: "Если возник конфликт аккаунтов или не получилось подключиться, поможем.",
    icon: IconHeadset,
  },
];

export const deviceItems: HomeCardItem[] = [
  {
    title: "iPhone / iOS",
    text: "Откройте ссылку доступа на iPhone и добавьте профиль в совместимый VPN-клиент.",
    icon: IconBrandApple,
  },
  {
    title: "Android",
    text: "Скопируйте ссылку доступа и подключите VPN по инструкции для Android.",
    icon: IconBrandAndroid,
  },
  {
    title: "Windows",
    text: "Добавьте ссылку доступа в приложение и обновите список подключений.",
    icon: IconBrandWindows,
  },
  {
    title: "macOS",
    text: "Подключите подписку в клиенте и проверьте статус доступа на Mac.",
    icon: IconDeviceLaptop,
  },
];

export const referralSteps = [
  {
    title: "Скопируйте свою ссылку",
    text: "Она доступна в кабинете после регистрации.",
  },
  {
    title: "Друг оплачивает подписку",
    text: "Система фиксирует приглашение и оплату.",
  },
  {
    title: "Бонус приходит в кошелек",
    text: "Используйте для продления или вывода через поддержку.",
  },
] as const;

export const trustItems: HomeCardItem[] = [
  {
    title: "Доступ закреплен за аккаунтом",
    text: "Подписка, ссылка и устройства сразу привязываются к вашему кабинету после оплаты.",
    icon: IconShieldCheck,
  },
  {
    title: "Telegram подключается позже",
    text: "Если бот нужен не сразу, он потом подхватит уже действующую подписку.",
    icon: IconBrandTelegram,
  },
];

export const homeFaqItems = [
  {
    value: "telegram-down",
    question: "Можно ли купить VPN, если Telegram не работает?",
    answer:
      "Да. Создайте аккаунт на сайте, выберите тариф, оплатите подписку и получите ссылку доступа в личном кабинете.",
  },
  {
    value: "telegram-link",
    question: "Можно ли потом привязать Telegram?",
    answer:
      "Да. Когда VPN уже будет работать, откройте Telegram и привяжите бота к тому же аккаунту.",
  },
  {
    value: "devices",
    question: "На каких устройствах работает NOS VPN?",
    answer:
      "iPhone, Android, Windows и macOS. Для каждой платформы предусмотрена отдельная инструкция.",
  },
  {
    value: "account-why",
    question: "Почему нельзя оплатить без аккаунта?",
    answer:
      "Чтобы доступ и подписка оставались привязаны к вам, а не терялись после оплаты.",
  },
  {
    value: "after-link",
    question: "Что будет с подпиской после привязки Telegram?",
    answer:
      "Подписка не пропадет. Бот увидит тот же тариф, срок действия и статус доступа.",
  },
] as const;

export const finalMetrics = [
  {
    title: "Работает даже когда Telegram мешает старту",
    text: "Основной сценарий построен через сайт, поэтому доступ можно получить сразу.",
    icon: IconCheck,
  },
  {
    title: "Реферальный бонус до 50%",
    text: "Оплаты приглашенных пользователей возвращают часть стоимости в ваш кошелек.",
    icon: IconGift,
  },
  {
    title: "Сценарий без лишних шагов",
    text: "Оплата, ссылка, QR-код и управление доступны из одной панели.",
    icon: IconSparkles,
  },
] as const;
