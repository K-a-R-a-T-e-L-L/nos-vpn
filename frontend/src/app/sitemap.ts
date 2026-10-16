import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const now = new Date();
  const paths = [
    "",
    "/about",
    "/earn",
    "/checkout",
    "/contacts",
    "/dashboard",
    "/docs",
    "/faq",
    "/login",
    "/payment/fail",
    "/payment/pending",
    "/payment/success",
    "/payments",
    "/privacy",
    "/refund",
    "/setup",
    "/subscription",
    "/support",
    "/tariffs",
    "/terms",
  ] as const;

  return paths.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.7,
  }));
}
