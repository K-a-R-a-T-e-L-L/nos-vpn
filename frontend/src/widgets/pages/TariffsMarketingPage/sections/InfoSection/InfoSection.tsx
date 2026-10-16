import { Accordion, AccordionControl, AccordionItem, AccordionPanel, Badge, Card, Group, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";

type InfoSectionProps = {
  steps: readonly string[];
  faqItems: readonly {
    value: string;
    question: string;
    answer: string;
  }[];
};

export default function InfoSection({ steps, faqItems }: InfoSectionProps) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
        <Stack gap="lg">
          <Badge color="brandMagenta" variant="light" w="fit-content">
            Как это работает
          </Badge>
          <Stack gap="sm">
            {steps.map((item, index) => (
              <Group key={item} gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon color="brandCyan" variant="light" size={28} radius="xl">
                  <Text size="xs" fw={800}>
                    {index + 1}
                  </Text>
                </ThemeIcon>
                <Text>{item}</Text>
              </Group>
            ))}
          </Stack>
        </Stack>
      </Card>

      <Card p="xl" bg="dark.8" bd="1px solid var(--mantine-color-dark-6)">
        <Stack gap="lg">
          <Badge color="brandOrange" variant="light" w="fit-content">
            Частые вопросы
          </Badge>
          <Accordion variant="separated">
            {faqItems.map((item) => (
              <AccordionItem key={item.value} value={item.value}>
                <AccordionControl>{item.question}</AccordionControl>
                <AccordionPanel>{item.answer}</AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </Stack>
      </Card>
    </SimpleGrid>
  );
}
