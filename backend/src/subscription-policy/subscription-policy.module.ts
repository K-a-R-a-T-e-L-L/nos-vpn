import { Module } from '@nestjs/common'

import { SubscriptionPolicyService } from './subscription-policy.service'

@Module({
    providers: [SubscriptionPolicyService],
    exports: [SubscriptionPolicyService],
})
export class SubscriptionPolicyModule {}
