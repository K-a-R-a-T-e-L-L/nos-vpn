import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import RootProvider from "@/processes/providers/RootProvider";

export default function DefaultLayout({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ru" messages={{}}>
      <RootProvider locale="ru">{children}</RootProvider>
    </NextIntlClientProvider>
  );
}
