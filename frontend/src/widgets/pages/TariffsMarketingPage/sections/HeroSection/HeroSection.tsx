import { Alert, Badge, Button, Card, Group, List, ListItem, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconArrowRight, IconCheck, IconMessageCircle } from "@tabler/icons-react";

type HeroSectionProps = {
  primaryHref: string;
  valueItems: readonly string[];
};

export default function HeroSection({ primaryHref, valueItems }: HeroSectionProps) {
  return (
    <Card p={{ base: "lg", md: "xl" }} bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" verticalSpacing="lg">
        <Stack gap="lg" justify="space-between">
          <Stack gap="md">
            <Badge color="brandOrange" variant="light" w="fit-content">
              Тарифы NOS VPN
            </Badge>
            <Stack gap="xs">
              <Title order={1}>Выберите срок и количество устройств</Title>
              <Text c="dimmed" size="lg">
                Все тарифы дают один и тот же VPN-доступ, кабинет, инструкции и поддержку. Меняется только срок и
                число устройств, которые вы хотите подключить на одном аккаунте.
              </Text>
            </Stack>

            <Group>
              <Button component="a" href={primaryHref} rightSection={<IconArrowRight size={18} />}>
                Перейти к выбору
              </Button>
              <Button component="a" href="/support" variant="light" leftSection={<IconMessageCircle size={18} />}>
                Помочь с выбором
              </Button>
            </Group>
          </Stack>

          <Alert color="brandCyan" variant="light" icon={<IconCheck size={18} />}>
            Бонусные рубли работают как кошелёк: их можно тратить на тарифы, а при накоплении нужной суммы запросить
            вывод через поддержку.
          </Alert>
        </Stack>

        <Card p="lg" bg="dark.7" bd="1px solid var(--mantine-color-dark-5)">
          <Stack gap="md">
            <Badge color="brandCyan" variant="light" w="fit-content">
              Что будет после оплаты
            </Badge>
            <Title order={3}>Доступ появится сразу в кабинете</Title>
            <List spacing="sm" icon={<IconCheck size={16} />}>
              {valueItems.map((item) => (
                <ListItem key={item}>{item}</ListItem>
              ))}
            </List>
          </Stack>
        </Card>
      </SimpleGrid>
    </Card>
  );
}
