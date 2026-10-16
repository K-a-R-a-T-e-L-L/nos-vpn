import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'

import { BillingAdminService } from '../billing-admin.service'
import { PlanLimit } from '../entities/plan-limit.entity'

@ApiTags('Admin billing plan limits')
@Controller('admin/billing/plan-limits')
export class PlanLimitController {
    constructor(private readonly billingAdminService: BillingAdminService) {}

    @Get()
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List plan limits (optional planId)' })
    @ApiResponse({ status: 200, type: [PlanLimit] })
    list(@Query('planId') planId?: string) {
        return this.billingAdminService.listPlanLimits(planId)
    }

    @Post()
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Create plan limit' })
    @ApiResponse({ status: 201, type: PlanLimit })
    create(@Body() dto: Partial<PlanLimit>) {
        return this.billingAdminService.createPlanLimit(dto)
    }

    @Delete(':id')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Delete plan limit by id' })
    @ApiResponse({ status: 200, type: PlanLimit })
    remove(@Param('id') id: string) {
        return this.billingAdminService.removePlanLimit(id)
    }
}
