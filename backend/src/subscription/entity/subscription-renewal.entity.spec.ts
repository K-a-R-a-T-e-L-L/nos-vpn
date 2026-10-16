import { getMetadataArgsStorage } from 'typeorm'

import { SubscriptionRenewal } from './subscription-renewal.entity'
import { SubscriptionRenewalStatus } from '../enum/subscription-renewal-status.enum'

const storage = getMetadataArgsStorage()

describe('SubscriptionRenewal entity metadata', () => {
    it('defines one renewal per persisted billing period without a database connection', () => {
        const table = storage.tables.find((entry) => entry.target === SubscriptionRenewal)
        const columns = storage.columns.filter((entry) => entry.target === SubscriptionRenewal)
        const subscriptionRelation = storage.relations.find(
            (entry) => entry.target === SubscriptionRenewal && entry.propertyName === 'subscription',
        )
        const methodRelation = storage.relations.find(
            (entry) => entry.target === SubscriptionRenewal && entry.propertyName === 'paymentMethod',
        )
        const paymentRelation = storage.relations.find(
            (entry) => entry.target === SubscriptionRenewal && entry.propertyName === 'succeededPayment',
        )

        expect(table?.name).toBe('subscription_renewals')
        expect(columns.find((entry) => entry.propertyName === 'merchant')?.options.enumName).toBe('payment_merchant_enum')
        expect(columns.find((entry) => entry.propertyName === 'status')?.options.default).toBe(SubscriptionRenewalStatus.PLANNED)
        expect(columns.find((entry) => entry.propertyName === 'periodStart')?.options.type).toBe('timestamptz')
        expect(columns.find((entry) => entry.propertyName === 'periodEnd')?.options.type).toBe('timestamptz')
        expect(columns.some((entry) => entry.propertyName === 'userId')).toBe(false)
        expect(storage.indices).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ target: SubscriptionRenewal, name: 'UQ_subscription_renewals_subscription_period', columns: ['subscriptionId', 'billingPeriodKey'], unique: true }),
            ]),
        )
        expect(subscriptionRelation?.options.onDelete).toBe('RESTRICT')
        expect(methodRelation?.options.onDelete).toBe('SET NULL')
        expect(paymentRelation?.options.onDelete).toBe('SET NULL')
    })
})
