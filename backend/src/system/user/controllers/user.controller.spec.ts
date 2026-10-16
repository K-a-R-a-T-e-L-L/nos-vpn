import { UserController } from './user.controller'

describe('UserController auth cookies', () => {
    const createController = () => new UserController({} as any)

    afterEach(() => {
        delete process.env.FRONTEND_ORIGIN
        delete process.env.AUTH_COOKIE_DOMAIN
        delete process.env.AUTH_COOKIE_SECURE
    })

    it('derives a shared cookie domain from production frontend origin', () => {
        process.env.FRONTEND_ORIGIN = 'https://vpn.example.invalid'
        const controller = createController() as any

        expect(controller.getRefreshCookieOptions()).toMatchObject({
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: true,
            domain: 'vpn.example.invalid',
        })
    })

    it('does not set cookie domain for localhost development', () => {
        process.env.FRONTEND_ORIGIN = 'http://localhost:3000'
        const controller = createController() as any

        expect(controller.getRefreshCookieOptions()).toMatchObject({
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: false,
        })
        expect(controller.getRefreshCookieOptions().domain).toBeUndefined()
    })

    it('allows explicit cookie domain override', () => {
        process.env.FRONTEND_ORIGIN = 'https://app.vpn.example.invalid'
        process.env.AUTH_COOKIE_DOMAIN = '.vpn.example.invalid'
        const controller = createController() as any

        expect(controller.getRefreshCookieOptions()).toMatchObject({
            domain: '.vpn.example.invalid',
            secure: true,
        })
    })

    it('clears refresh cookie with the same cookie scope', async () => {
        process.env.FRONTEND_ORIGIN = 'https://vpn.example.invalid'
        const controller = createController() as any
        const response = {
            clearCookie: jest.fn(),
        }

        await controller.logout(response)

        expect(response.clearCookie).toHaveBeenCalledWith(
            'refresh_token',
            expect.objectContaining({
                path: '/',
                httpOnly: true,
                sameSite: 'strict',
                secure: true,
                domain: 'vpn.example.invalid',
            }),
        )
    })
})
