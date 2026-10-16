import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'

import { BillingAdminService } from '../billing-admin.service'
import { UsageEvent } from '../entities/usage-event.entity'
import { UsageLineItem } from '../entities/usage-line-item.entity'

@ApiTags('Admin billing usage')
@Controller('admin/billing/usage')
export class UsageController {
    constructor(private readonly billingAdminService: BillingAdminService) {}

    @Get('events')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List usage events (optional runLogId)' })
    @ApiResponse({ status: 200, type: [UsageEvent] })
    listEvents(@Query('runLogId') runLogId?: string) {
        return this.billingAdminService.listUsageEvents(runLogId)
    }

    @Get('line-items')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List usage line items (optional usageEventId)' })
    @ApiResponse({ status: 200, type: [UsageLineItem] })
    listLineItems(@Query('usageEventId') usageEventId?: string) {
        return this.billingAdminService.listUsageLineItems(usageEventId)
    }
}
