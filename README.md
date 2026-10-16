# NOS VPN

**RU** | [EN](README.en.md)

Исходники закрытого VPN-сервиса: личный кабинет, админка, Telegram-бот, подписки, платежи и интеграция с Remnawave. Проект опубликован как техническое наследие — для изучения архитектуры и реализации.

Сам сервис закрыт. Репозиторий не предоставляет VPN-доступ, серверы, пользовательскую базу или рабочие платёжные реквизиты. Адреса и контакты заменены примерами; интеграции требуют собственной настройки. Поддержка и дальнейшее развитие не гарантируются.

## Состав

| Каталог | Содержимое |
| --- | --- |
| backend/ | NestJS 10, TypeORM, PostgreSQL, Telegraf; REST API, бот и фоновые задачи |
| frontend/ | Next.js 16, React 19, Mantine, TanStack Query; кабинет и админка |
| docs/ | Запуск, интеграции и архитектура |

Реализованы тарифы и подписки, выдача доступа через Remnawave, платежи Platega/YooKassa, рефералы и промокоды, финансовая аналитика, поддержка с вложениями и связь сайта с Telegram.

## Локальный запуск

Нужны Node.js 22.18+ и npm, PostgreSQL или Docker Compose для базы. Зависимости частей устанавливаются отдельно по их lockfile.

```sh
git clone https://github.com/K-a-R-a-T-e-L-L/nos-vpn.git
cd nos-vpn
docker compose up -d db
npm --prefix backend ci
npm --prefix frontend ci
```

Скопируйте backend/.env.example в backend/.env, а frontend/.env.example в frontend/.env. В PowerShell используйте Copy-Item, в Linux/macOS — cp.

В двух терминалах из корня:

```sh
npm --prefix backend run start:dev
```

```sh
npm --prefix frontend run dev
```

Сайт: <http://localhost:3000>. API: <http://localhost:3200/api>. Swagger: <http://localhost:3200/api-docs>. PostgreSQL из Compose слушает только 127.0.0.1:5433.

Пример предназначен для локального ознакомления: polling бота выключен, внешняя VPN-панель и Platega указывают на несуществующие адреса, дополнительные платёжные функции выключены. VPN, Telegram-вход и платежи без своей инфраструктуры не работают. Используйте новую пустую базу: DB_SYNCHRONIZE=true автоматически синхронизирует схему.

Подробнее: [настройка](docs/SETUP.md), [архитектура](docs/ARCHITECTURE.md).

## Проверки

```sh
npm --prefix backend run lint
npm --prefix backend run build
npm --prefix backend test -- --runInBand
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
```

Для backend-тестов нужна локальная установка PostgreSQL с initdb и pg_ctl: тесты поднимают временные базы. При необходимости задайте POSTGRES_BIN_DIR. Контейнер Compose не заменяет эти локальные бинарники.

Репозиторий начинается с нового снимка исходников. История эксплуатации, реальные .env, персональные данные, дампы и настройки CI/CD не включены. Автоматических сборок и развёртывания нет: это пример исходников. Все команды запуска выполняются вручную по желанию читателя.
