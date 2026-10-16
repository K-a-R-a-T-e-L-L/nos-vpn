import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { In, LessThan, Repository } from 'typeorm'

import { Payment } from '../entity/payment.entity'
import { PaymentActivationStatus } from '../enum/payment-activation-status.enum'
import { PaymentCanonicalProcessingService } from '../services/payment-canonical-processing.service'

@Injectable()
export class PaymentActivationReconcileJob {
    constructor(
        private readonly config: ConfigService,
        private readonly canonical: PaymentCanonicalProcessingService,
        @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    ) {}

    @Cron('*/5 * * * *')
    async run(): Promise<void> {
        if (this.config.get<string>('PAYMENT_ACTIVATION_RECONCILIATION_ENABLED') !== 'true') return
        const due = await this.payments.find({
            where: [
                { activationStatus: In([PaymentActivationStatus.PENDING, PaymentActivationStatus.FAILED_RETRYABLE]) },
                {
                    activationStatus: PaymentActivationStatus.PROCESSING,
                    activationLeaseExpiresAt: LessThan(new Date()),
                },
            ],
            order: { createdAt: 'ASC', id: 'ASC' },
            take: 100,
        })
        for (const payment of due) await this.canonical.reconcileActivation(payment.id)
    }
}
