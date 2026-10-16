import { randomUUID } from 'crypto'

import { Body, Controller, UnprocessableEntityException } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { UserAuthType } from '@common/decorators/auth.helpers'
import { UserDockGetOne, UserDockPost } from '@common/swagger/user.swagger.helper'

import { PaymentMerchant } from '../../payment/enum/payment-merchant.enum'
import { PaymentProviderError } from '../../payment/errors/payment-provider.error'
import { UserDecorator } from '../../system/user/decorators/user.decorator'
import { User } from '../../system/user/entity/user.entity'
import { ActionDto } from '../dto/action.dto'
import { AutoRenewResponseDto } from '../dto/auto-renew-response.dto'
import { CreateSubscriptionDto } from '../dto/create-subscription.dto'
import { Subscription } from '../entity/subscription.entity'
import { SubscriptionAutoRenewService } from '../services/subscription-auto-renew.service'
import { SubscriptionService } from '../services/subscription.service'

@Controller('user/subscription')
@ApiTags('Subscriptions')
export class SubscriptionUserController {
    constructor(
        private readonly subscriptionService: SubscriptionService,
        private readonly autoRenewService: SubscriptionAutoRenewService,
    ) {}

    @UserDockGetOne('', UserAuthType.USER, Subscription, 'Получить подписку пользователя')
    async getUserSubscription(@UserDecorator() user: User) {
        return this.subscriptionService.getResolvedForUser(user.id)
    }

    @UserDockPost('', UserAuthType.USER, CreateSubscriptionDto, Subscription, 'Создать подписку')
    async createUserSubscription(@UserDecorator() user: User, @Body() createSubscriptionDto: CreateSubscriptionDto) {
        return this.subscriptionService.create(user, createSubscriptionDto.planId)
    }

    @UserDockPost('action', UserAuthType.USER, ActionDto, null, 'Выполнить действие с подпиской пользователя')
    async subscriptionAction(@UserDecorator() user: User, @Body() actionDto: ActionDto) {
        try {
            return await this.subscriptionService.performAction(
                user,
                actionDto.action,
                actionDto.planId,
                actionDto.promoCode,
                actionDto.referralCode,
                'web',
            )
        } catch (error) {
            if (error instanceof PaymentProviderError && error.kind === 'TERMINAL_REQUEST') {
                throw new UnprocessableEntityException({
                    statusCode: 422,
                    message: 'PAYMENT_PROVIDER_REJECTED',
                    description: 'Платёжный провайдер отклонил создание платежа. Оплата не была списана.',
                    correlationId: `pay_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
                })
            }
            throw error
        }
    }

    @UserDockPost('auto-renew/enable', UserAuthType.USER, null, AutoRenewResponseDto, 'Включить автопродление')
    enableAutoRenew(@UserDecorator() user: User) {
        return this.autoRenewService.enable(user.id, PaymentMerchant.SITE)
    }

    @UserDockPost('auto-renew/disable', UserAuthType.USER, null, AutoRenewResponseDto, 'Отключить автопродление')
    disableAutoRenew(@UserDecorator() user: User) {
        return this.autoRenewService.disable(user.id)
    }

    @UserDockGetOne('auto-renew', UserAuthType.USER, AutoRenewResponseDto, 'Статус автопродления')
    getAutoRenew(@UserDecorator() user: User) {
        return this.autoRenewService.get(user.id)
    }
}
