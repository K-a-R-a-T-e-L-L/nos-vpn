import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { UserAuthType } from '@common/decorators/auth.helpers'
import { UserDockPost } from '@common/swagger/user.swagger.helper'

import { UserDecorator } from '../../system/user/decorators/user.decorator'
import { User } from '../../system/user/entity/user.entity'
import { ClaimAttributionDto } from '../dto/claim-attribution.dto'
import { AnalyticsService } from '../services/analytics.service'

@Controller('user/attribution')
@ApiTags('User attribution')
export class UserAttributionController {
    constructor(private readonly analyticsService: AnalyticsService) {}

    @UserDockPost('claim', UserAuthType.USER, ClaimAttributionDto, null, 'Привязать источник трафика к пользователю')
    async claim(@UserDecorator() user: User, @Body() dto: ClaimAttributionDto) {
        return this.analyticsService.claimUserSource(user.id, dto.sourceCode, {
            entryPoint: 'website',
            landingPath: dto.landingPath,
        })
    }
}
