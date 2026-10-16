import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'

import { CreatePromoCodeDto } from '../dto/create-promo-code.dto'
import { UpdatePromoCodeDto } from '../dto/update-promo-code.dto'
import { PromoService } from '../services/promo.service'

@ApiTags('Admin promo codes')
@Controller('admin/promo-codes')
export class AdminPromoController {
    constructor(private readonly promoService: PromoService) {}

    @Get()
    @UserAuth(UserAuthType.ADMIN)
    async list(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
        return this.promoService.listPromoCodes(Number(page) || 1, Number(pageSize) || 25)
    }

    @Post()
    @UserAuth(UserAuthType.ADMIN)
    async create(@Body() dto: CreatePromoCodeDto) {
        return this.promoService.createPromoCode(dto)
    }

    @Patch(':id')
    @UserAuth(UserAuthType.ADMIN)
    async update(@Param('id') id: string, @Body() dto: UpdatePromoCodeDto) {
        return this.promoService.updatePromoCode(id, dto)
    }

    @Delete(':id')
    @UserAuth(UserAuthType.ADMIN)
    async delete(@Param('id') id: string) {
        return this.promoService.deletePromoCode(id)
    }
}
