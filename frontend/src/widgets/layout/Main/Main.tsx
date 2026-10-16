import { AppShellMain, Container } from "@mantine/core";
import type { ReactNode } from "react";

import { APP_CONTAINER_SIZE } from "@/shared/lib/layout/container";
import styles from "./Main.module.css";

export default function Main({ children }: { children: ReactNode }) {
  return (
    <AppShellMain>
      <Container size={APP_CONTAINER_SIZE} className={styles.inner}>
        {children}
      </Container>
    </AppShellMain>
  );
}
