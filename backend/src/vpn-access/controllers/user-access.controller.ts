import { Controller } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { UserAuthType } from '@common/decorators/auth.helpers'
import { UserDockGetOne } from '@common/swagger/user.swagger.helper'

import { AnalyticsService } from '../../analytics/services/analytics.service'
import { Subscription } from '../../subscription/entity/subscription.entity'
import { SubscriptionService } from '../../subscription/services/subscription.service'
import { UserDecorator } from '../../system/user/decorators/user.decorator'
import { User } from '../../system/user/entity/user.entity'
import { UserAccessResponseDto } from '../dto/user-access-response.dto'
import { AccessPresentationService } from '../services/access-presentation.service'

@Controller('user/access')
@ApiTags('User access')
export class UserAccessController {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepository: Repository<Subscription>,
        private readonly accessPresentationService: AccessPresentationService,
        private readonly subscriptionService: SubscriptionService,
        private readonly analyticsService: AnalyticsService,
    ) {}

    @UserDockGetOne('', UserAuthType.USER, UserAccessResponseDto)
    async getAccess(@UserDecorator() user: User) {
        const subscription = await this.subscriptionRepository.findOne({
            where: { userId: user.id },
        })

        if (!subscription) {
            return null
        }

        const resolvedSubscription = await this.subscriptionService.getResolvedById(subscription.id)
        if (!resolvedSubscription) {
            return null
        }

        await this.analyticsService.trackAccessViewed(user.id, {
            channel: 'web',
            subscriptionId: subscription.id,
        })
        return this.accessPresentationService.buildPayload(subscription.id, resolvedSubscription)
    }
}
