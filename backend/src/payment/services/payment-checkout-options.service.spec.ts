import { PaymentCheckoutOptionsService } from './payment-checkout-options.service'
import { PaymentRecurrentCadence } from '../dto/payment-checkout-options.dto'
import { PaymentCheckoutMode } from '../enum/payment-checkout-mode.enum'
import { PaymentMerchant } from '../enum/payment-merchant.enum'
import { PaymentProvider } from '../enum/payment-provider.enum'
import { PlategaRecurrentPlanPolicy } from '../providers/platega-recurrent-plan.policy'

describe('PaymentCheckoutOptionsService', () => {
    const plans: Record<string, any> = {
        monthly: { id: 'monthly', code: 'vpn_30_1', period: 30, devicesLimit: 1, isActive: true },
        quarterly: { id: 'quarterly', code: 'vpn_90_1', period: 90, devicesLimit: 1, isActive: true },
        halfyear: { id: 'halfyear', code: 'vpn_180_1', period: 180, devicesLimit: 1, isActive: true },
        yearly: { id: 'yearly', code: 'vpn_360_10', period: 360, devicesLimit: 10, isActive: true },
        custom: { id: 'custom', code: 'special-plan', period: 30, devicesLimit: 1, isActive: true },
        inactive: { id: 'inactive', code: 'vpn_30_1', period: 30, devicesLimit: 1, isActive: false },
    }
    let cryptoEnabled = false
    let recurrentEnabled = false
    let recurrentConfigured = true
    let oneTimeAvailable = true
    let oneTimeProvider = PaymentProvider.PLATEGA
    let yookassaConfigured = true
    let plategaConfigured = true
    const repository = { findOne: jest.fn(async ({ where }: any) => plans[where.id] || null) }
    const routing = {
        resolveCheckoutProvider: jest.fn(() => oneTimeProvider),
        isCheckoutModeAvailable: jest.fn(() => oneTimeAvailable),
    }
    const yookassaPaymentProvider = { isMerchantConfigured: jest.fn(() => yookassaConfigured) }
    const plategaPaymentProvider = { isMerchantConfigured: jest.fn(() => plategaConfigured) }
    const service = new PaymentCheckoutOptionsService(
        repository as any,
        {
            get: (key: string) =>
                key === 'PLATEGA_CRYPTO_ENABLED'
                    ? cryptoEnabled
                        ? 'true'
                        : 'false'
                    : recurrentEnabled
                      ? 'true'
                      : 'false',
        } as any,
        routing as any,
        new PlategaRecurrentPlanPolicy(),
        { isConfigured: jest.fn(() => recurrentConfigured) } as any,
        yookassaPaymentProvider as any,
        plategaPaymentProvider as any,
    )

    beforeEach(() => {
        cryptoEnabled = false
        recurrentEnabled = false
        recurrentConfigured = true
        oneTimeAvailable = true
        oneTimeProvider = PaymentProvider.PLATEGA
        yookassaConfigured = true
        plategaConfigured = true
        jest.clearAllMocks()
        routing.resolveCheckoutProvider.mockImplementation(() => oneTimeProvider)
        routing.isCheckoutModeAvailable.mockImplementation(() => oneTimeAvailable)
        yookassaPaymentProvider.isMerchantConfigured.mockImplementation(() => yookassaConfigured)
        plategaPaymentProvider.isMerchantConfigured.mockImplementation(() => plategaConfigured)
    })

    it.each([
        ['monthly', true, PaymentRecurrentCadence.MONTHLY],
        ['yearly', true, PaymentRecurrentCadence.YEARLY],
        ['quarterly', false, null],
        ['halfyear', false, null],
    ])('returns exact recurrent product information for %s', async (id, eligible, cadence) => {
        await expect(service.getForPlan(id)).resolves.toEqual(
            expect.objectContaining({
                oneTime: { available: true },
                crypto: { available: false },
                recurrent: { eligible, available: false, cadence },
            }),
        )
    })

    it('uses only the crypto feature flag and rejects inactive or noncanonical plans', async () => {
        cryptoEnabled = true
        await expect(service.getForPlan('monthly')).resolves.toEqual(expect.objectContaining({ crypto: { available: true } }))
        await expect(service.getForPlan('custom')).rejects.toThrow('Plan not found')
        await expect(service.getForPlan('inactive')).rejects.toThrow('Plan not found')
    })

    it('reports ONE_TIME unavailable when the selected provider runtime gate is disabled', async () => {
        oneTimeAvailable = false
        await expect(service.getForPlan('monthly')).resolves.toEqual(
            expect.objectContaining({
                oneTime: { available: false },
                crypto: { available: false },
                recurrent: { eligible: true, available: false, cadence: PaymentRecurrentCadence.MONTHLY },
            }),
        )
    })

    it('passes the authenticated user id into ONE_TIME routing for canary-safe availability', async () => {
        await service.getForPlan('monthly', PaymentMerchant.SITE, 'user-1')

        expect(routing.resolveCheckoutProvider).toHaveBeenCalledWith(PaymentCheckoutMode.ONE_TIME, 'user-1')
        expect(routing.isCheckoutModeAvailable).toHaveBeenCalledWith(PaymentCheckoutMode.ONE_TIME, 'user-1')
    })

    it('uses Platega merchant readiness for ONE_TIME when primary routing selects Platega', async () => {
        oneTimeProvider = PaymentProvider.PLATEGA
        plategaConfigured = false
        yookassaConfigured = true
        await expect(service.getForPlan('monthly', PaymentMerchant.SITE)).resolves.toEqual(
            expect.objectContaining({ oneTime: { available: false } }),
        )

        plategaConfigured = true
        yookassaConfigured = false
        await expect(service.getForPlan('monthly', PaymentMerchant.SITE)).resolves.toEqual(
            expect.objectContaining({ oneTime: { available: true } }),
        )
        expect(plategaPaymentProvider.isMerchantConfigured).toHaveBeenCalledWith('web')
    })

    it('uses YooKassa merchant readiness for ONE_TIME when primary routing selects YooKassa', async () => {
        oneTimeProvider = PaymentProvider.YOOKASSA
        yookassaConfigured = false
        plategaConfigured = true
        await expect(service.getForPlan('monthly', PaymentMerchant.SITE)).resolves.toEqual(
            expect.objectContaining({ oneTime: { available: false } }),
        )

        yookassaConfigured = true
        plategaConfigured = false
        await expect(service.getForPlan('monthly', PaymentMerchant.SITE)).resolves.toEqual(
            expect.objectContaining({ oneTime: { available: true } }),
        )
        expect(yookassaPaymentProvider.isMerchantConfigured).toHaveBeenCalledWith(PaymentMerchant.SITE)
    })

    it('uses BOT Platega readiness independently from SITE readiness for ONE_TIME', async () => {
        oneTimeProvider = PaymentProvider.PLATEGA
        const readiness = plategaPaymentProvider.isMerchantConfigured as jest.Mock
        readiness.mockImplementation((profile: string) => profile === 'bot')
        await expect(service.getForPlan('monthly', PaymentMerchant.SITE)).resolves.toEqual(
            expect.objectContaining({ oneTime: { available: false } }),
        )
        await expect(service.getForPlan('monthly', PaymentMerchant.BOT)).resolves.toEqual(
            expect.objectContaining({ oneTime: { available: true } }),
        )
    })

    it('uses BOT YooKassa readiness independently from SITE readiness when YooKassa is selected', async () => {
        oneTimeProvider = PaymentProvider.YOOKASSA
        const readiness = yookassaPaymentProvider.isMerchantConfigured as jest.Mock
        readiness.mockImplementation((merchant: PaymentMerchant) => merchant === PaymentMerchant.BOT)
        await expect(service.getForPlan('monthly', PaymentMerchant.SITE)).resolves.toEqual(
            expect.objectContaining({ oneTime: { available: false } }),
        )
        await expect(service.getForPlan('monthly', PaymentMerchant.BOT)).resolves.toEqual(
            expect.objectContaining({ oneTime: { available: true } }),
        )
    })

    it('requires the crypto flag and selected Platega merchant profile readiness', async () => {
        cryptoEnabled = false
        plategaConfigured = true
        await expect(service.getForPlan('monthly', PaymentMerchant.SITE)).resolves.toEqual(
            expect.objectContaining({ crypto: { available: false } }),
        )
        cryptoEnabled = true
        plategaConfigured = false
        await expect(service.getForPlan('monthly', PaymentMerchant.SITE)).resolves.toEqual(
            expect.objectContaining({ crypto: { available: false } }),
        )
        plategaConfigured = true
        await expect(service.getForPlan('monthly', PaymentMerchant.SITE)).resolves.toEqual(
            expect.objectContaining({ crypto: { available: true } }),
        )
    })

    it('uses BOT Platega readiness independently from SITE readiness for crypto', async () => {
        cryptoEnabled = true
        const readiness = plategaPaymentProvider.isMerchantConfigured as jest.Mock
        readiness.mockImplementation((profile: string) => profile === 'bot')
        await expect(service.getForPlan('monthly', PaymentMerchant.SITE)).resolves.toEqual(
            expect.objectContaining({ crypto: { available: false } }),
        )
        await expect(service.getForPlan('monthly', PaymentMerchant.BOT)).resolves.toEqual(
            expect.objectContaining({ crypto: { available: true } }),
        )
    })

    it('exposes only confirmed recurrent cadences when its flag and merchant configuration are ready', async () => {
        recurrentEnabled = true
        recurrentConfigured = true
        await expect(service.getForPlan('monthly')).resolves.toEqual(
            expect.objectContaining({ recurrent: { eligible: true, available: true, cadence: PaymentRecurrentCadence.MONTHLY } }),
        )
        await expect(service.getForPlan('yearly')).resolves.toEqual(
            expect.objectContaining({ recurrent: { eligible: true, available: true, cadence: PaymentRecurrentCadence.YEARLY } }),
        )
        await expect(service.getForPlan('quarterly')).resolves.toEqual(
            expect.objectContaining({ recurrent: { eligible: false, available: false, cadence: null } }),
        )
        recurrentConfigured = false
        await expect(service.getForPlan('monthly')).resolves.toEqual(
            expect.objectContaining({ recurrent: { eligible: true, available: false, cadence: PaymentRecurrentCadence.MONTHLY } }),
        )
    })
})
