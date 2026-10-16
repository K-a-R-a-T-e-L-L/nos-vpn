import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Markup } from 'telegraf'
import { In, Repository } from 'typeorm'

import { BOT_CALLBACK } from '../../bot/bot.constants'
import { CUSTOM_EMOJI, tgEmoji } from '../../bot/custom-emoji.registry'
import { NotificationService } from '../../notification/notification.service'
import { Subscription } from '../entity/subscription.entity'
import { StatusesEnum } from '../enum/statuses.enum'
import { SubscriptionService } from '../services/subscription.service'
import { resolveSubscriptionReminderMediaPath } from '../subscription-reminder-media'

@Injectable()
export class SubscriptionRenewalReminderJob {
    constructor(
        @InjectRepository(Subscription)
        private readonly subscriptionRepository: Repository<Subscription>,
        private readonly notificationService: NotificationService,
        private readonly subscriptionService: SubscriptionService,
    ) {}

    @Cron(CronExpression.EVERY_HOUR)
    async run() {
        const now = new Date()
        const subscriptions = await this.subscriptionRepository.find({
            where: { status: In([StatusesEnum.ACTIVE, StatusesEnum.GRACE, StatusesEnum.EXPIRED]) as any },
            relations: { user: true, plan: true },
        })

        for (const candidate of subscriptions) {
            const subscription = await this.subscriptionService.getResolvedById(candidate.id)
            if (!subscription?.user?.telegramId) {
                continue
            }

            const reminder = this.pickReminder(subscription, now)
            if (!reminder || subscription.reminderState?.[reminder.code]) {
                continue
            }

            const planName = this.escapeHtml(subscription.plan?.title || subscription.plan?.name || 'текущий тариф')
            await this.notificationService.notifyWithPhoto(
                subscription.user.telegramId,
                resolveSubscriptionReminderMediaPath(reminder.code),
                [
                    `${tgEmoji('SUBSCRIPTION_EXPIRES_AT')} <b>${reminder.title}</b>`,
                    `${tgEmoji('SUBSCRIPTION_TARIFF')} Тариф: ${planName}`,
                    reminder.body,
                ].join('\n\n'),
                {
                    ...Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                `${CUSTOM_EMOJI.MENU_BUTTON_RENEW.fallback} Продлить доступ`,
                                BOT_CALLBACK.RENEW,
                            ),
                        ],
                        [
                            Markup.button.callback(
                                `${CUSTOM_EMOJI.MENU_BUTTON_MY_SUBSCRIPTION.fallback} Моя подписка`,
                                BOT_CALLBACK.MY_SUBSCRIPTION,
                            ),
                        ],
                        [
                            Markup.button.callback(
                                `${CUSTOM_EMOJI.MENU_BUTTON_SUPPORT.fallback} Поддержка`,
                                BOT_CALLBACK.SUPPORT,
                            ),
                        ],
                    ]),
                    parse_mode: 'HTML',
                } as any,
            )

            await this.subscriptionService.markReminderSent(subscription.id, reminder.code, now)
        }
    }

    private pickReminder(subscription: Subscription, now: Date) {
        if (subscription.status === StatusesEnum.ACTIVE && subscription.endsAt) {
            const diffMs = subscription.endsAt.getTime() - now.getTime()

            if (this.isBetween(diffMs, 6, 7)) {
                return {
                    code: 'before_7d',
                    title: 'Подписка закончится через 7 дней',
                    body: 'Продлите доступ заранее, чтобы VPN не прерывался в самый неудобный момент.',
                }
            }

            if (this.isBetween(diffMs, 2, 3)) {
                return {
                    code: 'before_3d',
                    title: 'До окончания подписки осталось 3 дня',
                    body: 'Если доступ нужен каждый день, лучше продлить подписку заранее и не ждать отключения.',
                }
            }

            if (this.isBetween(diffMs, 1, 2)) {
                return {
                    code: 'before_1d',
                    title: 'Подписка закончится через 1 день',
                    body: 'Пополните доступ заранее, чтобы ссылка и VPN продолжили работать без паузы.',
                }
            }

            if (diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000) {
                return {
                    code: 'expires_today',
                    title: 'Подписка заканчивается сегодня',
                    body: 'Если доступ всё ещё нужен, продлите его сейчас. Это быстрее, чем вспоминать о VPN после отключения.',
                }
            }
        }

        if (subscription.status === StatusesEnum.GRACE && subscription.graceEndsAt && subscription.graceEndsAt > now) {
            return {
                code: 'grace_started',
                title: 'Подписка истекла, но доступ ещё активен',
                body: 'Мы оставили 24 часа запаса. Продлите подписку сейчас, пока VPN ещё работает без перерыва.',
            }
        }

        if (subscription.status === StatusesEnum.EXPIRED && subscription.accessDisabledAt) {
            const diffMs = now.getTime() - subscription.accessDisabledAt.getTime()

            if (diffMs >= 0 && diffMs < 24 * 60 * 60 * 1000) {
                return {
                    code: 'expired_disabled',
                    title: 'Подписка истекла',
                    body: 'Доступ уже остановлен. Продлите подписку, и ссылка снова станет активной.',
                }
            }

            if (this.isPastDays(diffMs, 1)) {
                return {
                    code: 'expired_1d',
                    title: 'Подписка истекла 1 день назад',
                    body: 'Если VPN снова нужен для сайтов, Telegram и приложений, верните доступ одним продлением.',
                }
            }

            if (this.isPastDays(diffMs, 3)) {
                return {
                    code: 'expired_3d',
                    title: 'Подписка истекла 3 дня назад',
                    body: 'Доступ можно вернуть в пару кликов. Кабинет и ссылка останутся в вашем аккаунте.',
                }
            }

            if (this.isPastDays(diffMs, 7)) {
                return {
                    code: 'expired_7d',
                    title: 'Подписка истекла 7 дней назад',
                    body: 'Если снова нужен стабильный доступ, просто продлите подписку. Всё продолжится в том же аккаунте.',
                }
            }
        }

        return null
    }

    private isBetween(diffMs: number, fromDays: number, toDays: number) {
        const dayMs = 24 * 60 * 60 * 1000
        return diffMs > fromDays * dayMs && diffMs <= toDays * dayMs
    }

    private isPastDays(diffMs: number, days: number) {
        const dayMs = 24 * 60 * 60 * 1000
        return diffMs >= days * dayMs && diffMs < (days + 1) * dayMs
    }

    private escapeHtml(value: string) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
    }
}
