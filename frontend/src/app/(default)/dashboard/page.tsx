import { redirect } from "next/navigation";

import { getServerAuthUser } from "@/shared/lib/auth/server";
import DashboardPageClient from "@/widgets/pages/DashboardPage/DashboardPage.client";

export default async function DashboardPage() {
  const user = await getServerAuthUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  return <DashboardPageClient />;
}
