import { getMetadataArgsStorage } from 'typeorm'

import { PaymentAttempt } from './payment-attempt.entity'
import { PaymentAttemptStatus } from '../enum/payment-attempt-status.enum'
import { PaymentAttemptType } from '../enum/payment-attempt-type.enum'

const storage = getMetadataArgsStorage()

describe('PaymentAttempt entity metadata', () => {
    it('defines idempotent payment attempts without a database connection', () => {
        const table = storage.tables.find((entry) => entry.target === PaymentAttempt)
        const columns = storage.columns.filter((entry) => entry.target === PaymentAttempt)
        const status = columns.find((entry) => entry.propertyName === 'status')
        const attemptType = columns.find((entry) => entry.propertyName === 'attemptType')
        const attemptNumber = columns.find((entry) => entry.propertyName === 'attemptNumber')
        const retryable = columns.find((entry) => entry.propertyName === 'retryable')
        const paymentRelation = storage.relations.find(
            (entry) => entry.target === PaymentAttempt && entry.propertyName === 'payment',
        )
        const renewalRelation = storage.relations.find(
            (entry) => entry.target === PaymentAttempt && entry.propertyName === 'renewal',
        )

        expect(table?.name).toBe('payment_attempts')
        expect(status?.options).toEqual(expect.objectContaining({ enumName: 'payment_attempt_status_enum', default: PaymentAttemptStatus.CREATED }))
        expect(attemptType?.options).toEqual(expect.objectContaining({ enumName: 'payment_attempt_type_enum', default: PaymentAttemptType.INITIAL }))
        expect(attemptNumber?.options.default).toBe(1)
        expect(retryable?.options.default).toBe(false)
        expect(columns.find((entry) => entry.propertyName === 'requestSnapshot')?.options.type).toBe('jsonb')
        expect(columns.find((entry) => entry.propertyName === 'responseSnapshot')?.options.type).toBe('jsonb')
        expect(storage.indices).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ target: PaymentAttempt, name: 'UQ_payment_attempts_idempotency_key', columns: ['idempotencyKey'], unique: true }),
                expect.objectContaining({ target: PaymentAttempt, name: 'UQ_payment_attempts_payment_number', columns: ['paymentId', 'attemptNumber'], unique: true }),
            ]),
        )
        expect(paymentRelation?.options.onDelete).toBe('RESTRICT')
        expect(renewalRelation?.options.onDelete).toBe('SET NULL')
    })
})
