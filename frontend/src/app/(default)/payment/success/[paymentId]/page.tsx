import PaymentStatusAutoSync from "@/widgets/pages/PaymentStatusPage/PaymentStatusAutoSync.client";

type PaymentSuccessByIdPageProps = {
  params: Promise<{
    paymentId: string;
  }>;
};

export default async function PaymentSuccessByIdPage({ params }: PaymentSuccessByIdPageProps) {
  const { paymentId } = await params;

  return <PaymentStatusAutoSync paymentId={paymentId} initialStatus="success" />;
}
