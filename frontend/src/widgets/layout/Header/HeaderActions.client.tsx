"use client";

import { Burger, Button, Drawer, Group, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import {
  IconLayoutDashboard,
  IconLogin2,
  IconRocket,
  IconShieldLock,
  IconUserCircle,
} from "@tabler/icons-react";
import Image from "next/image";
import { usePathname } from "next/navigation";

import { userControllerGet } from "@/shared/api/.generated/clients/userController/userControllerGet";
import { useAuthSession } from "@/shared/lib/auth/AuthSessionProvider";
import { MEDIA } from "@/shared/lib/media";
import styles from "./Header.module.css";

type HeaderLink = {
  href: string;
  label: string;
};

type HeaderUser = {
  role?: string;
};

export default function HeaderActions({
  links,
}: {
  links: readonly HeaderLink[];
}) {
  const pathname = usePathname();
  const [opened, { open, close }] = useDisclosure(false);
  const { isAuthenticated, isReady } = useAuthSession();
  const userQuery = useQuery({
    queryKey: ["header-user"],
    queryFn: () => userControllerGet() as Promise<HeaderUser>,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const isAdmin = userQuery.data?.role === "ADMIN";
  const accountHref = isReady
    ? isAuthenticated
      ? "/dashboard"
      : "/login"
    : "/login";
  const accountLabel = isReady && isAuthenticated ? "Профиль" : "Войти";
  const AccountIcon = isReady && isAuthenticated ? IconUserCircle : IconLogin2;
  const drawerLinks: HeaderLink[] = [
    ...links,
    { href: accountHref, label: accountLabel },
  ];

  if (isAdmin) {
    drawerLinks.push({ href: "/admin", label: "Админка" });
  }

  return (
    <>
      <Group gap="sm" wrap="nowrap">
        {isAdmin ? (
          <Button
            component="a"
            href="/admin"
            size="sm"
            variant="light"
            leftSection={<IconShieldLock size={18} />}
            className={styles.loginButton}
          >
            Админка
          </Button>
        ) : null}
        <Button
          component="a"
          href={accountHref}
          size="sm"
          variant="light"
          leftSection={<AccountIcon size={18} />}
          className={styles.loginButton}
        >
          {accountLabel}
        </Button>
        <Button
          component="a"
          href="/tariffs"
          size="sm"
          leftSection={<IconRocket size={18} />}
          className={styles.tariffButton}
        >
          Подключить VPN
        </Button>
        <Burger
          opened={opened}
          onClick={open}
          aria-label="Открыть меню"
          color="var(--mantine-color-text)"
          className={styles.burger}
        />
      </Group>

      <Drawer
        opened={opened}
        onClose={close}
        title={
          <Group gap="xs">
            <Image
              src={MEDIA.images.logo}
              alt="NOS VPN"
              width={30}
              height={30}
              className={styles.logo}
            />
            <Text fw={800}>NOS VPN</Text>
          </Group>
        }
        position="right"
        size="min(360px, 100vw)"
        classNames={{ body: styles.drawerBody }}
      >
        <Stack gap="sm">
          {drawerLinks.map((item, index) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(`${item.href}/`));

            return (
              <Button
                key={`${item.href}-${index}`}
                component="a"
                href={item.href}
                variant={isActive ? "light" : "subtle"}
                justify="flex-start"
                className={`${styles.drawerLink} ${isActive ? styles.drawerLinkActive : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={close}
                leftSection={
                  item.href === "/admin" ? (
                    <IconShieldLock size={18} />
                  ) : item.href === "/dashboard" ? (
                    <IconLayoutDashboard size={18} />
                  ) : undefined
                }
              >
                {item.label}
              </Button>
            );
          })}
          <Button
            component="a"
            href="/tariffs"
            leftSection={<IconRocket size={18} />}
            onClick={close}
            fullWidth
          >
            Подключить VPN
          </Button>
        </Stack>
      </Drawer>
    </>
  );
}
