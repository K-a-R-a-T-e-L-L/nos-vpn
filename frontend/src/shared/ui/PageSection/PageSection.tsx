import { Container } from "@mantine/core";
import type { ReactNode } from "react";

import { APP_CONTAINER_SIZE } from "@/shared/lib/layout/container";

type PageSectionProps = {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | number;
  pt?: number;
};

export function PageSection({ children, size = APP_CONTAINER_SIZE, pt }: PageSectionProps) {
  return (
    <section style={{ paddingBlock: "clamp(24px, 4vw, 44px)", paddingTop: `${pt}px` }}>
      <Container size={size}>{children}</Container>
    </section>
  );
}

export default PageSection;
