import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'

import { UserAdminService } from './user-admin.service'
import { UserAuthLinkService } from './user-auth-link.service'
import { UserProvisioningService } from './user-provisioning.service'
import { StatusesEnum } from '../../../subscription/enum/statuses.enum'
import { RolesEnum } from '../enum/roles.enum'

const makeService = (serviceClass: any, overrides: Record<string, any> = {}) => {
    const service = Object.create(serviceClass.prototype) as any
    Object.assign(service, {
        userRepository: {
            findOne: jest.fn(),
            findOneBy: jest.fn(),
            save: jest.fn(async (value) => value),
            create: jest.fn((value) => value),
        },
        telegramAuthRequestRepository: { findOne: jest.fn(), save: jest.fn(async (value) => value) },
        telegramSiteLinkRequestRepository: { findOne: jest.fn(), save: jest.fn(async (value) => value) },
        configService: { get: jest.fn((key: string) => (key === 'TELEGRAM_ADMIN_IDS' ? '42' : undefined)) },
        vpnAccessService: { findActiveBySubscription: jest.fn(), findProvisionableBySubscription: jest.fn() },
        remnawaveProvider: { updateUserContacts: jest.fn() },
        serverNodeResolver: { resolveNode: jest.fn() },
        notificationService: { notify: jest.fn() },
        subscriptionService: { getResolvedById: jest.fn(), stopSubscription: jest.fn().mockResolvedValue(undefined) },
        provisioningService: {
            ensureTelegramUserWithMetadata: jest.fn(),
            getUserByTelegramId: jest.fn(),
            generateUniqueReferralCode: jest.fn(),
            assertUserIsNotBlocked: jest.fn(),
            syncActiveAccessContacts: jest.fn(),
            applyTelegramProfile: jest.fn(),
            applyAdminRoleIfTelegramAdmin: jest.fn(),
        },
        logger: { warn: jest.fn() },
        ...overrides,
    })
    return service
}

describe('UserService behavior characterization', () => {
    it('updates an existing Telegram profile without downgrading its role', async () => {
        const user = {
            id: 'user-1',
            telegramId: 42,
            telegramUsername: 'old',
            telegramFirstName: 'Old',
            telegramLastName: 'Name',
            telegramIsPremium: false,
            telegramLanguageCode: 'en',
            telegramLinkedAt: new Date(),
            referralCode: 'ref_existing',
            email: 'existing@example.com',
            role: RolesEnum.ADMIN,
        }
        const service = makeService(UserProvisioningService)
        service.generateUniqueReferralCode = jest.fn()
        service.userRepository.findOne.mockResolvedValue(user)

        const result = await service.ensureTelegramUserWithMetadata({
            id: 42,
            username: 'new',
            first_name: 'New',
            last_name: 'Profile',
            is_premium: true,
            language_code: 'ru',
        })

        expect(result).toMatchObject({ user: { role: RolesEnum.ADMIN, telegramUsername: 'new' }, isNewUser: false })
        expect(service.userRepository.save).toHaveBeenCalledTimes(1)
        expect(result.user.referralCode).toBe('ref_existing')
        expect(service.generateUniqueReferralCode).not.toHaveBeenCalled()
    })

    it('rejects a blocked Telegram user before profile persistence', async () => {
        const service = makeService(UserProvisioningService)
        service.userRepository.findOne.mockResolvedValue({ id: 'user-1', telegramId: 42, isBlocked: true })

        await expect(service.ensureTelegramUser({ id: 42 })).rejects.toMatchObject({
            message: ErrorCodeEnum.FORBIDDEN,
        })
        expect(service.userRepository.save).not.toHaveBeenCalled()
    })

    it('preserves Telegram auth request confirmation and provisioning call', async () => {
        const request = { consumedAt: null, userId: null, confirmedAt: null }
        const provisioned = { user: { id: 'user-1' }, isNewUser: false }
        const service = makeService(UserAuthLinkService)
        service.telegramAuthRequestRepository.findOne.mockResolvedValue(request)
        service.provisioningService.ensureTelegramUserWithMetadata.mockResolvedValue(provisioned)

        await expect(service.confirmTelegramAuthByStartPayload('auth_fixture', { id: 42 })).resolves.toBe(provisioned)

        expect(service.telegramAuthRequestRepository.findOne).toHaveBeenCalledWith({
            where: {
                botTokenHash: expect.any(String),
                expiresAt: expect.objectContaining({ _type: 'moreThan', _value: expect.any(Date) }),
            },
        })
        expect(service.provisioningService.ensureTelegramUserWithMetadata).toHaveBeenCalledWith({ id: 42 })
        expect(request).toEqual(expect.objectContaining({ userId: 'user-1', confirmedAt: expect.any(Date) }))
        expect(service.telegramAuthRequestRepository.save).toHaveBeenCalledWith(request)
    })

    it('preserves duplicate Telegram ownership conflict before mutation', async () => {
        const target = { id: 'target', telegramId: null, isBlocked: false, subscription: null }
        const owner = { id: 'owner', telegramId: 42, subscription: null }
        const service = makeService(UserAuthLinkService)
        service.userRepository.findOne.mockResolvedValueOnce(target).mockResolvedValueOnce(owner)

        await expect(service.linkTelegramByStartPayload('link_fixture', { id: 42 })).rejects.toMatchObject({
            message: ErrorCodeEnum.FORBIDDEN,
        })
        expect(service.userRepository.save).not.toHaveBeenCalled()
        expect(service.remnawaveProvider.updateUserContacts).not.toHaveBeenCalled()
    })

    it('preserves block state and active subscription stop arguments', async () => {
        const user = { id: 'user-1', isBlocked: false, blockedAt: null, subscription: { id: 'sub-1' } }
        const service = makeService(UserAdminService)
        service.userRepository.findOne.mockResolvedValue(user)
        service.subscriptionService.getResolvedById.mockResolvedValue({ id: 'sub-1', status: StatusesEnum.ACTIVE })

        await service.setBlocked('user-1', true)

        expect(service.userRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({ isBlocked: true, blockedAt: expect.any(Date) }),
        )
        expect(service.subscriptionService.stopSubscription).toHaveBeenCalledWith('user-1')
    })

    it('preserves exact Remnawave contact synchronization and swallows provider failure', async () => {
        const service = makeService(UserProvisioningService)
        const user = { id: 'user-1', telegramId: 42, email: 'safe@example.com', subscription: { id: 'sub-1' } }
        service.vpnAccessService.findActiveBySubscription.mockResolvedValue({
            serverNodeId: 'node-1',
            providerExternalId: 'external-1',
            providerClientKey: 'client-1',
        })
        service.serverNodeResolver.resolveNode.mockResolvedValue({ baseUrl: 'https://provider.example' })
        service.remnawaveProvider.updateUserContacts.mockRejectedValue(new Error('provider unavailable'))

        await expect(service.syncActiveAccessContacts(user)).resolves.toBeUndefined()

        expect(service.serverNodeResolver.resolveNode).toHaveBeenCalledWith('REMNAWAVE', 'node-1')
        expect(service.remnawaveProvider.updateUserContacts).toHaveBeenCalledWith({
            providerExternalId: 'external-1',
            providerClientKey: 'client-1',
            telegramId: 42,
            email: 'safe@example.com',
            serverBaseUrl: 'https://provider.example',
        })
        expect(service.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Failed to sync Remnawave contact fields'),
        )
    })

    it('creates a Telegram identity once with referral, role and temporary credentials', async () => {
        const service = makeService(UserProvisioningService)
        service.userRepository.findOne.mockResolvedValue(null)

        const result = await service.ensureTelegramUserWithMetadata({ id: 42, first_name: 'New' })

        expect(service.userRepository.create).toHaveBeenCalledTimes(1)
        expect(service.userRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                telegramId: 42,
                telegramFirstName: 'New',
                referralCode: 'ref_42',
                role: RolesEnum.ADMIN,
                email: 'tg_42@telegram.local',
                hasTemporaryWebCredentials: true,
            }),
        )
        expect(service.userRepository.save).toHaveBeenCalledTimes(1)
        expect(result).toMatchObject({ isNewUser: true, temporaryCredentials: { login: 'tg_42@telegram.local' } })
    })

    it('preserves email attachment normalization, role and provisioning sync', async () => {
        const user = {
            id: 'user-1',
            role: RolesEnum.ADMIN,
            hasTemporaryWebCredentials: true,
            emailVerifiedAt: null,
            subscription: { id: 'sub-1' },
        }
        const service = makeService(UserAuthLinkService)
        service.userRepository.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(null)

        const result = await service.attachEmailPassword('user-1', {
            email: '  SAFE@Example.COM ',
            password: 'fixture-password',
        })

        expect(result).toEqual(
            expect.objectContaining({
                email: 'safe@example.com',
                role: RolesEnum.ADMIN,
                hasTemporaryWebCredentials: false,
                emailVerifiedAt: expect.any(Date),
                passwordHash: expect.any(String),
            }),
        )
        expect(service.provisioningService.syncActiveAccessContacts).toHaveBeenCalledWith(result)
    })
})
