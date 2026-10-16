import { Suspense } from "react";
import { redirect } from "next/navigation";

import { getServerAuthUser } from "@/shared/lib/auth/server";
import LoginPageClient from "@/widgets/pages/LoginPage/LoginPage.client";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

function sanitizeNextPath(value: string | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getServerAuthUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (user) {
    redirect(sanitizeNextPath(resolvedSearchParams?.next, "/dashboard"));
  }

  return (
    <Suspense>
      <LoginPageClient />
    </Suspense>
  );
}
