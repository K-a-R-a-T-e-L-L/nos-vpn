import {
  Alert,
  Box,
  Button,
  Group,
  LoadingOverlay,
  Paper,
  Progress,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { getErrorMessage } from "../admin.lib";

export const ADMIN_ANALYTICS_STALE_TIME = 30_000;
export const ADMIN_QUERY_GC_TIME = 5 * 60_000;

export function AdminQueryError({
  error,
  retry,
  stale = false,
}: {
  error: unknown;
  retry: () => void;
  stale?: boolean;
}) {
  return (
    <Alert
      color={stale ? "yellow" : "red"}
      icon={<IconAlertCircle size={18} />}
    >
      <Group justify="space-between" align="center">
        <Text size="sm">
          {stale ? "Показаны сохранённые данные. " : ""}
          {getErrorMessage(error)}
        </Text>
        <Button size="xs" variant="light" onClick={retry}>
          Повторить
        </Button>
      </Group>
    </Alert>
  );
}

export function AdminKpiSkeleton({ count }: { count: number }) {
  return (
    <SimpleGrid
      cols={{ base: 1, sm: 2, lg: 4 }}
      data-testid="admin-kpi-skeleton"
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} h={90} radius="md" />
      ))}
    </SimpleGrid>
  );
}

export function AdminChartSkeleton({ height = 250 }: { height?: number }) {
  return <Skeleton data-testid="admin-chart-skeleton" h={height} radius="md" />;
}

export function AdminTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Stack data-testid="admin-table-skeleton" gap="xs">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} h={42} radius="sm" />
      ))}
    </Stack>
  );
}

export function AdminQuerySection({
  isFetching,
  hasData,
  children,
}: {
  isFetching: boolean;
  hasData: boolean;
  children: ReactNode;
}) {
  return (
    <Box pos="relative" aria-busy={isFetching}>
      {isFetching && hasData ? (
        <Progress
          size="xs"
          value={100}
          animated
          mb="xs"
          aria-label="Обновление данных"
        />
      ) : null}
      <LoadingOverlay
        visible={isFetching && hasData}
        overlayProps={{ backgroundOpacity: 0.18, blur: 0.5 }}
        loaderProps={{ size: "sm" }}
      />
      {children}
    </Box>
  );
}

export function AdminTableLoadingOverlay({
  isFetching,
  hasData,
  children,
}: {
  isFetching: boolean;
  hasData: boolean;
  children: ReactNode;
}) {
  return (
    <Paper pos="relative" bg="transparent" aria-busy={isFetching}>
      <LoadingOverlay
        visible={isFetching && hasData}
        overlayProps={{ backgroundOpacity: 0.2, blur: 0.5 }}
        loaderProps={{ size: "sm" }}
      />
      {!hasData && isFetching ? <AdminTableSkeleton /> : children}
    </Paper>
  );
}
