import { legalPages } from "@/widgets/pages/shared/legal/legal.data";
import LegalPageLayout from "@/widgets/pages/shared/legal/LegalPageLayout";

export default function PrivacyPage() {
  return <LegalPageLayout page={legalPages.privacy} />;
}
