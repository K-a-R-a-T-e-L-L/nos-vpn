import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { routing } from "./routing";

const namespaces = [
  "common",
  "nav",
  "home",
  "about",
  "docs",
  "faq",
  "privacy",
  "terms",
  "sitemap",
  "footer",
] as const;

const parseJson = (raw: string) => JSON.parse(raw.replace(/^\uFEFF/, ""));

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const messagesEntries = await Promise.all(
    namespaces.map(async (namespace) => {
      const filePath = path.join(
        process.cwd(),
        "public",
        "locales",
        locale,
        `${namespace}.json`,
      );
      const fileContent = await readFile(filePath, "utf8");
      return [namespace, parseJson(fileContent)] as const;
    }),
  );

  return {
    locale,
    messages: Object.fromEntries(messagesEntries),
  };
});
