"use client";

import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useRef } from "react";

type AdminConfirmDialogProps = {
  opened: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export default function AdminConfirmDialog({
  opened,
  title,
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  pending = false,
  danger = true,
  onConfirm,
  onCancel,
}: AdminConfirmDialogProps) {
  const inFlightRef = useRef(false);
  const confirm = async () => {
    if (pending || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await onConfirm();
      onCancel();
    } catch {
      // Mutation errors are rendered by the existing admin error surface.
    } finally {
      inFlightRef.current = false;
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={pending ? () => undefined : onCancel}
      title={title}
      centered
      closeOnEscape={!pending}
      closeOnClickOutside={!pending}
      withCloseButton={!pending}
      aria-busy={pending}
    >
      <Stack gap="lg">
        <Text>{message}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            color={danger ? "red" : "brandOrange"}
            onClick={confirm}
            loading={pending}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
