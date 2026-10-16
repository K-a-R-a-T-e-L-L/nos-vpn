import { ConfigService } from '@nestjs/config'

import { PaymentReceiptPolicyService } from './payment-receipt-policy.service'
import { PaymentMerchant } from '../enum/payment-merchant.enum'

describe('PaymentReceiptPolicyService', () => {
    it('returns null in explicit disabled mode', () => {
        const service = new PaymentReceiptPolicyService(new ConfigService({ YOOKASSA_SITE_RECEIPT_MODE: 'DISABLED' }))
        expect(
            service.buildReceipt({
                merchant: PaymentMerchant.SITE,
                amountRub: 399,
                itemDescription: 'NOS VPN',
            }),
        ).toBeNull()
    })

    it('fails closed before a request when fiscal configuration is incomplete', () => {
        const service = new PaymentReceiptPolicyService(new ConfigService({ YOOKASSA_SITE_RECEIPT_MODE: 'YOOKASSA' }))
        expect(() =>
            service.buildReceipt({
                merchant: PaymentMerchant.SITE,
                customerEmail: 'user@example.com',
                amountRub: 399,
                itemDescription: 'NOS VPN',
            }),
        ).toThrow('VAT_CODE')
    })

    it('builds an exact one-item receipt without guessing fiscal values', () => {
        const service = new PaymentReceiptPolicyService(
            new ConfigService({
                YOOKASSA_BOT_RECEIPT_MODE: 'YOOKASSA',
                YOOKASSA_BOT_VAT_CODE: '4',
                YOOKASSA_BOT_PAYMENT_SUBJECT: 'service',
                YOOKASSA_BOT_PAYMENT_MODE: 'full_payment',
            }),
        )
        expect(
            service.buildReceipt({
                merchant: PaymentMerchant.BOT,
                customerEmail: ' User@Example.com ',
                amountRub: 399,
                itemDescription: 'Продление NOS VPN',
            }),
        ).toEqual({
            customer: { email: 'user@example.com' },
            items: [
                {
                    description: 'Продление NOS VPN',
                    quantity: '1.00',
                    amount: { value: '399.00', currency: 'RUB' },
                    vat_code: 4,
                    payment_subject: 'service',
                    payment_mode: 'full_payment',
                },
            ],
        })
    })
})
