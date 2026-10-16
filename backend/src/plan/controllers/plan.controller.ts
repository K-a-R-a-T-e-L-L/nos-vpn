import { Controller, Get } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Paginate, PaginateQuery } from 'nestjs-paginate'

import { UserAuthType } from '@common/decorators/auth.helpers'
import { PlansPaginated } from '@common/pagination/paginated.configs'
import { UserDockGetMany } from '@common/swagger/user.swagger.helper'

import { Plan } from '../entity/plan.entity'
import { PlanService } from '../services/plan.service'

@Controller('plans')
@ApiTags('Plans')
export class PlanController {
    constructor(private readonly planService: PlanService) {}

    @UserDockGetMany('', UserAuthType.NOT_AUTH, Plan, PlansPaginated, 'Получить список тарифов')
    async get(@Paginate() query: PaginateQuery) {
        return this.planService.findAll(query, PlansPaginated)
    }

    @Get('catalog')
    async getCatalog() {
        return this.planService.getPublicCatalog()
    }
}
