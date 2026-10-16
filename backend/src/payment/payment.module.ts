import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { PaymentController } from './controllers/payment.controller'
import { PaymentAdminNotification } from './entity/payment-admin-notification.entity'
import { Payment } from './entity/payment.entity'
import { PaymentService } from './services/payment.service'
import { YooKassaSynchronizeBootstrapService } from '../database/yookassa-synchronize-bootstrap.service'
import { Plan } from '../plan/entity/plan.entity'
import { PromoCode } from '../promo/entity/promo-code.entity'
import { PromoModule } from '../promo/promo.module'
import { SubscriptionModule } from '../subscription/subscription.module'
import {
    PlategaRecurrentAdminController,
    PlategaRecurrentCallbackController,
    PlategaRecurrentUserController,
} from './controllers/platega-recurrent.controller'
import { PaymentAttempt } from './entity/payment-attempt.entity'
import { PaymentWebhookEvent } from './entity/payment-webhook-event.entity'
import { PlategaPaymentProvider } from './providers/platega-payment.provider'
import { ReferralModule } from '../referral/referral.module'
import { PaymentMethod } from './entity/payment-method.entity'
import { PlategaRecurrentAgreement } from './entity/platega-recurrent-agreement.entity'
import { PaymentActivationReconcileJob } from './jobs/payment-activation-reconcile.job'
import { PaymentAdminNotificationJob } from './jobs/payment-admin-notification.job'
import { PaymentProviderPolicyService } from './providers/payment-provider-policy.service'
import { PlategaRecurrentPlanPolicy } from './providers/platega-recurrent-plan.policy'
import { PlategaRecurrentProvider } from './providers/platega-recurrent.provider'
import { YooKassaPaymentProvider } from './providers/yookassa-payment.provider'
import { PaymentAdminNotificationService } from './services/payment-admin-notification.service'
import { PaymentCanonicalProcessingService } from './services/payment-canonical-processing.service'
import { PaymentCheckoutOptionsService } from './services/payment-checkout-options.service'
import { PaymentCreateService } from './services/payment-create.service'
import { PaymentMethodService } from './services/payment-method.service'
import { PaymentProviderRoutingService } from './services/payment-provider-routing.service'
import { PaymentReceiptPolicyService } from './services/payment-receipt-policy.service'
import { PaymentReconciliationService } from './services/payment-reconciliation.service'
import {
    PAYMENT_CANONICAL_PROCESSING,
    PAYMENT_SUBSCRIPTION_ORCHESTRATOR,
    PAYMENT_SUBSCRIPTION_SERVICE,
} from './services/payment-service.tokens'
import { PaymentSideEffectsService } from './services/payment-side-effects.service'
import { PaymentStatusService } from './services/payment-status.service'
import { PlategaRecurrentAgreementService } from './services/platega-recurrent-agreement.service'
import { PlategaRecurrentCallbackService } from './services/platega-recurrent-callback.service'
import { Subscription } from '../subscription/entity/subscription.entity'
import { SubscriptionLifecycleOrchestrator } from '../subscription/services/subscription-lifecycle.orchestrator'
import { SubscriptionService } from '../subscription/services/subscription.service'
import { User } from '../system/user/entity/user.entity'

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Payment,
            PaymentWebhookEvent,
            PaymentAdminNotification,
            PaymentMethod,
            PaymentAttempt,
            Plan,
            User,
            PromoCode,
            Subscription,
            PlategaRecurrentAgreement,
        ]),
        forwardRef(() => SubscriptionModule),
        ReferralModule,
        PromoModule,
    ],
    providers: [
        PaymentService,
        PlategaPaymentProvider,
        YooKassaPaymentProvider,
        PaymentProviderPolicyService,
        PaymentProviderRoutingService,
        PaymentSideEffectsService,
        PaymentStatusService,
        PaymentCreateService,
        PaymentCheckoutOptionsService,
        { provide: PAYMENT_SUBSCRIPTION_SERVICE, useExisting: SubscriptionService },
        { provide: PAYMENT_SUBSCRIPTION_ORCHESTRATOR, useExisting: SubscriptionLifecycleOrchestrator },
        { provide: PAYMENT_CANONICAL_PROCESSING, useExisting: PaymentCanonicalProcessingService },
        PaymentMethodService,
        PaymentReceiptPolicyService,
        PaymentCanonicalProcessingService,
        PaymentReconciliationService,
        PaymentActivationReconcileJob,
        PaymentAdminNotificationService,
        PaymentAdminNotificationJob,
        YooKassaSynchronizeBootstrapService,
        PlategaRecurrentProvider,
        PlategaRecurrentPlanPolicy,
        PlategaRecurrentAgreementService,
        PlategaRecurrentCallbackService,
    ],
    controllers: [
        PaymentController,
        PlategaRecurrentUserController,
        PlategaRecurrentCallbackController,
        PlategaRecurrentAdminController,
    ],
    exports: [
        PaymentService,
        PaymentMethodService,
        YooKassaPaymentProvider,
        PaymentReceiptPolicyService,
        PaymentCanonicalProcessingService,
        PaymentCheckoutOptionsService,
        PlategaRecurrentAgreementService,
    ],
})
export class PaymentModule {}
