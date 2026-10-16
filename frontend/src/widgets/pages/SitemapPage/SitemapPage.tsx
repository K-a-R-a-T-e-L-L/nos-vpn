import { Button, SimpleGrid, Stack, Text } from "@mantine/core";

import SectionHeader from "@/shared/ui/SectionHeader/SectionHeader";

const links = [
  { href: "/", label: "Главная" },
  { href: "/tariffs", label: "Тарифы" },
  { href: "/login", label: "Вход и кабинет" },
  { href: "/dashboard", label: "Кабинет" },
  { href: "/setup", label: "Инструкции" },
  { href: "/faq", label: "FAQ" },
  { href: "/support", label: "Поддержка" },
  { href: "/privacy", label: "Конфиденциальность" },
  { href: "/terms", label: "Условия" },
  { href: "/refund", label: "Возвраты" },
] as const;

export default function SitemapPageView() {
  return (
    <Stack gap="xl">
      <SectionHeader
        eyebrow="Навигация"
        title="Карта сайта NOS VPN"
        text="Основные разделы сайта, кабинета, инструкций и юридических страниц."
      />

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {links.map((item) => (
          <Button key={item.href} component="a" href={item.href} variant="light" justify="space-between">
            {item.label}
          </Button>
        ))}
      </SimpleGrid>

      <Text c="dimmed" size="sm">
        Если раздел открывается только после входа, сайт сам перенаправит вас на авторизацию.
      </Text>
    </Stack>
  );
}
