import {
  IconBrandAndroid,
  IconBrandApple,
  IconBrandWindows,
  IconDeviceDesktop,
  type TablerIcon,
} from "@tabler/icons-react";

export type SetupDownload = {
  href: string;
  label: string;
};

export type SetupClient = {
  id: string;
  name: string;
  iconText: string;
  description: string;
  details: string;
  recommended?: boolean;
  downloads: SetupDownload[];
};

export type SetupPlatform = {
  id: "ios" | "android" | "windows" | "macos";
  title: string;
  icon: TablerIcon;
  summary: string;
  steps: string[];
  clients: SetupClient[];
};

export const setupPlatforms: SetupPlatform[] = [
  {
    id: "ios",
    title: "iOS",
    icon: IconBrandApple,
    summary:
      "На iPhone откройте один из совместимых клиентов, вставьте ссылку доступа или импортируйте QR-код и включите VPN.",
    steps: [
      "Откройте кабинет и скопируйте ссылку доступа.",
      "Установите клиент из App Store.",
      "Добавьте подписку по ссылке или QR-коду.",
      "Разрешите VPN-профиль и включите подключение.",
    ],
    clients: [
      {
        id: "incy",
        name: "INCY",
        iconText: "IN",
        description: "Новый легкий клиент с прямой установкой из App Store.",
        details: "Подходит для быстрого старта и простого импорта подписки без лишних настроек.",
        recommended: true,
        downloads: [{ label: "App Store", href: "https://apps.apple.com/ru/app/incy/id6756943388" }],
      },
      {
        id: "karing-ios",
        name: "Karing",
        iconText: "KA",
        description: "Стабильный вариант, если нужен привычный clash-совместимый интерфейс.",
        details: "Удобен как запасной клиент, если вы уже пользовались Karing на других устройствах.",
        downloads: [{ label: "App Store", href: "https://apps.apple.com/us/app/karing/id6472431552" }],
      },
      {
        id: "streisand",
        name: "Streisand",
        iconText: "ST",
        description: "Рабочий вариант для импорта подписки по ссылке на iPhone.",
        details: "Подходит как альтернативный клиент, если вам привычен его интерфейс.",
        downloads: [{ label: "App Store", href: "https://apps.apple.com/us/app/streisand/id6450534064" }],
      },
      {
        id: "happ-ios",
        name: "Happ",
        iconText: "HP",
        description: "Более мощный клиент с расширенными возможностями и правилами.",
        details: "Подойдет, если нужен больший контроль над профилями и сетевыми сценариями.",
        downloads: [{ label: "App Store", href: "https://apps.apple.com/us/app/happ-proxy-utility/id6504287215" }],
      },
    ],
  },
  {
    id: "android",
    title: "Android",
    icon: IconBrandAndroid,
    summary:
      "На Android можно подключиться через Google Play или APK из GitHub, а затем импортировать ссылку доступа в клиент.",
    steps: [
      "Скопируйте ссылку доступа из кабинета.",
      "Установите выбранный клиент.",
      "Импортируйте подписку по ссылке или QR-коду.",
      "Обновите профиль и включите VPN.",
    ],
    clients: [
      {
        id: "flclashx-android",
        name: "FlClashX",
        iconText: "FX",
        description: "Главная рекомендация для Android из текущего набора клиентов.",
        details: "Быстрый импорт подписки, понятный интерфейс и актуальная Android-сборка.",
        recommended: true,
        downloads: [
          {
            label: "APK",
            href: "https://github.com/pluralplay/FlClashX/releases/download/v0.3.2/FlClashX-android-universal.apk",
          },
        ],
      },
      {
        id: "singbox-android",
        name: "sing-box",
        iconText: "SB",
        description: "Официальная Android-ветка sing-box.",
        details: "Подходит, если хотите использовать оригинальный клиент экосистемы sing-box.",
        downloads: [{ label: "GitHub", href: "https://github.com/SagerNet/sing-box-for-android" }],
      },
      {
        id: "clashmeta-android",
        name: "Clash Meta",
        iconText: "CM",
        description: "Актуальная Android-сборка Clash Meta.",
        details: "Хороший вариант для тех, кто предпочитает clash-подобные клиенты на Android.",
        downloads: [
          {
            label: "APK",
            href: "https://github.com/MetaCubeX/ClashMetaForAndroid/releases/download/v2.11.30/cmfa-2.11.30-meta-universal-release.apk",
          },
        ],
      },
      {
        id: "v2raytun-android",
        name: "v2RayTun",
        iconText: "V2",
        description: "Простой мобильный клиент из Google Play.",
        details: "Подойдет как запасной вариант, если нужен максимально прямой старт с QR-кодом.",
        downloads: [{ label: "Google Play", href: "https://play.google.com/store/apps/details?id=com.v2raytun.android" }],
      },
      {
        id: "karing-android",
        name: "Karing",
        iconText: "KA",
        description: "Стабильный кроссплатформенный клиент.",
        details: "Удобен, если хотите похожий клиент на iPhone, Android и компьютере.",
        downloads: [
          {
            label: "APK",
            href: "https://github.com/KaringX/karing/releases/download/v1.2.20.2308/karing_1.2.20.2308_android_arm64-v8a.apk",
          },
        ],
      },
      {
        id: "happ-android",
        name: "Happ",
        iconText: "HP",
        description: "Android-версия Happ с расширенными возможностями.",
        details: "Подойдет тем, кому нужен более мощный клиент с гибкой настройкой правил.",
        downloads: [{ label: "APK", href: "https://github.com/Happ-proxy/happ-android/releases/download/3.24.1/Happ.apk" }],
      },
    ],
  },
  {
    id: "windows",
    title: "Windows",
    icon: IconBrandWindows,
    summary:
      "Для Windows выберите нужный клиент и сразу скачайте установщик под вашу архитектуру.",
    steps: [
      "Установите клиент под Windows.",
      "Скопируйте ссылку доступа из кабинета.",
      "Импортируйте подписку в приложение.",
      "Обновите профиль и включите VPN.",
    ],
    clients: [
      {
        id: "flclashx-windows",
        name: "FlClashX",
        iconText: "FX",
        description: "Один из самых удобных вариантов для Windows.",
        details: "Подходит для быстрого старта и нормального управления профилями.",
        recommended: true,
        downloads: [
          {
            label: "Скачать",
            href: "https://github.com/pluralplay/FlClashX/releases/download/v0.3.2/FlClashX-windows-amd64-setup.exe",
          },
        ],
      },
      {
        id: "koala-windows",
        name: "Koala Clash",
        iconText: "KC",
        description: "Свежий clash-клиент с отдельными сборками под Windows.",
        details: "Хороший вариант, если нужен современный интерфейс и прямые инсталляторы.",
        recommended: true,
        downloads: [
          {
            label: "Скачать",
            href: "https://github.com/coolcoala/koala-clash/releases/download/1.3.1/Koala.Clash_x64-setup.exe",
          }
        ],
      },
      {
        id: "prizrak-windows",
        name: "Prizrak-Box",
        iconText: "PB",
        description: "Еще один актуальный клиент с прямыми Windows-сборками.",
        details: "Подходит как альтернативный выбор, если хотите попробовать другой интерфейс.",
        recommended: true,
        downloads: [
          {
            label: "Скачать",
            href: "https://github.com/legiz-ru/Prizrak-Box/releases/download/v1.0.20/windows-amd64-Setup.exe",
          },
        ],
      },
      {
        id: "karing-windows",
        name: "Karing",
        iconText: "KA",
        description: "Универсальный клиент с прямым `.exe` под x64.",
        details: "Подходит, если хотите тот же клиент, что и на мобильных устройствах.",
        downloads: [
          {
            label: "Intel / x64",
            href: "https://github.com/KaringX/karing/releases/download/v1.2.20.2308/karing_1.2.20.2308_windows_x64.exe",
          },
        ],
      },
      {
        id: "happ-windows",
        name: "Happ",
        iconText: "HP",
        description: "Desktop-клиент Happ с прямыми установщиками под Windows.",
        details: "Более технический вариант, если нужен расширенный набор возможностей.",
        downloads: [
          {
            label: "Скачать",
            href: "https://github.com/Happ-proxy/happ-desktop/releases/download/2.18.3/setup-Happ.x64.exe",
          }
        ],
      },
    ],
  },
  {
    id: "macos",
    title: "macOS",
    icon: IconDeviceDesktop,
    summary:
      "На macOS лучше сразу отдавать прямые ссылки под Intel и Apple Silicon, чтобы не искать нужную сборку вручную.",
    steps: [
      "Выберите клиент под macOS.",
      "Скачайте подходящую сборку: Intel или Silicon.",
      "Добавьте ссылку доступа из кабинета.",
      "Разрешите системный VPN-профиль и включите соединение.",
    ],
    clients: [
      {
        id: "flclashx-macos",
        name: "FlClashX",
        iconText: "FX",
        description: "Одна из лучших опций для macOS из текущего набора.",
        details: "Есть отдельные прямые сборки под Intel и Apple Silicon.",
        recommended: true,
        downloads: [
          {
            label: "Intel",
            href: "https://github.com/pluralplay/FlClashX/releases/download/v0.3.2/FlClashX-macos-amd64.dmg",
          },
          {
            label: "Silicon",
            href: "https://github.com/pluralplay/FlClashX/releases/download/v0.3.2/FlClashX-macos-arm64.dmg",
          },
        ],
      },
      {
        id: "koala-macos",
        name: "Koala Clash",
        iconText: "KC",
        description: "Современный clash-клиент с двумя прямыми `.pkg`.",
        details: "Подходит, если нужен отдельный установщик под нужную архитектуру Mac.",
        recommended: true,
        downloads: [
          {
            label: "Intel",
            href: "https://github.com/coolcoala/koala-clash/releases/download/1.3.1/Koala.Clash_x64.pkg",
          },
          {
            label: "Silicon",
            href: "https://github.com/coolcoala/koala-clash/releases/download/1.3.1/Koala.Clash_arm64.pkg",
          },
        ],
      },
      {
        id: "prizrak-macos",
        name: "Prizrak-Box",
        iconText: "PB",
        description: "Есть отдельные zip-сборки под обе архитектуры macOS.",
        details: "Хорошая альтернативная опция, если хочется другой клиент.",
        recommended: true,
        downloads: [
          {
            label: "Intel",
            href: "https://github.com/legiz-ru/Prizrak-Box/releases/download/v1.0.20/macos-amd64.zip",
          },
          {
            label: "Silicon",
            href: "https://github.com/legiz-ru/Prizrak-Box/releases/download/v1.0.20/macos-arm64.zip",
          },
        ],
      },
      {
        id: "happ-macos",
        name: "Happ",
        iconText: "HP",
        description: "У Happ на macOS сейчас универсальная сборка.",
        details: "Подходит, если вы предпочитаете Happ и готовы использовать universal DMG.",
        downloads: [
          {
            label: "Universal",
            href: "https://github.com/Happ-proxy/happ-desktop/releases/download/2.18.3/Happ.macOS.universal.dmg",
          },
        ],
      },
    ],
  },
];

export const setupIntroSteps = [
  "Создайте аккаунт и оплатите тариф.",
  "Откройте личный кабинет и найдите свою ссылку доступа.",
  "Выберите приложение под свое устройство.",
  "Импортируйте ссылку или откройте QR-код в выбранном клиенте.",
  "Включите подключение и проверьте, что доступ работает.",
] as const;
