"use client";

import {
  Alert,
  Button,
  Card,
  Group,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertCircle,
  IconMessageCircle,
  IconShieldCheck,
  IconStar,
  IconUserCircle,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { subscriptionUserControllerGetUserSubscription } from "@/shared/api/.generated/clients/subscriptionsController/subscriptionUserControllerGetUserSubscription";
import { userAccessControllerGetAccess } from "@/shared/api/.generated/clients/userAccessController/userAccessControllerGetAccess";
import { userControllerGet } from "@/shared/api/.generated/clients/userController/userControllerGet";
import { useAuthSession } from "@/shared/lib/auth/AuthSessionProvider";
import {
  buildReferralShareText,
  buildTelegramReferralLink,
  buildWebsiteReferralLink,
} from "@/shared/lib/referral/referral";
import { PageSection } from "@/shared/ui/PageSection/PageSection";
import AccessLinkCard from "@/shared/ui/AccessLinkCard/AccessLinkCard";
import {
  attachEmailPassword,
  AuthRequired,
  consumeTelegramLinkCode,
  createSupportMessage,
  createSupportPhotoMessage,
  EmptyAccessState,
  getReferralStats,
  getAuthErrorMessage,
  getErrorMessage,
  getPlanTitle,
  getSubscriptionPresentation,
  getSupportThread,
  logoutUser,
  openTelegramUrl,
  PageLoader,
  SUPPORT_MESSAGES_PAGE_SIZE,
} from "@/widgets/pages/shared/account/account.client";
import type { DashboardUser } from "@/widgets/pages/shared/account/account.types";

import DashboardEmailCard from "./sections/DashboardEmailCard";
import DashboardHeaderCard from "./sections/DashboardHeaderCard";
import DashboardOverviewSection from "./sections/DashboardOverviewSection";
import DashboardReferralCard from "./sections/DashboardReferralCard";
import DashboardSupportCard from "./sections/DashboardSupportCard";
import DashboardTelegramCard from "./sections/DashboardTelegramCard";
import { useDashboardTelegramLink } from "./hooks/useDashboardTelegramLink";

export default function DashboardPageClient() {
  const { isAuthenticated, isReady, logout } = useAuthSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [telegramLinkCode, setTelegramLinkCode] = useState("");
  const [supportText, setSupportText] = useState("");
  const [supportPhoto, setSupportPhoto] = useState<File | null>(null);
  const [supportPhotoRequestId, setSupportPhotoRequestId] = useState<string | null>(null);
  const [supportPagination, setSupportPagination] = useState({
    threadId: "",
    count: SUPPORT_MESSAGES_PAGE_SIZE,
  });
  const [activeTab, setActiveTab] = useState<string | null>("account");
  const [telegramLinkNotice, setTelegramLinkNotice] = useState<string | null>(
    null,
  );

  const userQuery = useQuery({
    queryKey: ["user"],
    queryFn: async () => (await userControllerGet()) as DashboardUser,
    enabled: isAuthenticated,
  });
  const subscriptionQuery = useQuery({
    queryKey: ["subscription"],
    queryFn: () => subscriptionUserControllerGetUserSubscription(),
    enabled: isAuthenticated,
  });
  const accessQuery = useQuery({
    queryKey: ["access"],
    queryFn: () => userAccessControllerGetAccess(),
    enabled: isAuthenticated,
  });
  const supportThreadQuery = useQuery({
    queryKey: ["support-thread"],
    queryFn: () => getSupportThread(),
    enabled: isAuthenticated,
  });
  const referralStatsQuery = useQuery({
    queryKey: ["referral-stats"],
    queryFn: () => getReferralStats(),
    enabled: isAuthenticated,
  });
  const shouldShowTelegramCard = Boolean(
    userQuery.data &&
    !(userQuery.data.telegramLinkedAt || userQuery.data.telegramId),
  );
  const telegramLink = useDashboardTelegramLink(shouldShowTelegramCard);

  const telegramMutation = useMutation({
    mutationFn: async () => {
      const prepared = await telegramLink.getPreparedLink();
      if (!prepared) throw new Error("Не удалось подготовить ссылку Telegram");
      return prepared;
    },
    onSuccess: (prepared) => {
      setTelegramLinkNotice(null);
      openTelegramUrl(prepared.linkUrl, "new-tab");
    },
  });

  const emailPasswordMutation = useMutation({
    mutationFn: () =>
      attachEmailPassword({ email: profileEmail, password: profilePassword }),
    onSuccess: () => {
      setProfileEmail("");
      setProfilePassword("");
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  const telegramCodeMutation = useMutation({
    mutationFn: () => consumeTelegramLinkCode({ code: telegramLinkCode }),
    onSuccess: () => {
      setTelegramLinkCode("");
      setTelegramLinkNotice(
        "Готово: Telegram привязан. Теперь сайт и бот работают как один аккаунт, можно сразу пользоваться.",
      );
      setActiveTab("account");
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => logoutUser(),
    onSettled: () => {
      logout();
      queryClient.clear();
      router.replace("/");
    },
  });

  const supportMessageMutation = useMutation({
    mutationFn: async () => supportPhoto
      ? (supportPhotoRequestId
        ? (await createSupportPhotoMessage({ image: supportPhoto, text: supportText, idempotencyKey: supportPhotoRequestId })).thread
        : (() => { throw new Error("Не удалось подготовить повторную отправку изображения"); })())
      : createSupportMessage({ text: supportText }),
    onSuccess: () => {
      setSupportText("");
      setSupportPhoto(null);
      setSupportPhotoRequestId(null);
      queryClient.invalidateQueries({ queryKey: ["support-thread"] });
    },
  });

  const user = userQuery.data;
  const subscription = subscriptionQuery.data;
  const access = accessQuery.data;
  const supportThread = supportThreadQuery.data;
  const walletBalance = user?.referralBonusBalanceRub ?? 0;
  const accountName = user?.hasTemporaryWebCredentials
    ? user?.telegramUsername
      ? `@${user.telegramUsername}`
      : "Аккаунт NOS VPN"
    : user?.email ||
      (user?.telegramUsername
        ? `@${user.telegramUsername}`
        : "Аккаунт NOS VPN");
  const subscriptionPresentation = getSubscriptionPresentation(
    subscription,
    access,
  );
  const subscriptionLabel = subscription
    ? `${getPlanTitle(subscription.plan)} · ${subscriptionPresentation.statusText}`
    : subscriptionPresentation.statusText;
  const expiresAtLabel = subscriptionPresentation.expiresAtLabel;
  const referralCode =
    referralStatsQuery.data?.referralCode || user?.referralCode || null;

  const referralLinks = useMemo(() => {
    if (!referralCode || typeof window === "undefined") {
      return null;
    }

    const websiteReferralLink = buildWebsiteReferralLink(
      referralCode,
      window.location.origin,
    );
    const telegramReferralLink = buildTelegramReferralLink(
      referralCode,
      referralStatsQuery.data?.telegramBotStartUrl,
    );

    return {
      websiteReferralLink,
      telegramReferralLink,
      shareText: buildReferralShareText({
        websiteLink: websiteReferralLink,
        telegramLink: telegramReferralLink ?? undefined,
      }),
    };
  }, [referralCode, referralStatsQuery.data?.telegramBotStartUrl]);

  const visibleSupportMessages =
    supportPagination.threadId === (supportThread?.id || "")
      ? supportPagination.count
      : SUPPORT_MESSAGES_PAGE_SIZE;

  if (!isReady) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return (
      <AuthRequired text="Войдите, чтобы увидеть подписку, ссылку доступа и баланс кошелька." />
    );
  }

  return (
    <PageSection>
      <Stack gap="xl">
        <DashboardHeaderCard
          accountName={accountName}
          isLogoutPending={logoutMutation.isPending}
          onLogout={() => logoutMutation.mutate()}
        />

        <DashboardOverviewSection
          subscriptionLabel={subscriptionLabel}
          expiresAtTitle={
            subscriptionPresentation.isGrace
              ? "Доступ до"
              : subscriptionPresentation.isExpired
                ? "Истекла"
                : "Действует до"
          }
          expiresAtLabel={expiresAtLabel}
          expiresAtCaption={subscriptionPresentation.expiresAtCaption}
          walletBalance={walletBalance}
        />

        {access?.subscriptionUrl ? (
          <AccessLinkCard
            link={access.subscriptionUrl}
            qrPayload={access.qrPayload}
          />
        ) : (
          <EmptyAccessState
            title={subscriptionPresentation.accessTitle}
            description={subscriptionPresentation.accessDescription}
            buttonLabel={
              subscriptionPresentation.isExpired
                ? "Продлить доступ"
                : "Выбрать тариф"
            }
          />
        )}

        <Group gap="sm" wrap="wrap">
          <Button
            component="a"
            href="/tariffs"
            leftSection={<IconStar size={18} />}
            size="md"
          >
            Сменить тариф
          </Button>
          <Button
            variant="light"
            leftSection={<IconMessageCircle size={18} />}
            onClick={() => setActiveTab("support")}
          >
            Поддержка
          </Button>
        </Group>

        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          color="brandOrange"
          variant="outline"
        >
          <Tabs.List>
            <Tabs.Tab
              value="account"
              leftSection={<IconUserCircle size={16} />}
            >
              Аккаунт
            </Tabs.Tab>
            <Tabs.Tab
              value="referral"
              leftSection={<IconUsersGroup size={16} />}
            >
              Рефералы
            </Tabs.Tab>
            <Tabs.Tab
              value="support"
              leftSection={<IconMessageCircle size={16} />}
            >
              Поддержка
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="account" pt="lg">
            <Stack gap="lg">
              <Card
                p="lg"
                bg="dark.8"
                bd="1px solid var(--mantine-color-dark-6)"
              >
                <Stack gap={6}>
                  <Group gap="sm">
                    <ThemeIcon
                      color="brandOrange"
                      variant="light"
                      size={42}
                      radius="md"
                    >
                      <IconUserCircle size={22} />
                    </ThemeIcon>
                    <div>
                      <Text fw={800} size="lg">
                        Управление аккаунтом
                      </Text>
                      <Text c="dimmed" size="sm">
                        Здесь можно привязать Telegram и заменить временный
                        логин на свои данные.
                      </Text>
                    </div>
                  </Group>
                </Stack>
              </Card>

              <DashboardTelegramCard
                isVisible={shouldShowTelegramCard}
                isPending={
                  telegramMutation.isPending || telegramLink.isPreparing
                }
                isCodePending={telegramCodeMutation.isPending}
                code={telegramLinkCode}
                errorText={
                  telegramMutation.isError
                    ? getErrorMessage(telegramMutation.error)
                    : telegramLink.prepareError
                      ? getErrorMessage(telegramLink.prepareError)
                      : telegramCodeMutation.isError
                        ? getErrorMessage(telegramCodeMutation.error)
                        : null
                }
                onCodeChange={(value) => {
                  setTelegramLinkCode(value);
                  setTelegramLinkNotice(null);
                }}
                onSubmitCode={() => telegramCodeMutation.mutate()}
                onCreateLink={() => telegramMutation.mutate()}
              />

              <DashboardEmailCard
                isVisible={Boolean(
                  user && (!user.email || user.hasTemporaryWebCredentials),
                )}
                email={profileEmail}
                password={profilePassword}
                temporaryLogin={
                  user?.hasTemporaryWebCredentials ? user.email || null : null
                }
                isTemporary={Boolean(user?.hasTemporaryWebCredentials)}
                success={emailPasswordMutation.isSuccess}
                errorText={
                  emailPasswordMutation.isError
                    ? getAuthErrorMessage(
                        emailPasswordMutation.error,
                        "register",
                      )
                    : null
                }
                isPending={emailPasswordMutation.isPending}
                onEmailChange={setProfileEmail}
                onPasswordChange={setProfilePassword}
                onSubmit={() => emailPasswordMutation.mutate()}
              />

              {telegramLinkNotice ? (
                <Alert
                  color="brandCyan"
                  variant="light"
                  icon={<IconShieldCheck size={18} />}
                >
                  {telegramLinkNotice}
                </Alert>
              ) : !shouldShowTelegramCard &&
                !user?.hasTemporaryWebCredentials ? (
                <Alert
                  color="brandCyan"
                  variant="light"
                  icon={<IconShieldCheck size={18} />}
                >
                  Все готово: аккаунт уже привязан, можно пользоваться сайтом и
                  ботом без дополнительной настройки.
                </Alert>
              ) : null}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="referral" pt="lg">
            {referralLinks ? (
              <DashboardReferralCard
                invitedCount={referralStatsQuery.data?.invitedCount ?? 0}
                totalBonusRub={
                  referralStatsQuery.data?.totalBonusRub ??
                  user?.totalReferralBonusRub ??
                  0
                }
                walletBalanceRub={walletBalance}
                websiteReferralLink={referralLinks.websiteReferralLink}
                telegramReferralLink={referralLinks.telegramReferralLink}
                shareText={referralLinks.shareText}
              />
            ) : (
              <Alert
                color="brandOrange"
                variant="light"
                icon={<IconAlertCircle size={18} />}
              >
                Реферальные данные пока недоступны. Обновите страницу чуть
                позже.
              </Alert>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="support" pt="lg">
            <DashboardSupportCard
              supportMessages={supportThread?.messages || []}
              supportText={supportText}
              supportPhoto={supportPhoto}
              isFetching={supportThreadQuery.isFetching}
              isSending={supportMessageMutation.isPending}
              errorText={
                supportThreadQuery.isError
                  ? getErrorMessage(supportThreadQuery.error)
                  : supportMessageMutation.isError
                    ? getErrorMessage(supportMessageMutation.error)
                    : null
              }
              success={supportMessageMutation.isSuccess}
              visibleCount={visibleSupportMessages}
              onRefresh={() => supportThreadQuery.refetch()}
              onSupportTextChange={setSupportText}
              onSupportPhotoChange={(file) => {
                setSupportPhoto(file);
                setSupportPhotoRequestId(file ? globalThis.crypto.randomUUID() : null);
              }}
              onShowMore={() =>
                setSupportPagination((current) => ({
                  threadId: supportThread?.id || "",
                  count:
                    current.threadId === (supportThread?.id || "")
                      ? current.count + SUPPORT_MESSAGES_PAGE_SIZE
                      : SUPPORT_MESSAGES_PAGE_SIZE * 2,
                }))
              }
              onSend={() => supportMessageMutation.mutate()}
            />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </PageSection>
  );
}
