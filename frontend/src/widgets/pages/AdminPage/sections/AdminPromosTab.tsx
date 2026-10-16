import {
  Badge,
  ActionIcon,
  Box,
  Button,
  Group,
  NumberInput,
  Pagination,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import type { AdminPaginatedResponse, PromoCode, PromoFormState } from "../admin.types";
import { formatAdminDate } from "../admin-stage3";
import AdminConfirmDialog from "../components/AdminConfirmDialog";
import { AdminTableSkeleton } from "../components/AdminQueryLoading";
import styles from "./AdminPromosTab.module.css";

type AdminPromosTabProps = {
  promos: PromoCode[];
  promosPage: AdminPaginatedResponse<PromoCode> | null;
  promoForm: PromoFormState;
  editingPromoId: string | null;
  isSaving: boolean;
  isLoading: boolean;
  isFetching: boolean;
  deletingPromoId: string | null;
  savingPromoId: string | null;
  onPromoFormChange: (patch: Partial<PromoFormState>) => void;
  onSave: () => void;
  onReset: () => void;
  onStartEdit: (promo: PromoCode) => void;
  onDelete: (promoId: string) => Promise<void>;
  onPageChange: (page: number) => void;
};

function formatUsage(promo: PromoCode) {
  return `${promo.usedCount || 0}${promo.maxUses ? ` / ${promo.maxUses}` : ""}`;
}

function formatParameters(promo: PromoCode) {
  const duration = promo.durationDays > 0 ? `${promo.durationDays} дн.` : "как у тарифа";
  const devices = promo.devicesLimit > 0 ? promo.devicesLimit : "как у тарифа";
  return `Срок: ${duration}, устройств: ${devices}`;
}

function formatPrimaryStatus(promo: PromoCode) {
  if (promo.status !== "ACTIVE") return "Неактивен";
  if (promo.isAvailable === false) return "Недоступен по сроку";
  return "Активен";
}

function formatSchedule(promo: PromoCode) {
  const schedule = [
    promo.startsAt ? `с ${formatAdminDate(promo.startsAt)}` : null,
    promo.expiresAt ? `до ${formatAdminDate(promo.expiresAt)}` : null,
  ].filter(Boolean);
  return schedule.length ? schedule.join(" · ") : null;
}

function PromoStatus({ promo }: { promo: PromoCode }) {
  const isAvailable = promo.status === "ACTIVE" && promo.isAvailable !== false;
  const primaryStatus = formatPrimaryStatus(promo);
  const scheduleText = formatSchedule(promo);
  return <Stack gap={3} className={styles.statusCell}><Badge className={styles.noWrap} color={isAvailable ? "brandCyan" : "gray"} variant="light">{primaryStatus}</Badge>{scheduleText ? <Text className={styles.statusText} c="dimmed" size="xs">{scheduleText}</Text> : null}</Stack>;
}

function PromoActions({ promo, disabled, deleting, onStartEdit, onDelete }: { promo: PromoCode; disabled: boolean; deleting: boolean; onStartEdit: (promo: PromoCode) => void; onDelete: (promo: PromoCode) => void }) {
  return <Group className={styles.actions} gap="xs" wrap="nowrap">
    <Tooltip label="Редактировать промокод" withArrow>
      <ActionIcon size={40} radius="sm" variant="light" aria-label="Редактировать промокод" title="Редактировать промокод" disabled={disabled} onClick={() => onStartEdit(promo)}><IconPencil size={18} /></ActionIcon>
    </Tooltip>
    <Tooltip label="Удалить промокод" withArrow>
      <ActionIcon size={40} radius="sm" variant="light" color="red" aria-label="Удалить промокод" title="Удалить промокод" disabled={disabled} loading={deleting} onClick={() => onDelete(promo)}><IconTrash size={18} /></ActionIcon>
    </Tooltip>
  </Group>;
}

export default function AdminPromosTab({
  promos,
  promosPage,
  promoForm,
  editingPromoId,
  isSaving,
  isLoading,
  isFetching,
  deletingPromoId,
  savingPromoId,
  onPromoFormChange,
  onSave,
  onReset,
  onStartEdit,
  onDelete,
  onPageChange,
}: AdminPromosTabProps) {
  const [deleteTarget, setDeleteTarget] = useState<PromoCode | null>(null);
  const isTargetDeleting = Boolean(deleteTarget && deleteTarget.id === deletingPromoId);
  const editingPromoDeleted = Boolean(editingPromoId && editingPromoId === deletingPromoId);
  const formDisabled = isSaving || editingPromoDeleted;
  const rowIsBusy = (promo: PromoCode) => promo.id === deletingPromoId || promo.id === savingPromoId;

  return <>
    <div className={styles.layout}>
      <Paper className={styles.formPanel} p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
        <Stack gap="md">
          <Title order={3}>{editingPromoId ? "Редактировать промокод" : "Создать промокод"}</Title>
          <TextInput disabled={formDisabled} label="Код" placeholder="SUMMER50" value={promoForm.code} onChange={(event) => onPromoFormChange({ code: event.currentTarget.value })} />
          <Text c="dimmed" size="sm">Это код, который пользователь вводит при оплате.</Text>
          <TextInput disabled={formDisabled} label="Название" placeholder="Летняя скидка" value={promoForm.name} onChange={(event) => onPromoFormChange({ name: event.currentTarget.value })} />
          <Text c="dimmed" size="sm">Внутренняя подпись для админки. Если оставить пустым, будет использоваться сам код.</Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <NumberInput disabled={formDisabled} label="Скидка, %" min={0} max={100} value={promoForm.valuePercent} onChange={(value) => onPromoFormChange({ valuePercent: Number(value) || 0 })} />
            <NumberInput disabled={formDisabled} label="Кол-во использований" min={1} value={promoForm.maxUses} onChange={(value) => onPromoFormChange({ maxUses: Number(value) || 1 })} />
            <NumberInput disabled={formDisabled} label="Срок подписки, дней" min={0} value={promoForm.durationDays} onChange={(value) => onPromoFormChange({ durationDays: Number(value) || 0 })} />
            <NumberInput disabled={formDisabled} label="Устройств" min={0} value={promoForm.devicesLimit} onChange={(value) => onPromoFormChange({ devicesLimit: Number(value) || 0 })} />
          </SimpleGrid>
          <Text c="dimmed" size="sm">0 в сроке или устройствах сохраняет значения выбранного тарифа.</Text>
          <Switch disabled={formDisabled} label="Промокод активен" checked={promoForm.status === "ACTIVE"} onChange={(event) => onPromoFormChange({ status: event.currentTarget.checked ? "ACTIVE" : "INACTIVE" })} />
          <Group><Button onClick={onSave} loading={isSaving} disabled={formDisabled}>{editingPromoId ? "Сохранить изменения" : "Создать промокод"}</Button>{editingPromoId ? <Button variant="light" onClick={onReset} disabled={isSaving}>Отмена</Button> : null}</Group>
        </Stack>
      </Paper>

      <Paper className={styles.listPanel} p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
        <Stack gap="md">
          <Group justify="space-between" align="center"><Title order={3}>Список промокодов</Title>{promosPage ? <Text c="dimmed" size="sm">Всего: {promosPage.total}</Text> : null}</Group>
          {isFetching && promosPage ? <Progress size="xs" value={100} animated aria-label="Обновление данных" /> : null}
          {isLoading && !promosPage ? <AdminTableSkeleton rows={6} /> : null}
          {promosPage ? <>
            <Box visibleFrom="sm" className={styles.tableViewport}>
              <Table className={styles.promoTable} striped highlightOnHover>
                <Table.Thead><Table.Tr><Table.Th>Код и название</Table.Th><Table.Th>Скидка</Table.Th><Table.Th>Использования</Table.Th><Table.Th>Параметры</Table.Th><Table.Th>Статус</Table.Th><Table.Th><span className={styles.srOnly}>Действия</span></Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>{promos.map((promo) => <Table.Tr key={promo.id}>
                  <Table.Td className={styles.codeCell}><Stack gap={2}><Text className={styles.noWrap} fw={700}>{promo.code}</Text><Text c="dimmed" size="xs">{promo.name || "Без названия"}</Text></Stack></Table.Td>
                  <Table.Td className={styles.noWrap}>{promo.valuePercent}%</Table.Td>
                  <Table.Td className={styles.usageCell}><Text className={styles.noWrap}>{formatUsage(promo)}</Text>{promo.reservedCount && promo.reservedCount > (promo.usedCount || 0) ? <Text c="dimmed" size="xs" className={styles.noWrap}>В резерве: {promo.reservedCount}</Text> : null}</Table.Td>
                  <Table.Td className={styles.parametersCell}>{formatParameters(promo)}</Table.Td>
                  <Table.Td><PromoStatus promo={promo} /></Table.Td>
                  <Table.Td><PromoActions promo={promo} disabled={rowIsBusy(promo)} deleting={promo.id === deletingPromoId} onStartEdit={onStartEdit} onDelete={setDeleteTarget} /></Table.Td>
                </Table.Tr>)}</Table.Tbody>
              </Table>
            </Box>
            <Stack hiddenFrom="sm" gap="sm">{promos.map((promo) => <Paper key={promo.id} className={styles.mobilePromo} p="sm" withBorder>
              <Group justify="space-between" align="flex-start" wrap="nowrap"><Stack gap={2}><Text className={styles.noWrap} fw={700}>{promo.code}</Text><Text c="dimmed" size="xs">{promo.name || "Без названия"}</Text></Stack><PromoStatus promo={promo} /></Group>
              <Text className={styles.noWrap} size="sm">Скидка: {promo.valuePercent}% · Использования: {formatUsage(promo)}</Text>
              {promo.reservedCount && promo.reservedCount > (promo.usedCount || 0) ? <Text c="dimmed" size="xs">В резерве: {promo.reservedCount}</Text> : null}
              <Text size="sm" className={styles.parametersCell}>{formatParameters(promo)}</Text>
              <PromoActions promo={promo} disabled={rowIsBusy(promo)} deleting={promo.id === deletingPromoId} onStartEdit={onStartEdit} onDelete={setDeleteTarget} />
            </Paper>)}</Stack>
            {!promos.length ? <Text c="dimmed" size="sm">Промокодов пока нет.</Text> : null}
            {promosPage.totalPages > 1 ? <Pagination value={promosPage.page} total={promosPage.totalPages} onChange={onPageChange} /> : null}
          </> : null}
        </Stack>
      </Paper>
    </div>
    <AdminConfirmDialog opened={Boolean(deleteTarget)} title="Удалить промокод?" message={<>Промокод «{deleteTarget?.code}» и связанные данные использования будут удалены. Действие нельзя отменить.</>} confirmLabel="Удалить" pending={isTargetDeleting} onConfirm={() => deleteTarget ? onDelete(deleteTarget.id) : Promise.resolve()} onCancel={() => setDeleteTarget(null)} />
  </>;
}
