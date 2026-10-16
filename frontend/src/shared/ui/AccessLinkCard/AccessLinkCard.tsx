"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CopyButton,
  Group,
  Image,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconLink,
  IconQrcode,
  IconUsers,
} from "@tabler/icons-react";
import QRCode from "qrcode";

type AccessLinkCardProps = {
  link: string;
  qrPayload?: string | null;
};

export default function AccessLinkCard({
  link,
  qrPayload,
}: AccessLinkCardProps) {
  const qrValue = qrPayload || link;
  const [qrState, setQrState] = useState<{
    value: string;
    dataUrl: string | null;
    error: boolean;
  }>({
    value: "",
    dataUrl: null,
    error: false,
  });
  const qrDataUrl = qrState.value === qrValue ? qrState.dataUrl : null;
  const qrError = qrState.value === qrValue && qrState.error;

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(qrValue, {
      margin: 2,
      width: 360,
      errorCorrectionLevel: "M",
    })
      .then((value) => {
        if (!cancelled) {
          setQrState({ value: qrValue, dataUrl: value, error: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrState({ value: qrValue, dataUrl: null, error: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrValue]);

  return (
    <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-brandCyan-7)">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl" verticalSpacing="xl">
        <Stack gap="md" justify="center">
          <Group>
            <IconLink size={22} />
            <Title order={3}>Ссылка доступа</Title>
          </Group>
          <Text c="dimmed">
            Персональная ссылка для подключения. Не передавайте её другим людям.
          </Text>
          <SimpleGrid
            cols={{ base: 1, xs: 2 }}
            spacing="sm"
            verticalSpacing="sm"
          >
            <TextInput
              value={link}
              readOnly
              flex={1}
              miw={0}
              aria-label="Ссылка доступа"
            />
            <CopyButton value={link}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Скопировано" : "Скопировать"}>
                  <Button
                    onClick={copy}
                    leftSection={
                      copied ? <IconCheck size={18} /> : <IconCopy size={18} />
                    }
                  >
                    {copied ? "Готово" : "Копировать"}
                  </Button>
                </Tooltip>
              )}
            </CopyButton>
          </SimpleGrid>
          <Alert
            color="brandCyan"
            variant="light"
            icon={<IconUsers size={18} />}
          >
            Приглашайте друзей и получайте 50% с каждой их оплаты в кошелёк.
            Пара активных друзей может закрывать стоимость вашей подписки, а всё
            сверху останется вам.
          </Alert>
        </Stack>

        <Card p="lg" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
          <Stack gap="md" align="center">
            <Group gap="xs">
              <IconQrcode size={22} />
              <Title order={4}>QR-код</Title>
            </Group>
            {qrDataUrl ? (
              <Image
                src={qrDataUrl}
                alt="QR-код ссылки доступа"
                radius="md"
                w="100%"
                maw={220}
              />
            ) : qrError ? (
              <Alert
                color="brandOrange"
                variant="light"
                icon={<IconAlertCircle size={18} />}
              >
                Не удалось построить QR-код. Скопируйте ссылку вручную.
              </Alert>
            ) : (
              <Text c="dimmed" ta="center">
                Генерируем QR-код...
              </Text>
            )}
            <Text c="dimmed" size="sm" ta="center">
              Откройте приложение для подключения VPN и отсканируйте код.
            </Text>
          </Stack>
        </Card>
      </SimpleGrid>
    </Card>
  );
}
