import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { YooKassaReceipt, YooKassaReceiptMode } from '../types/yookassa-receipt.types'

@Injectable()
export class PaymentReceiptPolicyService {
    constructor(private readonly config: ConfigService) {}

    buildReceipt(input: {
        merchant: PaymentMerchant
        customerEmail?: string | null
        amountRub: number
        itemDescription: string
    }): YooKassaReceipt | null {
        const prefix = input.merchant === PaymentMerchant.SITE ? 'YOOKASSA_SITE' : 'YOOKASSA_BOT'
        const mode = String(this.config.get<string>(`${prefix}_RECEIPT_MODE`) || 'DISABLED').toUpperCase()
        if (mode === 'DISABLED') return null
        if (mode !== ('YOOKASSA' satisfies YooKassaReceiptMode)) {
            throw new Error(`Invalid ${prefix}_RECEIPT_MODE`)
        }
        const email = String(input.customerEmail || '').trim().toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Receipt customer email is required')
        const vatCode = Number(this.config.get(`${prefix}_VAT_CODE`))
        if (!Number.isInteger(vatCode) || vatCode < 1 || vatCode > 12) {
            throw new Error(`Invalid ${prefix}_VAT_CODE`)
        }
        const paymentSubject = String(this.config.get(`${prefix}_PAYMENT_SUBJECT`) || '').trim()
        const paymentMode = String(this.config.get(`${prefix}_PAYMENT_MODE`) || '').trim()
        if (!paymentSubject || !paymentMode) throw new Error(`Incomplete ${prefix} receipt configuration`)
        if (!Number.isFinite(input.amountRub) || input.amountRub <= 0) throw new Error('Invalid receipt amount')
        const description = Array.from(
            String(input.itemDescription || '').replace(/[\u0000-\u001f\u007f]/g, '').trim(),
        )
            .slice(0, 128)
            .join('')
        if (!description) throw new Error('Receipt description is required')
        return {
            customer: { email },
            items: [
                {
                    description,
                    quantity: '1.00',
                    amount: { value: input.amountRub.toFixed(2), currency: 'RUB' },
                    vat_code: vatCode,
                    payment_subject: paymentSubject,
                    payment_mode: paymentMode,
                },
            ],
        }
    }
}
