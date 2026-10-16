import { Suspense } from "react";

import CheckoutPageClient from "@/widgets/pages/CheckoutPage/CheckoutPage.client";

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutPageClient />
    </Suspense>
  );
}
