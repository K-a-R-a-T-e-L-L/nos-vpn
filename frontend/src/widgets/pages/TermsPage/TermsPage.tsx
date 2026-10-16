import { legalPages } from "@/widgets/pages/shared/legal/legal.data";
import LegalPageLayout from "@/widgets/pages/shared/legal/LegalPageLayout";

export default function TermsPage() {
  return <LegalPageLayout page={legalPages.terms} />;
}
