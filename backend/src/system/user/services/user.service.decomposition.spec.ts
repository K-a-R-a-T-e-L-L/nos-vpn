import * as fs from 'fs'
import * as path from 'path'

import { UserService } from './user.service'

describe('UserService decomposition boundary', () => {
    it('keeps a thin compatibility facade over focused services', () => {
        const serviceDirectory = __dirname
        const expectedServices = [
            'user-admin.service.ts',
            'user-auth-link.service.ts',
            'user-delete.service.ts',
            'user-provisioning.service.ts',
        ]

        for (const file of expectedServices) {
            expect(fs.existsSync(path.join(serviceDirectory, file))).toBe(true)
        }

        const facade = fs.readFileSync(path.join(serviceDirectory, 'user.service.ts'), 'utf8')
        expect(facade.split(/\r?\n/).length).toBeLessThan(500)
    })

    it('delegates existing public entry points with unchanged arguments', async () => {
        const service = Object.create(UserService.prototype) as any
        service.authLinkService = { loginByEmail: jest.fn().mockResolvedValue({ accessToken: 'fixture' }) }
        service.provisioningService = { ensureTelegramUser: jest.fn().mockResolvedValue({ id: 'user-1' }) }
        service.adminService = { setBlocked: jest.fn().mockResolvedValue({ id: 'user-1', isBlocked: true }) }
        service.deleteService = { permanentlyDeleteUser: jest.fn().mockResolvedValue({ ok: true, id: 'user-1' }) }

        const credentials = { email: 'safe@example.com', password: 'fixture-password' }
        await expect(service.loginByEmail(credentials)).resolves.toEqual({ accessToken: 'fixture' })
        await expect(service.ensureTelegramUser({ id: 42 })).resolves.toEqual({ id: 'user-1' })
        await expect(service.setBlocked('user-1', true)).resolves.toEqual({ id: 'user-1', isBlocked: true })
        await expect(service.permanentlyDeleteUser('user-1', 'admin-1')).resolves.toEqual({
            ok: true,
            id: 'user-1',
        })

        expect(service.authLinkService.loginByEmail).toHaveBeenCalledWith(credentials)
        expect(service.provisioningService.ensureTelegramUser).toHaveBeenCalledWith({ id: 42 })
        expect(service.adminService.setBlocked).toHaveBeenCalledWith('user-1', true)
        expect(service.deleteService.permanentlyDeleteUser).toHaveBeenCalledWith('user-1', 'admin-1')
    })
})
