import PaymentStatusAutoSync from "@/widgets/pages/PaymentStatusPage/PaymentStatusAutoSync.client";

type PaymentFailByIdPageProps = {
  params: Promise<{
    paymentId: string;
  }>;
};

export default async function PaymentFailByIdPage({ params }: PaymentFailByIdPageProps) {
  const { paymentId } = await params;

  return <PaymentStatusAutoSync paymentId={paymentId} initialStatus="fail" />;
}
