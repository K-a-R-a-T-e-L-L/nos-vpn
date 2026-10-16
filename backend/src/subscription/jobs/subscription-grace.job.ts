import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThanOrEqual, Repository } from 'typeorm'

import { Subscription } from '../entity/subscription.entity'
import { StatusesEnum } from '../enum/statuses.enum'
import { SubscriptionLifecycleOrchestrator } from '../services/subscription-lifecycle.orchestrator'

@Injectable()
export class SubscriptionGraceJob {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepository: Repository<Subscription>,
        private readonly orchestrator: SubscriptionLifecycleOrchestrator,
    ) {}

    @Cron(CronExpression.EVERY_10_MINUTES)
    async run() {
        const now = new Date()

        const toGrace = await this.subscriptionRepository.find({
            where: {
                status: StatusesEnum.ACTIVE,
                endsAt: LessThanOrEqual(now),
            },
        })

        for (const sub of toGrace) {
            await this.orchestrator.enterGrace(sub.id, `grace-enter-${sub.id}-${now.getTime()}`)
        }

        const toExpire = await this.subscriptionRepository.find({
            where: {
                status: StatusesEnum.GRACE,
                graceEndsAt: LessThanOrEqual(now),
            },
        })

        for (const sub of toExpire) {
            await this.orchestrator.expireFromGrace(sub.id, `grace-expire-${sub.id}-${now.getTime()}`)
        }
    }
}
