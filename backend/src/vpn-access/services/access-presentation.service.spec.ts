import { ConfigService } from '@nestjs/config'

import { AccessPresentationService } from './access-presentation.service'
import { StatusesEnum } from '../../subscription/enum/statuses.enum'
import { RemnawaveProviderAdapter } from '../../vpn-provider/adapters/remnawave-provider.adapter'
import { ServerNodeResolverService } from '../../vpn-provider/services/server-node-resolver.service'

describe('AccessPresentationService', () => {
    const subscriptionRepository = {
        findOne: jest.fn(),
    }
    const vpnAccessService = {
        findActiveBySubscription: jest.fn(),
        markProvisioned: jest.fn(),
    }
    const configService = {
        get: jest.fn(),
    } as unknown as ConfigService
    const provider = {
        getAccessState: jest.fn(),
    } as unknown as RemnawaveProviderAdapter
    const nodeResolver = {
        resolveNode: jest.fn(),
    } as unknown as ServerNodeResolverService
    const billingService = {
        getPlanLimitUnits: jest.fn(),
    }

    let service: AccessPresentationService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new AccessPresentationService(
            subscriptionRepository as any,
            vpnAccessService as any,
            configService,
            provider,
            nodeResolver,
            billingService as any,
        )
    })

    it('redacts sensitive delivery values in logs', () => {
        expect((service as any).safeLogValue('https://credential.example/secret')).toBe('[redacted]')
        expect((service as any).safeLogValue(null)).toBe('-')
    })

    it('refreshes access from provider and uses current public subscription domain', async () => {
        subscriptionRepository.findOne.mockResolvedValue({
            id: 'sub-1',
            status: StatusesEnum.ACTIVE,
            endsAt: new Date('2026-06-17T01:10:00.000Z'),
            graceEndsAt: null,
            plan: { title: 'Light', code: 'vpn_1', description: '1 устройство' },
        })
        vpnAccessService.findActiveBySubscription
            .mockResolvedValueOnce({
                id: 'access-1',
                subscriptionId: 'sub-1',
                serverNodeId: 'node-1',
                inboundKey: 'inbound-1',
                providerExternalId: 'legacy-uuid',
                providerClientKey: 'k_a_r_a_t_e_l_l_ab182126a236',
                subscriptionUrl: 'https://old.example/legacy',
                qrPayload: 'https://old.example/legacy',
                configPayload: { shortUuid: 'old-short' },
                accessEndsAt: new Date('2026-06-17T01:10:00.000Z'),
                status: 'ACTIVE',
            })
            .mockResolvedValueOnce({
                id: 'access-1',
                subscriptionId: 'sub-1',
                serverNodeId: 'node-1',
                inboundKey: 'inbound-1',
                providerExternalId: 'new-uuid',
                providerClientKey: 'k_a_r_a_t_e_l_l_ab182126a236',
                subscriptionUrl: 'https://panel-returned.example/ignore-me',
                qrPayload: 'https://panel-returned.example/ignore-me',
                configPayload: { shortUuid: 'new-short' },
                accessEndsAt: new Date('2026-06-17T01:10:00.000Z'),
                status: 'ACTIVE',
            })
        ;(configService.get as jest.Mock).mockReturnValue('https://subscriptions.example.invalid')
        ;(nodeResolver.resolveNode as jest.Mock).mockResolvedValue({ baseUrl: 'https://panel.example.invalid' })
        ;(provider.getAccessState as jest.Mock).mockResolvedValue({
            providerExternalId: 'new-uuid',
            providerClientKey: 'k_a_r_a_t_e_l_l_ab182126a236',
            subscriptionUrl: 'https://panel-returned.example/ignore-me',
            qrPayload: 'https://panel-returned.example/ignore-me',
            configPayload: { shortUuid: 'new-short' },
            isActive: true,
            expiresAt: new Date('2026-06-17T01:10:00.000Z'),
        })

        const payload = await service.buildPayload('sub-1')

        expect(nodeResolver.resolveNode).toHaveBeenCalled()
        expect(provider.getAccessState).toHaveBeenCalled()
        expect(vpnAccessService.markProvisioned).toHaveBeenCalledWith(
            'access-1',
            expect.objectContaining({
                providerExternalId: 'new-uuid',
                providerClientKey: 'k_a_r_a_t_e_l_l_ab182126a236',
            }),
        )
        expect(payload.subscriptionUrl).toBe('https://subscriptions.example.invalid/new-short')
        expect(payload.qrPayload).toBe('https://panel-returned.example/ignore-me')
        expect(payload.deliveryMode).toBe('DIRECT_URL')
    })

    it('falls back to cached access when provider refresh fails', async () => {
        subscriptionRepository.findOne.mockResolvedValue({
            id: 'sub-1',
            status: StatusesEnum.ACTIVE,
            endsAt: new Date('2026-06-17T01:10:00.000Z'),
            graceEndsAt: null,
            plan: { title: 'Light', code: 'vpn_1', description: '1 устройство' },
        })
        vpnAccessService.findActiveBySubscription.mockResolvedValue({
            id: 'access-1',
            subscriptionId: 'sub-1',
            serverNodeId: 'node-1',
            inboundKey: 'inbound-1',
            providerExternalId: 'legacy-uuid',
            providerClientKey: 'k_a_r_a_t_e_l_l_ab182126a236',
            subscriptionUrl: 'https://old.example/legacy',
            qrPayload: 'https://old.example/legacy',
            configPayload: { shortUuid: 'cached-short' },
            accessEndsAt: new Date('2026-06-17T01:10:00.000Z'),
            status: 'ACTIVE',
        })
        ;(configService.get as jest.Mock).mockReturnValue('https://subscriptions.example.invalid')
        ;(nodeResolver.resolveNode as jest.Mock).mockResolvedValue({ baseUrl: 'https://panel.example.invalid' })
        ;(provider.getAccessState as jest.Mock).mockRejectedValue(new Error('panel unavailable'))

        const payload = await service.buildPayload('sub-1')

        expect(provider.getAccessState).toHaveBeenCalled()
        expect(vpnAccessService.markProvisioned).not.toHaveBeenCalled()
        expect(payload.subscriptionUrl).toBe('https://subscriptions.example.invalid/cached-short')
        expect(payload.deliveryMode).toBe('DIRECT_URL')
    })
})
