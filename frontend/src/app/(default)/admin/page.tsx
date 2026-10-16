import AdminPanel from "@/widgets/pages/AdminPage/AdminPanel.client";
import { requireAdminUser } from "@/shared/lib/auth/server";

export const metadata = {
  title: "Админка",
};

export default async function AdminPage() {
  const user = await requireAdminUser();
  const adminName =
    user.email ||
    (user.telegramUsername ? `@${user.telegramUsername}` : null) ||
    (user.telegramId ? `Telegram ID ${user.telegramId}` : null) ||
    "администратор";

  return <AdminPanel adminName={adminName} />;
}
