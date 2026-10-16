import {
  Button,
  NumberInput,
  Paper,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";

import type { AdminPlanCatalog, PlanCatalogDraftCell } from "../admin.types";

type AdminPlansTabProps = {
  catalog: AdminPlanCatalog | null;
  draft: PlanCatalogDraftCell[];
  isSaving: boolean;
  onCellChange: (
    period: number,
    devicesLimit: number,
    patch: Partial<PlanCatalogDraftCell>,
  ) => void;
  onSave: () => void;
  onRefresh: () => void;
};

function getDraftCell(
  draft: PlanCatalogDraftCell[],
  period: number,
  devicesLimit: number,
) {
  return (
    draft.find(
      (cell) => cell.period === period && cell.devicesLimit === devicesLimit,
    ) ?? null
  );
}

export default function AdminPlansTab({
  catalog,
  draft,
  isSaving,
  onCellChange,
  onSave,
  onRefresh,
}: AdminPlansTabProps) {
  return (
    <Paper p="lg" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={3}>Каталог тарифов</Title>
          <Text c="dimmed" size="sm">
            Здесь редактируется витрина сроков и устройств. Backend сам собирает
            код, название и отображение комбинации. Вручную вы меняете только
            цену и доступность ячейки.
          </Text>
        </Stack>

        <ScrollArea>
          <Table withTableBorder withColumnBorders miw={920}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Устройства</Table.Th>
                {catalog?.durations.map((duration) => (
                  <Table.Th key={duration.periodDays}>
                    <Stack gap={2}>
                      <Text fw={700}>{duration.label}</Text>
                      <Text c="dimmed" size="xs">
                        от {duration.startingPriceRub.toLocaleString("ru-RU")} ₽
                      </Text>
                      {duration.savingsPercent ? (
                        <Text c="brandCyan.3" size="xs">
                          Выгода {duration.savingsPercent}%
                        </Text>
                      ) : null}
                    </Stack>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {catalog?.rows.map((row) => (
                <Table.Tr key={row.devicesLimit}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text fw={700}>{row.devicesLabel}</Text>
                      <Text c="dimmed" size="xs">
                        Комбинация на {row.devicesLimit} устройств
                      </Text>
                    </Stack>
                  </Table.Td>
                  {catalog.durations.map((duration) => {
                    const cell = getDraftCell(
                      draft,
                      duration.periodDays,
                      row.devicesLimit,
                    );
                    const currentPlan =
                      row.plans[
                        catalog.durations.findIndex(
                          (item) => item.periodDays === duration.periodDays,
                        )
                      ] ?? null;

                    return (
                      <Table.Td
                        key={`${duration.periodDays}:${row.devicesLimit}`}
                      >
                        <Stack gap="xs">
                          <NumberInput
                            disabled={isSaving}
                            label="Цена, ₽"
                            min={0}
                            value={cell?.amount ?? currentPlan?.amount ?? 0}
                            onChange={(value) =>
                              onCellChange(
                                duration.periodDays,
                                row.devicesLimit,
                                {
                                  amount: Number(value) || 0,
                                },
                              )
                            }
                          />
                          <Switch
                            disabled={isSaving}
                            label="Комбинация доступна"
                            checked={
                              cell?.isActive ?? currentPlan?.isActive ?? false
                            }
                            onChange={(event) =>
                              onCellChange(
                                duration.periodDays,
                                row.devicesLimit,
                                {
                                  isActive: event.currentTarget.checked,
                                },
                              )
                            }
                          />
                          <Text c="dimmed" size="xs">
                            {currentPlan?.savingsPercent
                              ? `Экономия ${currentPlan.savingsPercent}%`
                              : "Базовая цена"}
                          </Text>
                        </Stack>
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Stack gap="xs">
          <Text fw={600}>Как это работает</Text>
          <Text c="dimmed" size="sm">
            Для каждой комбинации срока и устройств backend автоматически
            создаёт или обновляет отдельную строку каталога. Устаревшие
            сочетания можно просто отключать, не редактируя коды вручную.
          </Text>
        </Stack>

        <Stack gap="sm" align="flex-start">
          <Button onClick={onSave} loading={isSaving}>
            Сохранить каталог тарифов
          </Button>
          <Button
            variant="light"
            leftSection={<IconRefresh size={18} />}
            onClick={onRefresh}
            disabled={isSaving}
          >
            Обновить
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
