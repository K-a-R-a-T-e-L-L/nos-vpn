import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";

import { themeMantine } from "@/shared/lib/theme/mantine/theme";
import Footer from "@/widgets/layout/Footer/Footer";
import Header from "@/widgets/layout/Header/Header";
import Main from "@/widgets/layout/Main/Main";
import Wrapper from "@/widgets/layout/Wrapper/Wrapper";
import AppClientProviders from "./AppClientProviders";

export default function RootProvider({ children }: { children: ReactNode; locale?: string }) {
  return (
    <MantineProvider theme={themeMantine} defaultColorScheme="dark" forceColorScheme="dark">
      <AppClientProviders>
        <Wrapper>
          <Header />
          <Main>{children}</Main>
          <Footer />
        </Wrapper>
      </AppClientProviders>
    </MantineProvider>
  );
}
