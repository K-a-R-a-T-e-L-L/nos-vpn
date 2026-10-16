"use client";

import { Button, CopyButton } from "@mantine/core";
import { IconCopy } from "@tabler/icons-react";

export default function ReferralCopyButton({
  value,
  idleLabel = "Скопировать ссылку",
  copiedLabel = "Скопировано",
}: {
  value: string;
  idleLabel?: string;
  copiedLabel?: string;
}) {
  return (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <Button onClick={copy} variant="light" leftSection={<IconCopy size={18} />}>
          {copied ? copiedLabel : idleLabel}
        </Button>
      )}
    </CopyButton>
  );
}
