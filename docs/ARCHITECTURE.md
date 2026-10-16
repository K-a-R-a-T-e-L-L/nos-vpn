# Архитектура

Браузер обращается к NestJS через frontend/src/shared/api/client.ts. Префикс API — /api. Telegram-бот использует те же доменные сервисы. PostgreSQL хранит пользователей, планы, подписки, платежи, обращения и аналитику. Remnawave отвечает за VPN-доступ, платёжные провайдеры — за проведение платежей.

Основные модули backend: system/user, bot, payment, subscription, vpn-provider, vpn-access, analytics, promo, support, notification и billing. Доступ выдаётся после серверного подтверждения оплаты. Админские операции проверяют роль ADMIN; вложения доступны владельцу обращения или администратору.

Frontend: App Router, страницы в src/widgets/pages, доменная логика в src/features, API и конфигурация в src/shared. Разделы: login, dashboard, tariffs, checkout, support, payment, legal; /admin содержит пользователей, тарифы, промокоды, финансы, рефералы и поддержку.

## Контракт API

frontend/openapi.json — сохранённый контракт; frontend/src/shared/api/.generated создан Kubb и не редактируется вручную. После изменения backend DTO/controller выполните:

```sh
npm --prefix backend run openapi:generate
npm --prefix frontend run generate
npm --prefix frontend run lint
npm --prefix frontend run build
```

Backend пишет snapshot в соседнюю папку frontend. Kubb по умолчанию читает локальный snapshot; для живого Swagger задайте OPENAPI_PATH=remote и API_DOCS_URL. Без изменения контракта перегенерация не нужна.

По умолчанию используется TypeORM synchronize для новой локальной базы. Имеющиеся YooKassa migration/preflight scripts не запускаются автоматически при обычном старте. Пакеты и lockfile раздельные; корневого npm workspace нет.

## Ограничения

Это снимок закрытого сервиса, а не комплект VPN-инфраструктуры. Провайдеров нужно проверять на своих тестовых аккаунтах. Telegram не поддерживает идемпотентный ключ отправки: сбой между отправкой и сохранением результата может привести к повторному уведомлению. Production query plans, reverse proxy и права хранилища зависят от окружения.
