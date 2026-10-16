import {
  Box,
  Button,
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import Image from "next/image";

import { LEGAL_NAV_LINKS } from "@/shared/config/legal";
import { Link } from "@/shared/lib/i18n/navigation";
import { APP_CONTAINER_SIZE } from "@/shared/lib/layout/container";
import { MEDIA } from "@/shared/lib/media";

import styles from "./Footer.module.css";

const productLinks = [
  { href: "/", label: "Ценность" },
  { href: "/tariffs", label: "Тарифы" },
  { href: "/setup", label: "Инструкции" },
  { href: "/earn", label: "Заработать" },
  { href: "/faq", label: "FAQ" },
] as const;

export default function Footer() {
  return (
    <Box component="footer" className={styles.footerRoot}>
      <Container size={APP_CONTAINER_SIZE} className={styles.footerContainer}>
        <SimpleGrid
          cols={{ base: 1, sm: 2, md: 3 }}
          spacing="xl"
          className={styles.footerGrid}
        >
          <Stack gap="md" className={styles.footerBrand}>
            <Group gap="sm">
              <Image
                src={MEDIA.images.logo}
                alt="NOS VPN"
                width={42}
                height={42}
                className={styles.logo}
              />
              <Stack gap={0}>
                <Title order={4}>NOS VPN</Title>
              </Stack>
            </Group>
            <Text size="sm" c="dimmed">
              NOS VPN помогает быстро подключить VPN через сайт. Приглашайте
              друзей, копите бонусные рубли и используйте их для оплаты.
            </Text>
            <Button
              component="a"
              href="/tariffs"
              variant="light"
              leftSection={<IconArrowRight size={18} />}
              className={`button-neon-soft ${styles.footerButton}`}
            >
              Выбрать тариф
            </Button>
          </Stack>

          <FooterColumn
            title="Навигация"
            links={productLinks}
            className={styles.footerColumn}
          />
          <FooterColumn
            title="Документы"
            links={LEGAL_NAV_LINKS}
            className={styles.footerColumn}
          />
        </SimpleGrid>

        <Divider />

        <Group justify="space-between" gap="md" className={styles.bottom}>
          <Text size="xs" c="dimmed">
            © 2026 NOS VPN
          </Text>
        </Group>
      </Container>
    </Box>
  );
}

function FooterColumn({
  title,
  links,
  className,
}: {
  title: string;
  links: readonly { href: string; label: string }[];
  className?: string;
}) {
  return (
    <Stack gap="sm" className={className}>
      <Text fw={700}>{title}</Text>
      <Stack gap={6}>
        {links.map((item, index) => (
          <Link
            key={`${item.href}-${index}`}
            href={item.href}
            className={styles.footerLink}
          >
            {item.label}
          </Link>
        ))}
      </Stack>
    </Stack>
  );
}
