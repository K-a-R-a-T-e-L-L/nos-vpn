import { PaymentReconciliationService } from './payment-reconciliation.service'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentMethodStatus } from '../enum/payment-method-status.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PaymentStatusEnum } from '../enum/payment-status.enum'

describe('PaymentReconciliationService YooKassa submission safety', () => {
    const persistedKey = '123e4567-e89b-42d3-a456-426614174000'

    function createService(paymentsToReconcile: Record<string, unknown>[] = []) {
        const subscription = {
            id: 'subscription-1',
            planId: 'plan-1',
            plan: { amount: 399 },
            user: { email: 'test@example.invalid' },
            autoRenewPaymentMethodId: 'method-1',
            autoRenewMerchant: PaymentMerchant.BOT,
        }
        const renewal = { id: 'renewal-1', attemptCount: 2 }
        const payments = {
            find: jest.fn(async (_options: Record<string, unknown>) => paymentsToReconcile),
            save: jest.fn(async (payment) => payment),
            manager: {
                getRepository: jest.fn((entity: { name?: string }) => {
                    if (entity.name === 'Subscription') {
                        return { findOne: jest.fn(async () => subscription) }
                    }
                    return { findOneBy: jest.fn(async () => renewal) }
                }),
            },
        }
        const provider = {
            createRecurrentPayment: jest.fn(async () => ({
                providerPaymentId: 'yk-1',
                externalStatus: 'pending',
            })),
            getPayment: jest.fn(),
        }
        const canonical = { processCanonicalPayment: jest.fn(async () => undefined) }
        const methods = {
            getActiveForSubscription: jest.fn(async () => ({
                providerMethodId: 'provider-method-id',
                merchant: PaymentMerchant.BOT,
                provider: PaymentProvider.YOOKASSA,
                status: PaymentMethodStatus.ACTIVE,
            })),
        }
        const service = new PaymentReconciliationService(
            { get: jest.fn(() => 'true') } as any,
            provider as any,
            canonical as any,
            methods as any,
            { buildReceipt: jest.fn(() => null) } as any,
            payments as any,
        )
        return { service, payments, provider }
    }

    it('queries only PENDING payments, so terminal FAILED rows are never resubmitted', async () => {
        const { service, payments, provider } = createService()

        await service.reconcilePending()

        const findOptions = payments.find.mock.calls[0][0] as {
            where: { status: { _value: PaymentStatusEnum[] } }
        }
        const statusOperator = findOptions.where.status
        expect(statusOperator._value).toEqual([PaymentStatusEnum.PENDING])
        expect(provider.createRecurrentPayment).not.toHaveBeenCalled()
    })

    it('reuses the persisted key for the same pending recurrent payment', async () => {
        const payment = {
            id: 'payment-1',
            provider: 'yookassa',
            merchant: PaymentMerchant.BOT,
            status: PaymentStatusEnum.PENDING,
            providerPaymentId: null,
            isRecurring: true,
            idempotencyKey: persistedKey,
            subscriptionId: 'subscription-1',
            planId: 'plan-1',
            paymentMethodId: 'method-1',
            amount: 399,
            metadataSnapshot: { renewal_id: 'renewal-1' },
        }
        const { service, provider } = createService([payment])

        await service.reconcilePending()

        expect(provider.createRecurrentPayment).toHaveBeenCalledWith(
            expect.objectContaining({
                localPaymentId: 'payment-1',
                idempotencyKey: persistedKey,
            }),
        )
    })
})
