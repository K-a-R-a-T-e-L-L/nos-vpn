"use client";

import { ActionIcon, useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { IconMoon, IconSun } from "@tabler/icons-react";

export default function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const mounted = useMounted();
  const currentScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: true,
  });
  const isDark = mounted && currentScheme === "dark";

  return (
    <ActionIcon
      variant="light"
      color={isDark ? "yellow" : "indigo"}
      size="lg"
      radius="xl"
      onClick={() => setColorScheme(isDark ? "light" : "dark")}
      aria-label="Toggle color scheme"
      title="Toggle color scheme"
    >
      {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
    </ActionIcon>
  );
}
