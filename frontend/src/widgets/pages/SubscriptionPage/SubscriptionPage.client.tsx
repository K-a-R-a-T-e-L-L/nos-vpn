"use client";

import { Alert, Button, Card, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { IconAlertCircle, IconCreditCard, IconShieldCheck } from "@tabler/icons-react";

import { subscriptionUserControllerGetUserSubscription } from "@/shared/api/.generated/clients/subscriptionsController/subscriptionUserControllerGetUserSubscription";
import { userAccessControllerGetAccess } from "@/shared/api/.generated/clients/userAccessController/userAccessControllerGetAccess";
import { useAuthSession } from "@/shared/lib/auth/AuthSessionProvider";
import { PageSection } from "@/shared/ui/PageSection/PageSection";
import { AuthRequired, getPlanDescription, getPlanTitle, getSubscriptionPresentation, PageLoader } from "@/widgets/pages/shared/account/account.client";
import AutoRenewCard from "@/widgets/pages/shared/account/AutoRenewCard";

export default function SubscriptionPageClient() {
  const { isAuthenticated, isReady } = useAuthSession();
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
  const subscription = subscriptionQuery.data;
  const access = accessQuery.data;
  const subscriptionPresentation = getSubscriptionPresentation(subscription, access);

  if (!isReady || subscriptionQuery.isLoading || accessQuery.isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <AuthRequired text="Войдите, чтобы посмотреть и продлить подписку." />;
  }

  if (subscriptionQuery.isError || !subscription) {
    return (
      <PageSection>
        <Alert color="red" icon={<IconAlertCircle size={18} />}>Активная подписка не найдена.</Alert>
        <Button component="a" href="/tariffs" mt="md">Выбрать тариф</Button>
      </PageSection>
    );
  }

  return (
    <PageSection size="md">
      <Stack gap="lg">
       <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
        <Stack gap="lg">
          <ThemeIcon color="brandCyan" variant="light" size={52} radius="md"><IconShieldCheck size={26} /></ThemeIcon>
          <Stack gap={4}>
            <Title order={1}>{getPlanTitle(subscription.plan)}</Title>
            <Text c="dimmed">{getPlanDescription(subscription.plan)}</Text>
          </Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Card p="md" bg="dark.7">
              <Text c="dimmed" size="sm">Статус</Text>
              <Title order={3}>{subscriptionPresentation.statusText}</Title>
            </Card>
            <Card p="md" bg="dark.7">
              <Text c="dimmed" size="sm">{subscriptionPresentation.isGrace ? "Доступ до" : subscriptionPresentation.isExpired ? "Истекла" : "Действует до"}</Text>
              <Title order={3}>{subscriptionPresentation.expiresAtLabel}</Title>
              <Text c="dimmed" size="sm">{subscriptionPresentation.expiresAtCaption}</Text>
            </Card>
          </SimpleGrid>
          <Button component="a" href={`/checkout?planId=${subscription.plan.id}`} leftSection={<IconCreditCard size={18} />}>Продлить подписку</Button>
        </Stack>
       </Card>
       <AutoRenewCard />
      </Stack>
    </PageSection>
  );
}
