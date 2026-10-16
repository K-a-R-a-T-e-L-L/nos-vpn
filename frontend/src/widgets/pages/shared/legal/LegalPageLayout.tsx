import {
  Anchor,
  Badge,
  Card,
  Group,
  List,
  Stack,
  Text,
  Title,
} from "@mantine/core";

import { PageSection } from "@/shared/ui/PageSection/PageSection";

import type { LegalPageData } from "./legal.types";

type LegalPageLayoutProps = {
  page: LegalPageData;
  footer?: React.ReactNode;
};

export default function LegalPageLayout({
  page,
  footer,
}: LegalPageLayoutProps) {
  return (
    <PageSection>
      <Stack gap="xl">
        <Stack gap="xs">
          <Badge color="brandCyan" variant="light" w="fit-content">
            {page.eyebrow}
          </Badge>
          <Title order={1}>{page.title}</Title>
          <Text c="dimmed" size="lg">
            {page.intro}
          </Text>
          {page.revision ? (
            <Text c="dimmed" size="sm">
              {page.revision}
            </Text>
          ) : null}
        </Stack>

        <Stack gap="lg">
          {page.sections.map((section) => (
            <Card
              key={section.title}
              p="xl"
              bg="dark.8"
              bd="1px solid var(--mantine-color-dark-6)"
            >
              <Stack gap="md">
                <Title order={3}>{section.title}</Title>
                {section.paragraphs.map((paragraph) => (
                  <Text key={paragraph} c="dimmed">
                    {paragraph}
                  </Text>
                ))}
                {section.items?.length ? (
                  <List c="dimmed" spacing="xs">
                    {section.items.map((item) => (
                      <List.Item key={item}>{item}</List.Item>
                    ))}
                  </List>
                ) : null}
                {section.links?.length ? (
                  <Group gap="lg">
                    {section.links.map((link) => (
                      <Anchor
                        key={link.href}
                        href={link.href}
                        target={
                          link.href.startsWith("http") ? "_blank" : undefined
                        }
                        rel={
                          link.href.startsWith("http")
                            ? "noreferrer"
                            : undefined
                        }
                      >
                        {link.label}
                      </Anchor>
                    ))}
                  </Group>
                ) : null}
              </Stack>
            </Card>
          ))}
        </Stack>

        {footer}
      </Stack>
    </PageSection>
  );
}
