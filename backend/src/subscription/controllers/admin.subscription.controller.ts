import { Body, Controller, Delete, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'

import { AdminApplyPlanDto } from '../dto/admin-apply-plan.dto'
import { SubscriptionService } from '../services/subscription.service'

@ApiTags('Admin subscriptions')
@Controller('admin/subscriptions')
export class AdminSubscriptionController {
    constructor(private readonly subscriptionService: SubscriptionService) {}

    @Post('activate')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Activate subscription by id' })
    activate(@Body('subscriptionId') subscriptionId: string) {
        return this.subscriptionService.activateSubscription(subscriptionId)
    }

    @Delete(':id')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Delete subscription by id' })
    remove(@Param('id') id: string) {
        return this.subscriptionService.remove(id)
    }

    @Post(':id/apply-plan')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Apply paid plan to subscription' })
    applyPlan(@Param('id') subscriptionId: string, @Body() dto: AdminApplyPlanDto) {
        return this.subscriptionService.applyPaidPlan(subscriptionId, dto.planId)
    }
}
