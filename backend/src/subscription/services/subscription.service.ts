import { Inject, Injectable, forwardRef } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThanOrEqual, Repository } from 'typeorm'

import { BaseService } from '@common/database/base/base.service'
import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { SubscriptionLifecycleOrchestrator } from './subscription-lifecycle.orchestrator'
import { tgEmoji } from '../../bot/custom-emoji.registry'
import { NotificationService } from '../../notification/notification.service'
import { PlategaMerchantProfile } from '../../payment/providers/platega-payment.provider'
import { PaymentService } from '../../payment/services/payment.service'
import { Plan } from '../../plan/entity/plan.entity'
import { ReferralService } from '../../referral/services/referral.service'
import { User } from '../../system/user/entity/user.entity'
import { VpnAccessService } from '../../vpn-access/services/vpn-access.service'
import { RemnawaveProviderAdapter } from '../../vpn-provider/adapters/remnawave-provider.adapter'
import { VpnProviderTypeEnum } from '../../vpn-provider/enum/vpn-provider-type.enum'
import { ServerNodeResolverService } from '../../vpn-provider/services/server-node-resolver.service'
import { CreateSubscriptionDto } from '../dto/create-subscription.dto'
import { UpdateSubscriptionDto } from '../dto/update-subscription.dto'
import { Subscription } from '../entity/subscription.entity'
import { ActionsEnum } from '../enum/actions.enum'
import { StatusesEnum } from '../enum/statuses.enum'
import { resolveSubscriptionReminderMediaPath } from '../subscription-reminder-media'

@Injectable()
export class SubscriptionService extends BaseService<Subscription, CreateSubscriptionDto, UpdateSubscriptionDto> {
    constructor(
        @InjectRepository(Subscription) private readonly subscriptionRepository: Repository<Subscription>,
        @InjectRepository(Plan) private readonly planRepository: Repository<Plan>,
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @Inject(forwardRef(() => PaymentService)) private readonly paymentService: PaymentService,
        @Inject(forwardRef(() => SubscriptionLifecycleOrchestrator))
        private readonly lifecycleOrchestrator: SubscriptionLifecycleOrchestrator,
        private readonly referralService: ReferralService,
        private readonly eventEmitter: EventEmitter2,
        private readonly notificationService: NotificationService,
        private readonly vpnAccessService: VpnAccessService,
        private readonly remnawaveProvider: RemnawaveProviderAdapter,
        private readonly serverNodeResolver: ServerNodeResolverService,
    ) {
        super(subscriptionRepository)
    }

    async getResolvedForUser(userId: string) {
        const subscription = await this.subscriptionRepository.findOne({
            where: { userId },
            relations: { plan: true, user: true },
        })

        return this.resolveCurrentState(subscription)
    }

    async getResolvedById(id: string) {
        const subscription = await this.subscriptionRepository.findOne({
            where: { id },
            relations: { plan: true, user: true },
        })

        return this.resolveCurrentState(subscription)
    }

    async markReminderSent(subscriptionId: string, reminderCode: string, sentAt = new Date()) {
        const subscription = await this.subscriptionRepository.findOne({ where: { id: subscriptionId } })
        if (!subscription) {
            return
        }

        subscription.reminderState = {
            ...(subscription.reminderState || {}),
            [reminderCode]: sentAt.toISOString(),
        }
        await this.subscriptionRepository.save(subscription)
    }

    async stopSubscription(userId: string) {
        const userSubscription = await this.getOne({ where: { userId }, relations: { user: true } })
        if (!userSubscription) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Subscription not found')
        }

        const result = await this.lifecycleOrchestrator.stopSubscription({
            subscriptionId: userSubscription.id,
            operationKey: `stop-${userSubscription.id}-${Date.now()}`,
        })

        this.eventEmitter.emit('subscription.stop', {
            subscription: result,
        })

        return result
    }

    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async renewSubscriptions() {
        const subscriptions = await this.subscriptionRepository.find({
            where: {
                status: StatusesEnum.ACTIVE,
                nextPayAt: LessThanOrEqual(new Date()),
            },
            relations: {
                plan: true,
                user: true,
            },
        })

        for (const subscription of subscriptions) {
            await this.notificationService.notifyWithPhoto(
                subscription.user.telegramId,
                resolveSubscriptionReminderMediaPath('manual_renewal'),
                tgEmoji('MENU_BUTTON_RENEW') + ' РџРѕРґРїРёСЃРєР° ' + (subscription.plan.title || subscription.plan.name) + ' С‚СЂРµР±СѓРµС‚ СЂСѓС‡РЅРѕРіРѕ РїСЂРѕРґР»РµРЅРёСЏ.',
                { parse_mode: 'HTML' },
            )
        }

        return { count: subscriptions.length }
    }

    async renewSubscription(subscriptionId: string, yooKassaPaymentId?: string) {
        return this.lifecycleOrchestrator.extendAfterManualRenew({
            subscriptionId,
            paymentExternalId: yooKassaPaymentId,
            operationKey: `renew-${subscriptionId}-${Date.now()}`,
        })
    }

    async performAction(
        user: User,
        action: ActionsEnum,
        planId?: string,
        promoCode?: string,
        referralCode?: string,
        merchantProfile: PlategaMerchantProfile = 'bot',
    ) {
        if (action === ActionsEnum.PAYMENT_CREATE) {
            if (referralCode) {
                await this.referralService.attachReferrer(user.id, referralCode)
            }
            const subscription = await this.subscriptionRepository.findOne({
                where: { userId: user.id },
                relations: { plan: true },
            })

            if (!subscription) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Subscription not found')
            }

            return this.paymentService.createPayment(subscription, planId, promoCode, merchantProfile)
        } else if (action === ActionsEnum.SUBSCRIPTION_STOP) {
            return this.stopSubscription(user.id)
        } else if (action === ActionsEnum.TRIAL_START) {
            const subscription = await this.subscriptionRepository.findOne({
                where: { userId: user.id },
            })
            if (!subscription) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Subscription not found')
            }

            if (referralCode) {
                await this.referralService.attachReferrer(user.id, referralCode)
            }

            return this.lifecycleOrchestrator.activateTrial({
                subscriptionId: subscription.id,
                operationKey: `trial-${subscription.id}-${Date.now()}`,
                promoCode,
            })
        }
    }

    async payWithReferralBonus(user: User, planId?: string) {
        const subscription = await this.subscriptionRepository.findOne({
            where: { userId: user.id },
            relations: { plan: true, user: true },
        })

        if (!subscription) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Subscription not found')
        }

        return this.paymentService.createBonusPayment(subscription, planId || subscription.planId)
    }

    async applyPaidPlan(subscriptionId: string, planId: string, yooKassaPaymentId?: string) {
        return this.lifecycleOrchestrator.activatePaidSubscription({
            subscriptionId,
            planId,
            paymentExternalId: yooKassaPaymentId,
            operationKey: `apply-paid-${subscriptionId}-${Date.now()}`,
        })
    }

    async adminConfigureSubscription(userId: string, planId: string, endsAt?: Date) {
        let subscription = await this.subscriptionRepository.findOne({
            where: { userId },
            relations: { plan: true, user: true },
        })

        if (!subscription) {
            const user = await this.getUserOrFail(userId)
            subscription = await this.create(user, planId)
            subscription = await this.subscriptionRepository.findOneOrFail({
                where: { id: subscription.id },
                relations: { plan: true, user: true },
            })
        }

        return this.lifecycleOrchestrator.adminConfigureSubscription({
            subscriptionId: subscription.id,
            planId,
            endsAt,
            operationKey: `admin-configure-${subscription.id}-${Date.now()}`,
        })
    }

    async create(user: User, planId: string) {
        const plan = await this.planRepository.findOne({ where: { id: planId } })
        if (!plan) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Plan not found')
        }

        const subscription = await this.subscriptionRepository.findOne({
            where: { userId: user.id },
            withDeleted: true,
        })

        if (subscription && !subscription.deletedAt) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Subscription already exists')
        }

        if (subscription?.deletedAt) {
            await this.subscriptionRepository.restore(subscription.id)
            const restored = await this.subscriptionRepository.findOneOrFail({
                where: { id: subscription.id },
            })
            restored.planId = planId
            restored.startAt = new Date()
            restored.nextPayAt = new Date()
            restored.yookassaPaymentId = ''
            restored.status = StatusesEnum.PENDING
            return this.subscriptionRepository.save(restored)
        }

        return this.subscriptionRepository.save({
            userId: user.id,
            planId,
            startAt: new Date(),
            nextPayAt: new Date(),
            yookassaPaymentId: '',
            status: StatusesEnum.PENDING,
        })
    }

    async find() {
        return this.subscriptionRepository.find()
    }

    async activateSubscription(subscriptionId: string) {
        const subscription = await this.getOne({
            where: { id: subscriptionId },
            relations: { plan: true, user: true },
        })

        if (!subscription) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Subscription not found')
        }

        return this.lifecycleOrchestrator.extendAfterManualRenew({
            subscriptionId,
            operationKey: `activate-${subscriptionId}-${Date.now()}`,
        })
    }

    private async resolveCurrentState(subscription?: Subscription | null) {
        if (!subscription) {
            return null
        }

        let current = subscription
        current = await this.trySyncDatesFromProvider(current)
        current = await this.reconcileRuntimeStatus(current)
        return current
    }

    private async trySyncDatesFromProvider(subscription: Subscription) {
        const access = await this.vpnAccessService.findProvisionableBySubscription(subscription.id)
        if (!access?.serverNodeId) {
            return subscription
        }

        try {
            const node = await this.serverNodeResolver.resolveNode(VpnProviderTypeEnum.REMNAWAVE, access.serverNodeId)
            const state = await this.remnawaveProvider.getAccessState({
                inboundKey: access.inboundKey,
                providerExternalId: access.providerExternalId,
                providerClientKey: access.providerClientKey,
                serverBaseUrl: node.baseUrl,
            })

            if (!state?.expiresAt) {
                return subscription
            }

            const providerExpiresAt = new Date(state.expiresAt)
            if (Number.isNaN(providerExpiresAt.getTime())) {
                return subscription
            }

            let changed = false

            if (subscription.status === StatusesEnum.GRACE) {
                if (!subscription.graceEndsAt || this.hasDateChanged(subscription.graceEndsAt, providerExpiresAt)) {
                    subscription.graceEndsAt = providerExpiresAt
                    changed = true
                }
            } else {
                if (!subscription.endsAt || this.hasDateChanged(subscription.endsAt, providerExpiresAt)) {
                    subscription.endsAt = providerExpiresAt
                    subscription.nextPayAt = providerExpiresAt
                    changed = true
                }

                if (subscription.status === StatusesEnum.EXPIRED && providerExpiresAt > new Date()) {
                    subscription.status = StatusesEnum.ACTIVE
                    subscription.graceEndsAt = null
                    subscription.accessDisabledAt = null
                    changed = true
                }
            }

            if (!changed) {
                return subscription
            }

            return this.subscriptionRepository.save(subscription)
        } catch {
            return subscription
        }
    }

    private async reconcileRuntimeStatus(subscription: Subscription) {
        const now = new Date()

        if (subscription.status === StatusesEnum.ACTIVE && subscription.endsAt && subscription.endsAt <= now) {
            return this.lifecycleOrchestrator.enterGrace(
                subscription.id,
                `runtime-grace-enter-${subscription.id}-${now.getTime()}`,
            )
        }

        if (subscription.status === StatusesEnum.GRACE && subscription.graceEndsAt && subscription.graceEndsAt <= now) {
            return this.lifecycleOrchestrator.expireFromGrace(
                subscription.id,
                `runtime-grace-expire-${subscription.id}-${now.getTime()}`,
            )
        }

        return subscription
    }

    private hasDateChanged(left?: Date | null, right?: Date | null) {
        if (!left && !right) {
            return false
        }

        if (!left || !right) {
            return true
        }

        return Math.abs(left.getTime() - right.getTime()) > 60_000
    }

    private async getUserOrFail(userId: string) {
        const user = await this.userRepository.findOne({ where: { id: userId } })
        if (!user) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
        }

        return user
    }
}


