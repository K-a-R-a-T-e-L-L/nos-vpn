import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, Index } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { PaymentMerchant } from '../enum/payment-merchant.enum'

@Entity('payment_webhook_events')
@Index(['provider', 'idempotencyKey'], { unique: true })
export class PaymentWebhookEvent extends BaseEntity {
    @ApiProperty()
    @Column()
    provider: string

    @Column({
        name: 'merchant',
        type: 'enum',
        enum: PaymentMerchant,
        enumName: 'payment_merchant_enum',
        nullable: true,
    })
    merchant?: PaymentMerchant | null

    @ApiProperty({ required: false })
    @Column({ name: 'provider_event_id', nullable: true })
    providerEventId?: string

    @ApiProperty({ required: false })
    @Column({ name: 'provider_payment_id', nullable: true })
    providerPaymentId?: string

    @ApiProperty()
    @Column({ name: 'event_type' })
    eventType: string

    @ApiProperty({ required: false })
    @Column({ nullable: true })
    status?: string

    @ApiProperty({ required: false, type: Object, additionalProperties: true })
    @Column({ name: 'raw_body', type: 'jsonb', nullable: true })
    rawBody?: Record<string, any>

    @ApiProperty({ required: false, type: Object, additionalProperties: true })
    @Column({ type: 'jsonb', nullable: true })
    headers?: Record<string, any>

    @ApiProperty()
    @Column({ name: 'signature_valid', default: false })
    signatureValid: boolean

    @ApiProperty()
    @Column({ default: false })
    processed: boolean

    @ApiProperty({ required: false })
    @Column({ name: 'processing_error', type: 'text', nullable: true })
    processingError?: string

    @ApiProperty()
    @Column({ name: 'received_at', type: 'timestamptz' })
    receivedAt: Date

    @ApiProperty({ required: false })
    @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
    processedAt?: Date

    @ApiProperty()
    @Column({ name: 'idempotency_key' })
    idempotencyKey: string
}
