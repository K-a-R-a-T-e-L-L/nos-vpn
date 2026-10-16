import { Body, Controller } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { UserAuthType } from '@common/decorators/auth.helpers'
import { UserDockGetOne, UserDockPost } from '@common/swagger/user.swagger.helper'

import { UserDecorator } from '../../system/user/decorators/user.decorator'
import { User } from '../../system/user/entity/user.entity'
import { AttachReferralDto } from '../dto/attach-referral.dto'
import { ReferralStatsDto } from '../dto/referral-stats.dto'
import { ReferralService } from '../services/referral.service'

@Controller('user/referral')
@ApiTags('Referral')
export class ReferralUserController {
    constructor(private readonly referralService: ReferralService) {}

    @UserDockGetOne('', UserAuthType.USER, ReferralStatsDto, 'Получить реферальную статистику пользователя')
    async getStats(@UserDecorator() user: User) {
        return this.referralService.getReferralStats(user.id)
    }

    @UserDockPost('attach', UserAuthType.USER, AttachReferralDto, ReferralStatsDto, 'Привязать пригласившего пользователя')
    async attachReferral(@UserDecorator() user: User, @Body() dto: AttachReferralDto) {
        await this.referralService.attachReferrer(user.id, dto.referralCode)
        return this.referralService.getReferralStats(user.id)
    }
}
