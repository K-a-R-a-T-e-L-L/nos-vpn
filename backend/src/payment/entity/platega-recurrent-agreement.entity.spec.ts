import { getMetadataArgsStorage } from 'typeorm'

import { Payment } from './payment.entity'
import { PlategaRecurrentAgreement } from './platega-recurrent-agreement.entity'

describe('Platega recurrent database constraints', () => {
    it('has merchant-scoped unique provider subscription and create-operation indexes', () => {
        const indexes = getMetadataArgsStorage().indices.filter((item) => item.target === PlategaRecurrentAgreement)
        expect(indexes.some((item) => item.name === 'UQ_platega_recurrent_provider_subscription' && item.unique)).toBe(
            true,
        )
        expect(indexes.some((item) => item.name === 'UQ_platega_recurrent_create_operation' && item.unique)).toBe(true)
    })

    it('has a merchant-scoped unique Platega recurrent charge index', () => {
        const index = getMetadataArgsStorage().indices.find(
            (item) => item.target === Payment && item.name === 'UQ_payments_platega_recurrent_charge',
        )
        expect(index?.unique).toBe(true)
        expect(String(index?.where)).toContain('is_recurring')
    })

    it('keeps durable consent fields backward-compatible for legacy agreements', () => {
        const columns = getMetadataArgsStorage().columns.filter((item) => item.target === PlategaRecurrentAgreement)
        expect(columns.find((item) => item.propertyName === 'consentAcceptedAt')?.options.nullable).toBe(true)
        expect(columns.find((item) => item.propertyName === 'consentLegalVersion')?.options.nullable).toBe(true)
    })
})
