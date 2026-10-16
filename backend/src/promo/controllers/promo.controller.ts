import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'
import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { PlanService } from '../../plan/services/plan.service'
import { UserDecorator } from '../../system/user/decorators/user.decorator'
import { User } from '../../system/user/entity/user.entity'
import { ValidatePromoCodeDto } from '../dto/validate-promo-code.dto'
import { PromoService } from '../services/promo.service'


@ApiTags('Promo codes')
@Controller('promo-codes')
export class PromoController {
    constructor(
        private readonly promoService: PromoService,
        private readonly planService: PlanService,
    ) {}

    @Post('validate')
    @UserAuth(UserAuthType.USER)
    async validate(@UserDecorator() user: User, @Body() dto: ValidatePromoCodeDto) {
        let baseAmount = 0
        if (dto.planId) {
            const plan = await this.planService.getOne({ where: { id: dto.planId } })
            if (!plan) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Plan not found')
            }
            baseAmount = Number(plan.amount) || 0
        }

        return this.promoService.validatePromoForUser(dto.code, user.id, baseAmount)
    }
}
