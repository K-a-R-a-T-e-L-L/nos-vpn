import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'

import { BillingAdminService } from '../billing-admin.service'
import { Meter } from '../entities/meter.entity'

@ApiTags('Admin billing meters')
@Controller('admin/billing/meters')
export class MeterController {
    constructor(private readonly billingAdminService: BillingAdminService) {}

    @Get()
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List meters' })
    @ApiResponse({ status: 200, type: [Meter] })
    list() {
        return this.billingAdminService.listMeters()
    }

    @Post()
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Create meter' })
    @ApiResponse({ status: 201, type: Meter })
    create(@Body() dto: Partial<Meter>) {
        return this.billingAdminService.createMeter(dto)
    }

    @Delete(':id')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Delete meter by id' })
    @ApiResponse({ status: 200, type: Meter })
    remove(@Param('id') id: string) {
        return this.billingAdminService.removeMeter(id)
    }
}
