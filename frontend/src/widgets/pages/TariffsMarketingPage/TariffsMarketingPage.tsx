import { Stack } from "@mantine/core";

import { PageSection } from "@/shared/ui/PageSection/PageSection";
import { getPublicPlansCatalog } from "@/widgets/pages/shared/plans/public-plans.server";

import { faqItems, fitCards, steps, valueItems } from "./TariffsMarketingPage.data";
import FinalCtaSection from "./sections/FinalCtaSection/FinalCtaSection";
import FitSection from "./sections/FitSection/FitSection";
import HeroSection from "./sections/HeroSection/HeroSection";
import InfoSection from "./sections/InfoSection/InfoSection";
import PlansSection from "./sections/PlansSection/PlansSection";

export default async function TariffsMarketingPage() {
  let catalog = null;
  let hasError = false;

  try {
    catalog = await getPublicPlansCatalog();
  } catch {
    hasError = true;
  }

  const recommendedPlan =
    catalog?.rows.find((row) => row.devicesLimit === 2)?.plans[0] ??
    catalog?.rows[0]?.plans[0] ??
    null;
  const primaryHref = recommendedPlan ? `/checkout?planId=${recommendedPlan.id}` : "/tariffs";

  return (
    <PageSection>
      <Stack gap="xl">
        <HeroSection primaryHref={primaryHref} valueItems={valueItems} />
        <FitSection items={fitCards} />
        <PlansSection catalog={catalog} hasError={hasError} />
        <InfoSection steps={steps} faqItems={faqItems} />
        <FinalCtaSection primaryHref={primaryHref} />
      </Stack>
    </PageSection>
  );
}
