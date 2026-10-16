import { legalPages } from "@/widgets/pages/shared/legal/legal.data";
import LegalPageLayout from "@/widgets/pages/shared/legal/LegalPageLayout";

export default function RefundPage() {
  return <LegalPageLayout page={legalPages.refund} />;
}
