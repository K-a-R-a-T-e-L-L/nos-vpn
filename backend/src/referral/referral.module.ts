import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ReferralUserController } from './controllers/referral.user.controller'
import { ReferralBonusLedger } from './entity/referral-bonus-ledger.entity'
import { ReferralRewardJob } from './jobs/referral-reward.job'
import { ReferralService } from './services/referral.service'
import { User } from '../system/user/entity/user.entity'

@Module({
    imports: [TypeOrmModule.forFeature([User, ReferralBonusLedger])],
    controllers: [ReferralUserController],
    providers: [ReferralService, ReferralRewardJob],
    exports: [ReferralService],
})
export class ReferralModule {}
