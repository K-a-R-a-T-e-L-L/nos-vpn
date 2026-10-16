import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { PaymentProviderRoutingService } from './payment-provider-routing.service'
import { Plan } from '../../plan/entity/plan.entity'
import { PaymentCheckoutOptionsDto } from '../dto/payment-checkout-options.dto'
import { PaymentCheckoutMode } from '../enum/payment-checkout-mode.enum'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PlategaPaymentProvider } from '../providers/platega-payment.provider'
import { PlategaRecurrentPlanPolicy } from '../providers/platega-recurrent-plan.policy'
import { PlategaRecurrentProvider } from '../providers/platega-recurrent.provider'
import { YooKassaPaymentProvider } from '../providers/yookassa-payment.provider'

@Injectable()
export class PaymentCheckoutOptionsService {
    constructor(
        @InjectRepository(Plan) private readonly plans: Repository<Plan>,
        private readonly config: ConfigService,
        private readonly paymentProviderRouting: PaymentProviderRoutingService,
        private readonly recurrentPolicy: PlategaRecurrentPlanPolicy,
        private readonly recurrentProvider: PlategaRecurrentProvider,
        private readonly yookassaPaymentProvider: YooKassaPaymentProvider,
        private readonly plategaPaymentProvider: PlategaPaymentProvider,
    ) {}

    async getForPlan(
        planId: string,
        merchant: PaymentMerchant = PaymentMerchant.SITE,
        userId?: string,
    ): Promise<PaymentCheckoutOptionsDto> {
        const plan = await this.plans.findOne({ where: { id: planId, isActive: true } })
        const inspection = plan ? this.recurrentPolicy.inspect(plan) : null
        if (!plan || !inspection?.canonical) throw new NotFoundException('Plan not found')

        const merchantProfile = merchant === PaymentMerchant.SITE ? 'web' : 'bot'
        const oneTimeProvider = this.paymentProviderRouting.resolveCheckoutProvider(PaymentCheckoutMode.ONE_TIME, userId)
        const oneTimeMerchantConfigured =
            oneTimeProvider === PaymentProvider.PLATEGA
                ? this.plategaPaymentProvider.isMerchantConfigured(merchantProfile)
                : this.yookassaPaymentProvider.isMerchantConfigured(merchant)
        const recurrentAvailable =
            inspection.eligible &&
            this.config.get<string>('PLATEGA_RECURRENT_ENABLED') === 'true' &&
            this.recurrentProvider.isConfigured(merchantProfile)
        return {
            planId: plan.id,
            oneTime: {
                available:
                    this.paymentProviderRouting.isCheckoutModeAvailable(PaymentCheckoutMode.ONE_TIME, userId) &&
                    oneTimeMerchantConfigured,
            },
            crypto: {
                available:
                    this.config.get<string>('PLATEGA_CRYPTO_ENABLED') === 'true' &&
                    this.plategaPaymentProvider.isMerchantConfigured(merchantProfile),
            },
            recurrent: { eligible: inspection.eligible, available: recurrentAvailable, cadence: inspection.cadence },
        }
    }
}
