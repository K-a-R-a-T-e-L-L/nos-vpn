import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { UserAccessController } from './controllers/user-access.controller'
import { VpnAccess } from './entity/vpn-access.entity'
import { VpnAccessReconcileJob } from './jobs/vpn-access-reconcile.job'
import { AccessOperationLog } from './operations/access-operation-log.entity'
import { AccessOperationService } from './operations/access-operation.service'
import { AccessPresentationService } from './services/access-presentation.service'
import { VpnAccessService } from './services/vpn-access.service'
import { BillingModule } from '../billing/billing.module'
import { Subscription } from '../subscription/entity/subscription.entity'
import { SubscriptionModule } from '../subscription/subscription.module'
import { VpnProviderModule } from '../vpn-provider/vpn-provider.module'

@Module({
    imports: [
        TypeOrmModule.forFeature([VpnAccess, Subscription, AccessOperationLog]),
        VpnProviderModule,
        BillingModule,
        forwardRef(() => SubscriptionModule),
    ],
    controllers: [UserAccessController],
    providers: [VpnAccessService, AccessPresentationService, AccessOperationService, VpnAccessReconcileJob],
    exports: [VpnAccessService, AccessPresentationService, AccessOperationService, TypeOrmModule],
})
export class VpnAccessModule {}
