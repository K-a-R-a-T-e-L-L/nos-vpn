import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common'
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'

import { UserDecorator } from '../../system/user/decorators/user.decorator'
import { User } from '../../system/user/entity/user.entity'
import {
    CreatePlategaRecurrentAgreementDto,
    PlategaChargeCallbackDto,
    PlategaRecurrentAgreementResponseDto,
    PlategaSubscriptionStatusCallbackDto,
} from '../dto/platega-recurrent.dto'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PlategaRecurrentAgreementService } from '../services/platega-recurrent-agreement.service'
import { PlategaRecurrentCallbackService } from '../services/platega-recurrent-callback.service'

@ApiTags('Platega recurrent')
@Controller('payments/platega/recurrent')
export class PlategaRecurrentUserController {
    constructor(private readonly agreements: PlategaRecurrentAgreementService) {}

    @Post()
    @UserAuth(UserAuthType.USER)
    @ApiHeader({ name: 'Idempotency-Key', required: true })
    @ApiOperation({ summary: 'Create a feature-gated Platega recurrent agreement' })
    @ApiOkResponse({ type: PlategaRecurrentAgreementResponseDto })
    create(
        @UserDecorator() user: User,
        @Body() dto: CreatePlategaRecurrentAgreementDto,
        @Headers('idempotency-key') idempotencyKey: string,
    ) {
        return this.agreements.create(user.id, dto, idempotencyKey, PaymentMerchant.SITE)
    }

    @Get(':id')
    @UserAuth(UserAuthType.USER)
    @ApiOperation({ summary: 'Read an owned Platega recurrent agreement' })
    @ApiOkResponse({ type: PlategaRecurrentAgreementResponseDto })
    read(@UserDecorator() user: User, @Param('id') id: string) {
        return this.agreements.readOwn(id, user.id)
    }
}

@ApiTags('Platega recurrent callbacks')
@Controller('payments/webhooks/platega/recurrent')
export class PlategaRecurrentCallbackController {
    constructor(private readonly callbacks: PlategaRecurrentCallbackService) {}

    @Post('subscription-status')
    @HttpCode(200)
    @ApiOperation({ summary: 'Handle Platega recurrent mandate status callback' })
    subscriptionStatus(@Body() dto: PlategaSubscriptionStatusCallbackDto, @Headers() headers: Record<string, any>) {
        return this.callbacks.handleSubscriptionStatus(dto, headers)
    }

    @Post('charge-status')
    @HttpCode(200)
    @ApiOperation({ summary: 'Handle Platega recurrent charge callback' })
    charge(@Body() dto: PlategaChargeCallbackDto, @Headers() headers: Record<string, any>) {
        return this.callbacks.handleCharge(dto, headers)
    }
}

@ApiTags('Admin Platega recurrent')
@Controller('admin/payments/platega/recurrent')
export class PlategaRecurrentAdminController {
    constructor(private readonly agreements: PlategaRecurrentAgreementService) {}

    @Post(':id/cancel')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Cancel a Platega recurrent agreement through support/admin' })
    @ApiOkResponse({ type: PlategaRecurrentAgreementResponseDto })
    cancel(@Param('id') id: string) {
        return this.agreements.cancelByAdmin(id)
    }

    @Post(':id/reconcile')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Reconcile a Platega recurrent agreement with provider state' })
    @ApiOkResponse({ type: PlategaRecurrentAgreementResponseDto })
    reconcile(@Param('id') id: string) {
        return this.agreements.reconcileByAdmin(id)
    }
}
