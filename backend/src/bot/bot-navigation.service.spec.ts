import { BotNavigationService } from './bot-navigation.service'

describe('BotNavigationService', () => {
    it('stores and clears in-memory navigation state', () => {
        const service = new BotNavigationService()

        service.set(123, { welcomeMessageId: 9, navigationMessageId: 10, navigationMessageIds: [10, 11], section: 'main_menu' })

        expect(service.get(123)).toEqual(
            expect.objectContaining({
                welcomeMessageId: 9,
                navigationMessageId: 10,
                navigationMessageIds: [10, 11],
                section: 'main_menu',
            }),
        )

        service.clear(123)

        expect(service.get(123)).toBeNull()
    })

    it('patches known message ids without dropping current state', () => {
        const service = new BotNavigationService()

        service.set(123, { welcomeMessageId: 9 })
        service.patch(123, { navigationMessageId: 10, navigationMessageIds: [10, 12], section: 'faq' })

        expect(service.get(123)).toEqual(
            expect.objectContaining({
                welcomeMessageId: 9,
                navigationMessageId: 10,
                navigationMessageIds: [10, 12],
                section: 'faq',
            }),
        )
    })

    it('returns null when state is missing', () => {
        const service = new BotNavigationService()

        expect(service.get(123)).toBeNull()
    })
})
