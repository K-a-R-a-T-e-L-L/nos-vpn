"use client";

import { ActionIcon, Alert, Button, Group, Image, Stack, Text } from "@mantine/core";
import { IconPhoto, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

export const SUPPORT_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_SUPPORT_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validateSupportPhotoSelection(file: File | null) {
  if (!file) return null;
  if (!ACCEPTED_SUPPORT_PHOTO_TYPES.has(file.type)) return "Поддерживаются только JPEG, PNG и WebP изображения.";
  if (file.size > SUPPORT_PHOTO_MAX_BYTES) return "Размер изображения не должен превышать 10 МиБ.";
  return null;
}

type SupportPhotoAttachmentInputProps = {
  file: File | null;
  disabled?: boolean;
  onChange: (file: File | null) => void;
};

export default function SupportPhotoAttachmentInput({ file, disabled, onChange }: SupportPhotoAttachmentInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return <Stack gap="xs">
    <input
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      hidden
      onChange={(event) => {
        const selected = event.currentTarget.files?.[0] || null;
        event.currentTarget.value = "";
        const validationError = validateSupportPhotoSelection(selected);
        setError(validationError);
        if (!validationError) onChange(selected);
      }}
    />
    <Group gap="xs">
      <Button variant="light" leftSection={<IconPhoto size={18} />} disabled={disabled} onClick={() => inputRef.current?.click()}>
        {file ? "Заменить изображение" : "Прикрепить изображение"}
      </Button>
      {file ? <ActionIcon variant="light" color="red" size="lg" radius="sm" aria-label="Удалить выбранное изображение" title="Удалить выбранное изображение" disabled={disabled} onClick={() => onChange(null)}><IconTrash size={18} /></ActionIcon> : null}
    </Group>
    {error ? <Alert color="red" variant="light">{error}</Alert> : null}
    {file && previewUrl ? <Group gap="sm" align="center"><Image src={previewUrl} alt="Предпросмотр выбранного изображения" h={72} w={96} fit="contain" radius="sm" /><Text size="sm" lineClamp={2}>{file.name} · {Math.ceil(file.size / 1024)} КБ</Text></Group> : null}
  </Stack>;
}
