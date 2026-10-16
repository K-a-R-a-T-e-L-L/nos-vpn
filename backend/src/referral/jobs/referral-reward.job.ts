import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

import { ReferralService } from '../services/referral.service'

@Injectable()
export class ReferralRewardJob {
    constructor(private readonly referralService: ReferralService) {}

    @Cron(CronExpression.EVERY_HOUR)
    async run() {
        await this.referralService.awardEligibleBonuses()
    }
}
