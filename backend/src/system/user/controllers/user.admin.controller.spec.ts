import { UserAdminController } from './user.admin.controller'
import { RolesEnum } from '../enum/roles.enum'

const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('UserAdminController subscription management boundaries', () => {
    const subscriptionService = {
        adminConfigureSubscription: jest.fn(),
        stopSubscription: jest.fn(),
        getResolvedForUser: jest.fn(),
    }
    const accessPresentationService = { buildPayload: jest.fn() }
    const autoRenewService = { disable: jest.fn() }
    const plategaRecurrentAgreements = { listForAdminUser: jest.fn(), cancelForAdminUser: jest.fn(), reconcileForAdminUser: jest.fn() }
    const controller = new UserAdminController(
        {} as any,
        subscriptionService as any,
        accessPresentationService as any,
        autoRenewService as any,
        plategaRecurrentAgreements as any,
    )

    beforeEach(() => jest.clearAllMocks())

    it('keeps configure, stop, access and YooKassa disable behind ADMIN and delegates only to existing services', async () => {
        subscriptionService.adminConfigureSubscription.mockResolvedValue({ id: 'subscription' })
        subscriptionService.stopSubscription.mockResolvedValue({ status: 'STOPPED' })
        subscriptionService.getResolvedForUser.mockResolvedValue({
            id: 'subscription',
            status: 'ACTIVE',
            endsAt: new Date(),
        })
        accessPresentationService.buildPayload.mockResolvedValue({
            status: 'ACTIVE',
            deliveryMode: 'DIRECT_URL',
            subscriptionUrl: 'https://access.example/current',
            expiresAt: new Date(),
            planTitle: 'Plan',
            rawConfig: { forbidden: true },
        })
        autoRenewService.disable.mockResolvedValue({ enabled: false })

        await controller.configureSubscription(USER_ID, { planId: '22222222-2222-4222-8222-222222222222' })
        await controller.stopSubscription(USER_ID)
        const access = await controller.access(USER_ID)
        await controller.disableYooKassaAutoRenew(USER_ID)

        for (const method of ['configureSubscription', 'stopSubscription', 'access', 'disableYooKassaAutoRenew']) {
            expect(Reflect.getMetadata('role', UserAdminController.prototype[method])).toBe(RolesEnum.ADMIN)
        }
        expect(subscriptionService.adminConfigureSubscription).toHaveBeenCalledWith(
            USER_ID,
            '22222222-2222-4222-8222-222222222222',
            undefined,
        )
        expect(subscriptionService.stopSubscription).toHaveBeenCalledWith(USER_ID)
        expect(autoRenewService.disable).toHaveBeenCalledWith(USER_ID)
        expect(access).toEqual(
            expect.objectContaining({ subscriptionUrl: 'https://access.example/current', deliveryMode: 'DIRECT_URL' }),
        )
        expect(access).not.toHaveProperty('rawConfig')
        expect(access).not.toHaveProperty('providerExternalId')
    })

    it('returns a stable empty access model without owner analytics or provider details', async () => {
        subscriptionService.getResolvedForUser.mockResolvedValue(null)
        await expect(controller.access(USER_ID)).resolves.toEqual({
            status: null,
            deliveryMode: 'UNAVAILABLE',
            subscriptionUrl: null,
            expiresAt: null,
            planTitle: null,
        })
        expect(accessPresentationService.buildPayload).not.toHaveBeenCalled()
    })

    it('keeps recurrent read and user-scoped mutations behind ADMIN and delegates both path identifiers', async () => {
        const agreementId = '22222222-2222-4222-8222-222222222222'
        plategaRecurrentAgreements.listForAdminUser.mockResolvedValue([])
        plategaRecurrentAgreements.cancelForAdminUser.mockResolvedValue({ id: agreementId })
        plategaRecurrentAgreements.reconcileForAdminUser.mockResolvedValue({ id: agreementId })

        await controller.recurrent(USER_ID)
        await controller.cancelRecurrent(USER_ID, agreementId)
        await controller.reconcileRecurrent(USER_ID, agreementId)

        for (const method of ['recurrent', 'cancelRecurrent', 'reconcileRecurrent']) {
            expect(Reflect.getMetadata('role', UserAdminController.prototype[method])).toBe(RolesEnum.ADMIN)
        }
        expect(plategaRecurrentAgreements.listForAdminUser).toHaveBeenCalledWith(USER_ID)
        expect(plategaRecurrentAgreements.cancelForAdminUser).toHaveBeenCalledWith(USER_ID, agreementId)
        expect(plategaRecurrentAgreements.reconcileForAdminUser).toHaveBeenCalledWith(USER_ID, agreementId)
    })
})
