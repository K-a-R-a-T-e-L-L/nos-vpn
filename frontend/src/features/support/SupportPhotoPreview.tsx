"use client";

import { Alert, Image, Modal, Skeleton, Stack, Text } from "@mantine/core";
import { IconPhotoOff } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { fetchAuthenticatedBlob } from "@/shared/api/client";

type SupportPhotoPreviewProps = {
  messageId: string;
  scope: "user" | "admin";
  alt: string;
};

function mediaPath(messageId: string, scope: SupportPhotoPreviewProps["scope"]) {
  const encodedId = encodeURIComponent(messageId);
  return scope === "admin"
    ? `/api/admin/support/messages/${encodedId}/media`
    : `/api/support/messages/${encodedId}/media`;
}

export default function SupportPhotoPreview({ messageId, scope, alt }: SupportPhotoPreviewProps) {
  const requestKey = `${scope}:${messageId}`;
  const [result, setResult] = useState<{ key: string; blob?: Blob; failed: boolean } | null>(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void fetchAuthenticatedBlob(mediaPath(messageId, scope), controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, blob, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key: requestKey, failed: true });
      });

    return () => {
      controller.abort();
    };
  }, [messageId, requestKey, scope]);

  const blob = result?.key === requestKey ? result.blob : null;
  const failed = result?.key === requestKey && result.failed;
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  if (failed) {
    return <Alert color="gray" variant="light" icon={<IconPhotoOff size={18} />}>Изображение недоступно</Alert>;
  }
  if (!url) return <Skeleton h={112} w={160} radius="sm" aria-label="Загрузка изображения" />;

  return <>
    <Image src={url} alt={alt} h={112} w="auto" fit="contain" radius="sm" style={{ cursor: "zoom-in", maxWidth: "100%" }} onClick={() => setOpened(true)} />
    <Modal opened={opened} onClose={() => setOpened(false)} title="Изображение поддержки" size="xl" centered>
      <Stack>
        <Image src={url} alt={alt} fit="contain" radius="sm" />
        <Text c="dimmed" size="xs">Изображение доступно только в авторизованной сессии.</Text>
      </Stack>
    </Modal>
  </>;
}
