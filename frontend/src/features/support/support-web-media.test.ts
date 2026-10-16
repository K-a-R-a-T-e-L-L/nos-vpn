import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("support photo previews use authenticated private blob routes and revoke object URLs", () => {
  const client = source("../../shared/api/client.ts");
  const preview = source("./SupportPhotoPreview.tsx");

  assert.match(client, /export async function fetchAuthenticatedBlob/);
  assert.match(client, /buildRequestInit/);
  assert.match(client, /response\.blob\(\)/);
  assert.match(preview, /fetchAuthenticatedBlob/);
  assert.match(preview, /\/api\/support\/messages/);
  assert.match(preview, /\/api\/admin\/support\/messages/);
  assert.match(preview, /URL\.createObjectURL/);
  assert.match(preview, /URL\.revokeObjectURL/);
  assert.match(preview, /<Modal/);
  assert.match(preview, /Изображение недоступно/);
});

test("support upload input is JPEG/PNG/WebP-only with a browser advisory under the server limit", () => {
  const input = source("./SupportPhotoAttachmentInput.tsx");

  assert.match(input, /SUPPORT_PHOTO_MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(input, /image\/jpeg.*image\/png.*image\/webp/);
  assert.match(input, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(input, /Поддерживаются только JPEG, PNG и WebP/);
  assert.match(input, /10 МиБ/);
  assert.match(input, /URL\.revokeObjectURL/);
});

test("dashboard and admin support use multipart image adapters and private PHOTO rendering", () => {
  const accountApi = source("../../widgets/pages/shared/account/account.api.ts");
  const dashboardCard = source("../../widgets/pages/DashboardPage/sections/DashboardSupportCard.tsx");
  const adminApi = source("../../widgets/pages/AdminPage/admin.lib.ts");
  const adminHook = source("../admin/support/useAdminSupport.ts");
  const adminTab = source("../../widgets/pages/AdminPage/sections/AdminSupportTab.tsx");
  const dashboard = source("../../widgets/pages/DashboardPage/DashboardPage.client.tsx");

  assert.match(accountApi, /new FormData\(\)/);
  assert.match(accountApi, /\/support\/message\/photo/);
  assert.match(accountApi, /form\.set\("image"/);
  assert.match(accountApi, /Idempotency-Key/);
  assert.match(adminApi, /adminPostForm/);
  assert.match(adminHook, /\/api\/admin\/support\/threads\/\$\{threadId\}\/reply\/photo/);
  assert.match(adminHook, /form\.set\("image"/);
  assert.match(adminHook, /supportReplyPhotoRequestId/);
  assert.match(dashboard, /supportPhotoRequestId/);
  assert.match(dashboard, /setSupportPhotoRequestId\(file \? globalThis\.crypto\.randomUUID\(\) : null\)/);
  assert.match(adminHook, /setSupportReplyPhotoRequestId\(file \? globalThis\.crypto\.randomUUID\(\) : null\)/);
  assert.match(adminHook, /Idempotency-Key/);
  for (const view of [dashboardCard, adminTab]) {
    assert.match(view, /SupportPhotoPreview/);
    assert.match(view, /SupportPhotoAttachmentInput/);
    assert.doesNotMatch(view, /telegramFileId|file_unique_id/);
  }
});

test("generated support photo contracts expose one canonical idempotency header", () => {
  const userPhoto = source("../../shared/api/.generated/types/SupportControllerCreatePhotoMessage.ts");
  const adminPhoto = source("../../shared/api/.generated/types/AdminSupportControllerReplyPhoto.ts");

  for (const contract of [userPhoto, adminPhoto]) {
    assert.equal((contract.match(/\"Idempotency-Key\"/g) ?? []).length, 1);
    assert.doesNotMatch(contract, /\"idempotency-key\"/);
  }
});
