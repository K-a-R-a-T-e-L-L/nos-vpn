import { AppShell } from "@mantine/core";
import type { ReactNode } from "react";

export default function Wrapper({ children }: { children: ReactNode }) {
  return (
    <AppShell w="100%" bg="transparent" header={{ height: 72 }}>
      {children}
    </AppShell>
  );
}
