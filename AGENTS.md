# NOS VPN

One logical project: backend/ (NestJS/PostgreSQL/Telegraf), frontend/ (Next.js/React/Mantine). See README and docs. Keep one canonical local PROJECT_STATE.md and отчёт.txt for the whole project; both are ignored and must remain private.

- Preserve existing Git changes.
- Run lint, build and relevant tests in affected components. Backend integration tests need local PostgreSQL binaries.
- Never manually edit frontend/src/shared/api/.generated. Change backend contract, export OpenAPI, then generate frontend.
- Do not change database synchronization policy or introduce migrations without an explicit task.
- Keep credentials, personal data, internal reports, dumps and local absolute paths out of Git.
- Check processes/ports before servers; record and stop only task-owned PIDs. Never kill all Node processes.
- Preserve server-side authorization, private support attachments and verified payment status.
