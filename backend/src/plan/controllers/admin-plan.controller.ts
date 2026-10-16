import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'

import { CreatePlanDto } from '../dto/create-plan.dto'
import { UpdatePlanDto } from '../dto/update-plan.dto'
import { UpsertPlanCatalogDto } from '../dto/upsert-plan-catalog.dto'
import { PlanService } from '../services/plan.service'

@ApiTags('Admin plans')
@Controller('admin/plans')
export class AdminPlanController {
    constructor(private readonly planService: PlanService) {}

    @Get()
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List all plans' })
    async list() {
        return this.planService.findAllOrdered()
    }

    @Get('catalog')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Get plan catalog matrix' })
    async catalog() {
        return this.planService.getAdminCatalog()
    }

    @Post()
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Create plan' })
    async post(@Body() createPlanDto: CreatePlanDto) {
        return this.planService.createAdminPlan(createPlanDto)
    }

    @Post('catalog')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Upsert full plan catalog matrix' })
    async upsertCatalog(@Body() dto: UpsertPlanCatalogDto) {
        return this.planService.upsertPlanCatalog(dto.plans || [])
    }

    @Patch(':id')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Update plan by id' })
    async update(@Param('id') id: string, @Body() updatePlanDto: UpdatePlanDto) {
        return this.planService.updateAdminPlan(id, updatePlanDto)
    }

    @Delete(':id')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Delete plan by id' })
    async remove(@Param('id') id: string) {
        return this.planService.remove(id)
    }
}
