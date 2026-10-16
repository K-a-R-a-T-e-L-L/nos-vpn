import { getMetadataArgsStorage } from 'typeorm'

import { PaymentMethod } from './payment-method.entity'
import { PaymentMethodStatus } from '../enum/payment-method-status.enum'

const storage = getMetadataArgsStorage()

describe('PaymentMethod entity metadata', () => {
    it('defines the ledger payment method schema without a database connection', () => {
        const table = storage.tables.find((entry) => entry.target === PaymentMethod)
        const columns = storage.columns.filter((entry) => entry.target === PaymentMethod)
        const provider = columns.find((entry) => entry.propertyName === 'provider')
        const merchant = columns.find((entry) => entry.propertyName === 'merchant')
        const providerMethodId = columns.find((entry) => entry.propertyName === 'providerMethodId')
        const status = columns.find((entry) => entry.propertyName === 'status')
        const userRelation = storage.relations.find(
            (entry) => entry.target === PaymentMethod && entry.propertyName === 'user',
        )

        expect(table?.name).toBe('payment_methods')
        expect(columns.find((entry) => entry.propertyName === 'userId')?.options.name).toBe('user_id')
        expect(provider?.options).toEqual(expect.objectContaining({ name: 'provider', enumName: 'payment_provider_enum' }))
        expect(merchant?.options).toEqual(expect.objectContaining({ name: 'merchant', enumName: 'payment_merchant_enum' }))
        expect(providerMethodId?.options).toEqual(expect.objectContaining({ name: 'provider_method_id', select: false }))
        expect(status?.options).toEqual(expect.objectContaining({ default: PaymentMethodStatus.ACTIVE }))
        expect(storage.indices).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    target: PaymentMethod,
                    name: 'UQ_payment_methods_provider_merchant_method',
                    columns: ['provider', 'merchant', 'providerMethodId'],
                    unique: true,
                }),
                expect.objectContaining({
                    target: PaymentMethod,
                    name: 'IDX_payment_methods_user_status',
                    columns: ['userId', 'status'],
                }),
            ]),
        )
        expect(userRelation?.options.onDelete).toBe('CASCADE')
    })
})
