import {
  Button,
  Card,
  CopyButton,
  NumberFormatter,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";

export function AdminCopyLine({ value }: { value: string }) {
  return (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "Скопировано" : "Копировать"}>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={copy}
            leftSection={
              copied ? <IconCheck size={14} /> : <IconCopy size={14} />
            }
          >
            {copied ? "Скопировано" : "Копировать"}
          </Button>
        </Tooltip>
      )}
    </CopyButton>
  );
}

export function AdminAnalyticsMetricCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Card p="md" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
      <Stack gap={6}>
        <Text fw={700}>{title}</Text>
        <Text size="xl" fw={800}>
          {typeof value === "number" ? (
            <NumberFormatter value={value} thousandSeparator=" " />
          ) : (
            value
          )}
        </Text>
        <Text c="dimmed" size="sm">
          {hint}
        </Text>
      </Stack>
    </Card>
  );
}
