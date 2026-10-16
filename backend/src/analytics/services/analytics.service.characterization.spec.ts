import { AnalyticsAttributionService } from './analytics-attribution.service'
import { AnalyticsEventService } from './analytics-event.service'
import { AnalyticsQueryService } from './analytics-query.service'
import { AnalyticsEventType, AnalyticsService } from './analytics.service'
import { PaymentStatusEnum } from '../../payment/enum/payment-status.enum'

const NOW = new Date('2026-09-08T12:34:56.789Z')

function repository(overrides: Record<string, unknown> = {}) {
    return {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn((value) => ({ ...value })),
        createQueryBuilder: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        remove: jest.fn(),
        save: jest.fn(async (value) => value),
        ...overrides,
    }
}

function createFixture() {
    const config = { get: jest.fn() }
    const sources = repository()
    const attributions = repository()
    const events = repository()
    const users = repository()
    const payments = repository()
    const plans = repository()
    const referralBonuses = repository()
    const eventService = new AnalyticsEventService(events as any)
    const attributionService = new AnalyticsAttributionService(sources as any, attributions as any, eventService)
    const queryService = new AnalyticsQueryService(
        config as any,
        sources as any,
        attributions as any,
        users as any,
        payments as any,
        plans as any,
        referralBonuses as any,
    )
    const service = new AnalyticsService(attributionService, queryService)

    return { service, eventService, config, sources, attributions, events, users, payments, plans, referralBonuses }
}

describe('AnalyticsService characterization', () => {
    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(NOW)
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    describe('event ingestion and attribution', () => {
        it('preserves every persisted event type name', () => {
            expect(AnalyticsEventType).toEqual({
                SOURCE_CLAIMED: 'SOURCE_CLAIMED',
                BOT_START: 'BOT_START',
                TRIAL_STARTED: 'TRIAL_STARTED',
                PLAN_SELECTED: 'PLAN_SELECTED',
                PAYMENT_SUCCEEDED: 'PAYMENT_SUCCEEDED',
                ACCESS_VIEWED: 'ACCESS_VIEWED',
                QR_OPENED: 'QR_OPENED',
                REFERRAL_ATTACHED: 'REFERRAL_ATTACHED',
                REFERRAL_FRIEND_PAID: 'REFERRAL_FRIEND_PAID',
            })
        })

        it('persists an anonymous event with null relation keys and exact defaults', async () => {
            const fixture = createFixture()

            await fixture.eventService.recordEvent({
                eventType: AnalyticsEventType.ACCESS_VIEWED,
                amountRub: null,
                metadata: {},
            })

            expect(fixture.events.save).toHaveBeenCalledWith({
                userId: null,
                sourceId: null,
                eventType: AnalyticsEventType.ACCESS_VIEWED,
                amountRub: 0,
                metadata: {},
                occurredAt: NOW,
            })
        })

        it('captures the initial normalized source and persists the exact claim event fields', async () => {
            const fixture = createFixture()
            fixture.sources.findOne.mockResolvedValue({ id: 'source-1', code: 'partner-one', isActive: true })

            await expect(
                fixture.service.claimUserSource('user-1', ' Partner One! ', {
                    entryPoint: 'website',
                    landingPath: '/earn?campaign=fall',
                }),
            ).resolves.toEqual({
                userId: 'user-1',
                sourceId: 'source-1',
                sourceCodeSnapshot: 'partner-one',
                claimedAt: NOW,
                entryPoint: 'website',
                landingPath: '/earn?campaign=fall',
            })
            expect(fixture.sources.findOne).toHaveBeenCalledWith({
                where: { code: 'partner-one', isActive: true },
            })
            expect(fixture.events.save).toHaveBeenCalledWith({
                userId: 'user-1',
                sourceId: 'source-1',
                eventType: AnalyticsEventType.SOURCE_CLAIMED,
                amountRub: null,
                metadata: {
                    sourceCode: 'partner-one',
                    entryPoint: 'website',
                    landingPath: '/earn?campaign=fall',
                },
                occurredAt: NOW,
            })
        })

        it('preserves first-touch attribution while recording every repeated claim attempt', async () => {
            const fixture = createFixture()
            const claimedAt = new Date('2026-08-01T00:00:00.000Z')
            const existing = {
                userId: 'user-1',
                sourceId: 'source-original',
                sourceCodeSnapshot: 'original',
                claimedAt,
                entryPoint: 'telegram',
                landingPath: '/first',
            }
            fixture.sources.findOne.mockResolvedValue({ id: 'source-new', code: 'new', isActive: true })
            fixture.attributions.findOne.mockResolvedValue(existing)

            await fixture.service.claimUserSource('user-1', 'new', {
                entryPoint: 'website',
                landingPath: '/second',
            })

            expect(fixture.attributions.save).toHaveBeenCalledWith(existing)
            expect(existing).toEqual(
                expect.objectContaining({
                    sourceId: 'source-original',
                    sourceCodeSnapshot: 'original',
                    claimedAt,
                    entryPoint: 'telegram',
                    landingPath: '/first',
                }),
            )
            expect(fixture.events.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    sourceId: 'source-original',
                    metadata: {
                        sourceCode: 'original',
                        entryPoint: 'website',
                        landingPath: '/second',
                    },
                }),
            )
        })

        it('keeps the first bot timestamp/source but records duplicate starts and ignores unknown payload sources', async () => {
            const fixture = createFixture()
            const firstStart = new Date('2026-08-02T03:04:05.000Z')
            const existing = {
                userId: 'user-1',
                sourceId: 'source-original',
                sourceCodeSnapshot: 'original',
                botStartedAt: firstStart,
                entryPoint: 'website',
            }
            fixture.attributions.findOne.mockResolvedValue(existing)
            fixture.sources.findOne.mockResolvedValue(null)

            await fixture.service.trackBotStart('user-1', 'src_missing partner')
            await fixture.service.trackBotStart('user-1', 'src_missing partner')

            expect(existing.botStartedAt).toBe(firstStart)
            expect(existing.sourceId).toBe('source-original')
            expect(existing.entryPoint).toBe('website')
            expect(fixture.attributions.save).toHaveBeenCalledTimes(2)
            expect(fixture.events.save).toHaveBeenCalledTimes(2)
            expect(fixture.events.save).toHaveBeenLastCalledWith({
                userId: 'user-1',
                sourceId: 'source-original',
                eventType: AnalyticsEventType.BOT_START,
                amountRub: null,
                metadata: { startPayload: 'src_missing partner' },
                occurredAt: NOW,
            })
        })

        it('preserves payment time, plan precedence, rounded amount, and metadata exactly', async () => {
            const fixture = createFixture()
            const paidAt = new Date('2026-09-01T23:59:59.999Z')
            const existing = {
                userId: 'user-1',
                sourceId: 'source-1',
                firstPlanId: 'plan-first',
                latestPlanId: 'plan-old',
                trialStartedAt: new Date('2026-08-01T00:00:00.000Z'),
            }
            fixture.attributions.findOne.mockResolvedValue(existing)

            await fixture.service.trackPaymentSucceeded({
                userId: 'user-1',
                amountRub: 123.456,
                planId: 'plan-latest',
                planCode: 'pro',
                planTitle: 'Pro',
                paidAt,
                isAfterTrial: true,
            })

            expect(existing).toEqual(
                expect.objectContaining({
                    firstPaymentAt: paidAt,
                    firstPostTrialPaymentAt: paidAt,
                    firstPlanId: 'plan-first',
                    latestPlanId: 'plan-latest',
                }),
            )
            expect(fixture.events.save).toHaveBeenCalledWith({
                userId: 'user-1',
                sourceId: 'source-1',
                eventType: AnalyticsEventType.PAYMENT_SUCCEEDED,
                amountRub: 123.46,
                metadata: {
                    planId: 'plan-latest',
                    planCode: 'pro',
                    planTitle: 'Pro',
                    isAfterTrial: true,
                },
                occurredAt: paidAt,
            })
        })

        it('persists referral events without relation objects and tolerates a referrer without attribution', async () => {
            const fixture = createFixture()
            const paidAt = new Date('2026-09-02T00:00:00.000Z')

            await fixture.service.trackReferralFriendPaid({
                referredUserId: 'friend-1',
                referrerUserId: 'referrer-1',
                amountRub: 49.999,
                paidAt,
            })

            expect(fixture.events.save).toHaveBeenCalledWith({
                userId: 'referrer-1',
                sourceId: null,
                eventType: AnalyticsEventType.REFERRAL_FRIEND_PAID,
                amountRub: 50,
                metadata: { referredUserId: 'friend-1' },
                occurredAt: paidAt,
            })
            expect(fixture.events.save.mock.calls[0][0]).not.toHaveProperty('user')
            expect(fixture.events.save.mock.calls[0][0]).not.toHaveProperty('source')
        })
    })

    describe('admin analytics', () => {
        it('preserves overview counts, succeeded-payment sums, and attribution-only revenue', async () => {
            const fixture = createFixture()
            fixture.users.count.mockResolvedValue(4)
            fixture.sources.count.mockResolvedValue(2)
            fixture.attributions.count.mockResolvedValue(2)
            fixture.attributions.find.mockResolvedValue([
                { userId: 'user-1', botStartedAt: NOW, trialStartedAt: NOW, firstPaymentAt: NOW },
                { userId: 'user-2', accessViewedAt: NOW, qrOpenedAt: NOW, firstPostTrialPaymentAt: NOW },
            ])
            fixture.payments.find.mockResolvedValue([
                { userId: 'user-1', amount: '100.125' },
                { userId: 'user-2', amount: 49.5 },
                { userId: 'unattributed', amount: 25 },
                { userId: null, amount: 999 },
            ])
            fixture.users.createQueryBuilder.mockReturnValue({
                where: jest.fn().mockReturnThis(),
                getCount: jest.fn().mockResolvedValue(3),
            })
            fixture.referralBonuses.count.mockResolvedValue(7)

            await expect(fixture.service.getOverview()).resolves.toEqual({
                totalUsers: 4,
                totalSources: 2,
                totalAttributions: 2,
                botStarts: 1,
                trialsStarted: 1,
                accessViewed: 1,
                qrOpened: 1,
                firstPayments: 1,
                paidAfterTrial: 1,
                invitedUsers: 3,
                referralPaidCount: 7,
                totalRevenueRub: 1173.63,
                attributedRevenueRub: 149.63,
            })
            expect(fixture.payments.find).toHaveBeenCalledWith({ where: { status: PaymentStatusEnum.SUCCEEDED } })
        })

        it('preserves multi-source metrics, URL mapping, ordering, and pagination clamps', async () => {
            const fixture = createFixture()
            fixture.config.get.mockImplementation(
                (key) => ({ FRONTEND_ORIGIN: 'https://nos.example/', TELEGRAM_BOT_USERNAME: '@nos_bot' })[key],
            )
            fixture.sources.find.mockResolvedValue([
                { id: 'source-a', code: 'alpha & beta', websitePath: 'landing', name: 'Alpha' },
                { id: 'source-b', code: 'bravo', websitePath: '/earn', name: 'Bravo' },
            ])
            fixture.sources.count.mockResolvedValue(205)
            fixture.attributions.find.mockResolvedValue([
                { userId: 'user-1', sourceId: 'source-a', botStartedAt: NOW, latestPlanId: 'plan-1' },
                { userId: 'user-2', sourceId: 'source-b', trialStartedAt: NOW, latestPlanId: 'plan-2' },
            ])
            fixture.payments.find.mockResolvedValue([
                { userId: 'user-1', amount: '10.555' },
                { userId: 'user-2', amount: 20 },
            ])
            fixture.plans.find.mockResolvedValue([
                { id: 'plan-1', title: 'Starter' },
                { id: 'plan-2', name: 'Plus' },
            ])

            const result = await fixture.service.listSourcesWithMetrics(0, 500)

            expect(fixture.sources.find).toHaveBeenCalledWith({
                order: { createdAt: 'DESC' },
                skip: 0,
                take: 100,
            })
            expect(result).toEqual({
                items: [
                    expect.objectContaining({
                        id: 'source-a',
                        websiteUrl: 'https://nos.example/landing?src=alpha%20%26%20beta',
                        botStartUrl: 'https://t.me/nos_bot?start=src_alpha & beta',
                        metrics: expect.objectContaining({
                            attributedUsers: 1,
                            botStarts: 1,
                            totalRevenueRub: 10.56,
                            paymentsCount: 1,
                            latestPlans: ['Starter'],
                        }),
                    }),
                    expect.objectContaining({
                        id: 'source-b',
                        metrics: expect.objectContaining({ trialsStarted: 1, totalRevenueRub: 20 }),
                    }),
                ],
                total: 205,
                page: 1,
                pageSize: 100,
                totalPages: 3,
            })
        })

        it('preserves case-insensitive in-memory search, empty results, and minimum page size', async () => {
            const fixture = createFixture()
            fixture.attributions.find.mockResolvedValue([
                {
                    id: 'attr-1',
                    userId: 'user-1',
                    user: { email: 'Person@Example.com', telegramId: 123, telegramUsername: 'AlphaUser' },
                    source: { id: 'source-1', code: 'partner', name: 'Partner Name' },
                    latestPlanId: 'plan-1',
                },
            ])
            fixture.payments.find.mockResolvedValue([{ userId: 'user-1', amount: 5.555 }])
            fixture.plans.find.mockResolvedValue([{ id: 'plan-1', code: 'basic', title: '', name: 'Basic' }])

            await expect(fixture.service.listAttributedUsers('NO MATCH', -2, 1)).resolves.toEqual({
                items: [],
                total: 0,
                page: 1,
                pageSize: 10,
                totalPages: 1,
            })
            const matched = await fixture.service.listAttributedUsers('PERSON@example', 1, 25)
            expect(matched.items[0]).toEqual(
                expect.objectContaining({
                    userId: 'user-1',
                    totalPaidRub: 5.56,
                    latestPlan: { id: 'plan-1', code: 'basic', title: 'Basic' },
                }),
            )
        })
    })
})
