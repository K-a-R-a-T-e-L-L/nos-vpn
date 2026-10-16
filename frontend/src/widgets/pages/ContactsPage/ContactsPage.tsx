import { legalPages } from "@/widgets/pages/shared/legal/legal.data";
import LegalPageLayout from "@/widgets/pages/shared/legal/LegalPageLayout";
import LegalSupportCard from "@/widgets/pages/shared/legal/LegalSupportCard";

export default function ContactsPage() {
  return <LegalPageLayout page={legalPages.contacts} footer={<LegalSupportCard />} />;
}
