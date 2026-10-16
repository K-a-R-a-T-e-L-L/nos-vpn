# NOS VPN

[RU](README.md) | **EN**

Source code of a discontinued VPN service: customer dashboard, admin panel, Telegram bot, subscriptions, payments, and Remnawave integration. Published to preserve the project and make its architecture and implementation available for study.

The service is closed. This repository does not provide VPN access, servers, a customer database, or working payment credentials. Addresses and contacts have been replaced with placeholders; integrations require your own configuration. Support and further development are not guaranteed.

## Repository structure

| Directory | Contents |
| --- | --- |
| backend/ | NestJS 10, TypeORM, PostgreSQL, Telegraf; REST API, bot, and background jobs |
| frontend/ | Next.js 16, React 19, Mantine, TanStack Query; customer dashboard and admin panel |
| docs/ | Setup, integrations, and architecture (in Russian) |

Features include plans and subscriptions, VPN provisioning through Remnawave, Platega/YooKassa payment flows, referrals and promo codes, financial analytics, support tickets with attachments, and Telegram account linking.

## Run locally

You need Node.js 22.18+ and npm, plus PostgreSQL or Docker Compose for the database. Install each component's dependencies separately using its lockfile.

```sh
git clone https://github.com/K-a-R-a-T-e-L-L/nos-vpn.git
cd nos-vpn
docker compose up -d db
npm --prefix backend ci
npm --prefix frontend ci
```

Copy `backend/.env.example` to `backend/.env`, and `frontend/.env.example` to `frontend/.env`. Use `Copy-Item` in PowerShell or `cp` on Linux/macOS.

From the repository root, start the applications in two terminals:

```sh
npm --prefix backend run start:dev
```

```sh
npm --prefix frontend run dev
```

Website: <http://localhost:3000>. API: <http://localhost:3200/api>. Swagger: <http://localhost:3200/api-docs>. The Compose database listens only on `127.0.0.1:5433`.

The example configuration is for local exploration: bot polling is disabled, the VPN panel and Platega use nonexistent addresses, and optional payment features are disabled. VPN access, Telegram sign-in, and payments require your own infrastructure. Use a new, empty database: `DB_SYNCHRONIZE=true` automatically synchronizes its schema.

Before configuring your own service, replace the contact placeholders in `backend/src/bot/bot-legal.ts`, `backend/src/bot/bot.constants.ts`, and `frontend/src/shared/config/legal.ts`. Configure your own bot, Remnawave panel, payment accounts, and support channels. Production requires separate support/log Telegram chat IDs and a private, writable support-media directory. The supplied environment examples are not production configuration.

More details, in Russian: [setup](docs/SETUP.md), [architecture](docs/ARCHITECTURE.md).

## Checks

```sh
npm --prefix backend run lint
npm --prefix backend run build
npm --prefix backend test -- --runInBand
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
```

Backend tests require a local PostgreSQL installation with `initdb` and `pg_ctl`; they create temporary databases. Set `POSTGRES_BIN_DIR` if needed. The Compose container does not replace those local binaries.

This repository starts from a fresh source snapshot. Operational history, real `.env` files, personal data, database dumps, and CI/CD configuration are excluded. There are no automated builds or deployments, and GitHub Actions is disabled. This is a source-code example; readers can run the documented commands manually. Nothing is connected to Dokploy.
