export type YooKassaReceiptMode = 'DISABLED' | 'YOOKASSA'

export type YooKassaReceipt = {
    customer: { email: string }
    items: Array<{
        description: string
        quantity: '1.00'
        amount: { value: string; currency: 'RUB' }
        vat_code: number
        payment_subject: string
        payment_mode: string
    }>
}
