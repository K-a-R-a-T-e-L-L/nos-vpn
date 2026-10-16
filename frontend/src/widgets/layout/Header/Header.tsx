import { AppShellHeader, Container, Group, Text } from "@mantine/core";
import Image from "next/image";

import { Link } from "@/shared/lib/i18n/navigation";
import { APP_CONTAINER_SIZE } from "@/shared/lib/layout/container";
import { MEDIA } from "@/shared/lib/media";

import HeaderActions from "./HeaderActions.client";
import styles from "./Header.module.css";

const links = [
  // { href: "/", label: "Ценность" },
  // { href: "/", label: "Как работает" },
  { href: "/tariffs", label: "Тарифы" },
  { href: "/setup", label: "Инструкции" },
  { href: "/earn", label: "Заработать" },
  { href: "/faq", label: "FAQ" },
] as const;

export default function Header() {
  return (
    <AppShellHeader component="header" className={styles.header}>
      <Container size={APP_CONTAINER_SIZE} h="100%">
        <Group h="100%" justify="space-between" align="center" wrap="nowrap">
          <Link href="/" className={styles.brand}>
            <Image src={MEDIA.images.logo} alt="NOS VPN" width={44} height={44} className={styles.logo} />
            <Text span fw={800}>
              NOS VPN
            </Text>
          </Link>

          <Group gap={16} className={styles.nav}>
            {links.map((item, index) => (
              <Link key={`${item.href}-${index}`} href={item.href} className={styles.link}>
                {item.label}
              </Link>
            ))}
          </Group>

          <HeaderActions links={links} />
        </Group>
      </Container>
    </AppShellHeader>
  );
}

