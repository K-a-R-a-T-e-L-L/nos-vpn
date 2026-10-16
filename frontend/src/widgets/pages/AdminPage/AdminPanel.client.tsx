"use client";

import {
  Alert,
  Badge,
  Group,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconAffiliate,
  IconAlertCircle,
  IconCash,
  IconChartBar,
  IconDiscount2,
  IconMessageCircle,
  IconShieldLock,
  IconUsers,
  IconChartLine,
} from "@tabler/icons-react";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

import {
  getErrorMessage,
  initialPromoForm,
  SUPPORT_MESSAGES_PAGE_SIZE,
} from "./admin.lib";
import type { PromoCode } from "./admin.types";
import AdminMetricCard from "./components/AdminMetricCard";
import AdminPlansTab from "./sections/AdminPlansTab";
import AdminPromosTab from "./sections/AdminPromosTab";
import AdminSupportTab from "./sections/AdminSupportTab";
import AdminUsersTab from "./sections/AdminUsersTab";
import AdminFinanceTab from "./tabs/AdminFinanceTab";
import AdminReferralTab from "./tabs/AdminReferralTab";
import AdminRetentionTab from "./tabs/AdminRetentionTab";
import { useAdminPanel } from "./useAdminPanel";
import { useAdminTabRouting } from "./hooks/useAdminTabRouting";

type AdminPanelProps = {
  adminName: string;
};

export default function AdminPanel({ adminName }: AdminPanelProps) {
  const { activeTab, setActiveTab } = useAdminTabRouting();
  const admin = useAdminPanel(activeTab);
  const planOptions = (
    admin.plansCatalog?.rows.flatMap((row) => row.plans).filter(Boolean) || []
  ).map((plan) => {
    const item = plan!;
    const name = item.title || item.name || item.code || item.id;
    const details = [
      `${item.period} дн.`,
      `${item.devicesLimit} устр.`,
      `${item.amount} ₽`,
    ];
    return { value: item.id, label: `${name} · ${details.join(" · ")}` };
  });
  const startEditPromo = (promo: PromoCode) => {
    admin.setEditingPromoId(promo.id);
    admin.setPromoForm({
      code: promo.code,
      name: promo.name,
      valuePercent: promo.valuePercent,
      maxUses: promo.maxUses || 100,
      durationDays: promo.durationDays,
      devicesLimit: promo.devicesLimit,
      status: promo.status,
    });
  };

  const savePromo = () => {
    if (
      admin.createPromoMutation.isPending ||
      admin.updatePromoMutation.isPending
    )
      return;
    if (admin.editingPromoId && admin.editingPromoId === admin.deletingPromoId)
      return;
    if (admin.editingPromoId) {
      admin.updatePromoMutation.mutate();
      return;
    }

    admin.createPromoMutation.mutate();
  };

  return (
    <PageSection>
      <Stack gap="xl">
        <Paper p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
          <Group justify="space-between" align="flex-start" gap="lg">
            <Stack gap="xs">
              <Badge color="brandOrange" variant="light" w="fit-content">
                Admin
              </Badge>
              <Title order={1}>Панель управления NOS VPN</Title>
              <Text c="dimmed">
                Вход выполнен как {adminName}. Доступ к этой странице
                дополнительно проверяется на backend по роли ADMIN.
              </Text>
            </Stack>
            <ThemeIcon color="brandCyan" variant="light" size={56} radius="md">
              <IconShieldLock size={28} />
            </ThemeIcon>
          </Group>
        </Paper>

        {activeTab === "users" ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="lg">
            <AdminMetricCard
              title="Пользователи"
              value={admin.metrics.totalUsers}
              hint="Всего аккаунтов в админке"
              icon={IconUsers}
            />
            <AdminMetricCard
              title="Активные подписки"
              value={admin.metrics.activeSubscriptions}
              hint="По текущей выборке"
              icon={IconChartBar}
            />
            <AdminMetricCard
              title="Активные тарифы"
              value={admin.metrics.activePlans}
              hint="Комбинации сроков и устройств"
              icon={IconChartBar}
            />
            <AdminMetricCard
              title="Активные промокоды"
              value={admin.metrics.activePromos}
              hint="На текущей странице"
              icon={IconDiscount2}
            />
            <AdminMetricCard
              title="Открытые обращения"
              value={admin.metrics.openSupportThreads}
              hint="На текущей странице"
              icon={IconMessageCircle}
            />
          </SimpleGrid>
        ) : null}

        {admin.errorList.map((error, index) => (
          <Alert key={index} color="red" icon={<IconAlertCircle size={18} />}>
            {getErrorMessage(error)}
          </Alert>
        ))}

        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          variant="outline"
          keepMounted={false}
        >
          <Select
            hiddenFrom="sm"
            aria-label="Раздел админ-панели"
            value={activeTab}
            onChange={setActiveTab}
            data={[
              { value: "users", label: "Пользователи" },
              { value: "retention", label: "Удержание" },
              { value: "finance", label: "Финансы" },
              { value: "referrals", label: "Рефералы" },
              { value: "plans", label: "Тарифы" },
              { value: "promos", label: "Промокоды" },
              { value: "support", label: "Поддержка" },
            ]}
          />
          <ScrollArea visibleFrom="sm" type="auto" offsetScrollbars>
            <Tabs.List style={{ flexWrap: "nowrap" }}>
              <Tabs.Tab value="users" leftSection={<IconUsers size={16} />}>
                Пользователи
              </Tabs.Tab>
              <Tabs.Tab value="retention" leftSection={<IconChartLine size={16} />}>
                Удержание
              </Tabs.Tab>
              <Tabs.Tab value="finance" leftSection={<IconCash size={16} />}>
                Финансы
              </Tabs.Tab>
              <Tabs.Tab
                value="referrals"
                leftSection={<IconAffiliate size={16} />}
              >
                Рефералы
              </Tabs.Tab>
              <Tabs.Tab value="plans" leftSection={<IconChartBar size={16} />}>
                Тарифы
              </Tabs.Tab>
              <Tabs.Tab
                value="promos"
                leftSection={<IconDiscount2 size={16} />}
              >
                Промокоды
              </Tabs.Tab>
              <Tabs.Tab
                value="support"
                leftSection={<IconMessageCircle size={16} />}
              >
                Поддержка
              </Tabs.Tab>
            </Tabs.List>
          </ScrollArea>

          <Tabs.Panel value="users" pt="lg">
            <AdminUsersTab planOptions={planOptions} />
          </Tabs.Panel>

          <Tabs.Panel value="retention" pt="lg">
            <AdminRetentionTab planOptions={planOptions} />
          </Tabs.Panel>

          <Tabs.Panel value="finance" pt="lg">
            <AdminFinanceTab planOptions={planOptions} />
          </Tabs.Panel>

          <Tabs.Panel value="referrals" pt="lg">
            <AdminReferralTab planOptions={planOptions} />
          </Tabs.Panel>

          <Tabs.Panel value="plans" pt="lg">
            <AdminPlansTab
              catalog={admin.plansCatalog}
              draft={admin.planCatalogDraft}
              isSaving={admin.savePlanCatalogMutation.isPending}
              onCellChange={admin.updatePlanDraftCell}
              onSave={() => {
                if (!admin.savePlanCatalogMutation.isPending)
                  admin.savePlanCatalogMutation.mutate();
              }}
              onRefresh={() => admin.plansCatalogQuery.refetch()}
            />
          </Tabs.Panel>

          <Tabs.Panel value="promos" pt="lg">
            <AdminPromosTab
              promos={admin.promos}
              promosPage={admin.promosPageData}
              promoForm={admin.promoForm}
              editingPromoId={admin.editingPromoId}
              isSaving={
                admin.createPromoMutation.isPending ||
                admin.updatePromoMutation.isPending
              }
              isLoading={admin.promoQuery.isLoading}
              isFetching={admin.promoQuery.isFetching}
              deletingPromoId={admin.deletingPromoId}
              savingPromoId={
                admin.updatePromoMutation.isPending
                  ? admin.savingPromoId
                  : null
              }
              onPromoFormChange={(patch) =>
                admin.setPromoForm((current) => ({ ...current, ...patch }))
              }
              onSave={savePromo}
              onReset={() => {
                admin.setEditingPromoId(null);
                admin.setPromoForm(initialPromoForm);
              }}
              onStartEdit={startEditPromo}
              onDelete={async (promoId) => {
                await admin.deletePromoMutation.mutateAsync(promoId);
              }}
              onPageChange={admin.setPromosPage}
            />
          </Tabs.Panel>

          <Tabs.Panel value="support" pt="lg">
            <AdminSupportTab
              supportSearch={admin.supportSearch}
              supportThreads={admin.supportThreads}
              supportThreadsPage={admin.supportThreadsPageData}
              selectedSupportThreadId={admin.selectedSupportThreadId}
              supportThread={admin.supportThreadQuery.data}
              supportReplyText={admin.supportReplyText}
              supportReplyPhoto={admin.supportReplyPhoto}
              hasMoreMessages={admin.hasMoreSupportMessages}
              visibleMessages={admin.visibleSupportMessagesSlice}
              isReplyPending={admin.supportReplyMutation.isPending}
              isClosePending={admin.closeSupportThreadMutation.isPending}
              isThreadsFetching={admin.supportThreadsQuery.isFetching}
              isThreadFetching={admin.supportThreadQuery.isFetching}
              deliveryStatus={admin.supportDeliveryStatus}
              onSearchChange={admin.setSupportSearch}
              onRefresh={() => admin.supportThreadsQuery.refetch()}
              onSelectThread={admin.setSelectedSupportThreadId}
              onSupportReplyTextChange={admin.setSupportReplyText}
              onSupportReplyPhotoChange={admin.setSupportReplyPhoto}
              onShowMoreMessages={() =>
                admin.setVisibleAdminMessages(
                  (current) => current + SUPPORT_MESSAGES_PAGE_SIZE,
                )
              }
              onPageChange={admin.setSupportPage}
              onSendReply={() => {
                if (
                  !admin.selectedSupportThreadId ||
                  (!admin.supportReplyText.trim() && !admin.supportReplyPhoto) ||
                  admin.supportReplyMutation.isPending ||
                  admin.closeSupportThreadMutation.isPending
                ) {
                  return;
                }

                admin.supportReplyMutation.mutate({
                  threadId: admin.selectedSupportThreadId,
                  text: admin.supportReplyText,
                  photo: admin.supportReplyPhoto,
                });
              }}
              onCloseThread={async () => {
                if (
                  !admin.selectedSupportThreadId ||
                  admin.supportReplyMutation.isPending ||
                  admin.closeSupportThreadMutation.isPending
                ) {
                  return;
                }

                await admin.closeSupportThreadMutation.mutateAsync(
                  admin.selectedSupportThreadId,
                );
              }}
            />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </PageSection>
  );
}
