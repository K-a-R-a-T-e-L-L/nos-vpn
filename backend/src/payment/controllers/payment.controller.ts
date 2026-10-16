import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'
import { UserDockGetOne } from '@common/swagger/user.swagger.helper'

import { UserDecorator } from '../../system/user/decorators/user.decorator'
import { User } from '../../system/user/entity/user.entity'
import { CreatePlategaCryptoPaymentDto } from '../dto/create-platega-crypto-payment.dto'
import { PaymentCheckoutOptionsDto } from '../dto/payment-checkout-options.dto'
import { YooKassaWebhookDto } from '../dto/yookassa-webhook.dto'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentCanonicalProcessingService } from '../services/payment-canonical-processing.service'
import { PaymentCheckoutOptionsService } from '../services/payment-checkout-options.service'
import { PaymentService } from '../services/payment.service'

@Controller('payments')
@ApiTags('Payments')
export class PaymentController {
    constructor(
        private readonly paymentService: PaymentService,
        private readonly canonicalProcessing: PaymentCanonicalProcessingService,
        private readonly checkoutOptions: PaymentCheckoutOptionsService,
    ) {}

    @Get('checkout-options/:planId')
    @UserAuth(UserAuthType.USER)
    @ApiOkResponse({ type: PaymentCheckoutOptionsDto })
    checkoutOptionsForPlan(@UserDecorator() user: User, @Param('planId') planId: string) {
        return this.checkoutOptions.getForPlan(planId, PaymentMerchant.SITE, user.id)
    }

    @Post('platega/crypto')
    @UserAuth(UserAuthType.USER)
    createPlategaCryptoPayment(@UserDecorator() user: User, @Body() dto: CreatePlategaCryptoPaymentDto) {
        return this.paymentService.createCryptoPaymentForUser(user.id, dto.planId, dto.promoCode)
    }

    @Post('platega/webhook')
    async plategaWebhook(@Body() data: any, @Headers() headers: Record<string, any>, @Req() request: any) {
        return this.paymentService.handlePlategaWebhook(data, headers, request?.rawBody)
    }

    @UserDockGetOne(':paymentId/status', UserAuthType.USER, null, 'Проверить и синхронизировать статус платежа')
    async getPaymentStatus(@UserDecorator() user: User, @Param('paymentId') paymentId: string) {
        return this.paymentService.checkPaymentForUser(paymentId, user.id)
    }

    @Post('webhooks/yookassa/site')
    @HttpCode(200)
    yookassaSiteWebhook(@Body() data: YooKassaWebhookDto, @Headers() headers: Record<string, unknown>) {
        return this.canonicalProcessing.handleWebhook(PaymentMerchant.SITE, data, headers)
    }

    @Post('webhooks/yookassa/bot')
    @HttpCode(200)
    yookassaBotWebhook(@Body() data: YooKassaWebhookDto, @Headers() headers: Record<string, unknown>) {
        return this.canonicalProcessing.handleWebhook(PaymentMerchant.BOT, data, headers)
    }
}
