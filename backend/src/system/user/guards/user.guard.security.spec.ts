import { ExecutionContext } from '@nestjs/common'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { UserGuard } from './user.guard'

describe('UserGuard security contract', () => {
    const userService = { getUserFromToken: jest.fn() }
    const jwtService = { verify: jest.fn() }
    const configService = { get: jest.fn().mockReturnValue('access-secret') }

    const createContext = (authorization?: string) =>
        ({
            switchToHttp: () => ({
                getRequest: () => ({ headers: authorization ? { authorization } : {} }),
            }),
        }) as ExecutionContext

    const createGuard = () => new UserGuard(userService as any, jwtService as any, configService as any)

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it.each([
        ['expired JWT', 'jwt expired'],
        ['malformed JWT', 'jwt malformed'],
        ['invalid JWT signature', 'invalid signature'],
    ])('returns one generic 401 contract for %s', async (_caseName, rawMessage) => {
        jwtService.verify.mockImplementation(() => {
            throw new Error(rawMessage)
        })

        await expect(createGuard().canActivate(createContext('Bearer unsafe.jwt.value'))).rejects.toMatchObject({
            status: 401,
            response: {
                statusCode: 401,
                message: ErrorCodeEnum.AUTH_FAIL,
                description: 'Authentication failed',
            },
        })

        try {
            await createGuard().canActivate(createContext('Bearer unsafe.jwt.value'))
        } catch (error) {
            expect(JSON.stringify((error as ErrorDto).getResponse())).not.toContain(rawMessage)
        }
        expect(userService.getUserFromToken).not.toHaveBeenCalled()
    })

    it('uses the same generic 401 contract when the bearer token is missing', async () => {
        await expect(createGuard().canActivate(createContext())).rejects.toMatchObject({
            status: 401,
            response: {
                statusCode: 401,
                message: ErrorCodeEnum.AUTH_FAIL,
                description: 'Authentication failed',
            },
        })
        expect(jwtService.verify).not.toHaveBeenCalled()
    })

    it.each([
        ['blocked user', new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'User is blocked'), 403],
        ['deleted user', new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND), 404],
    ])('preserves the owning user lookup contract for a %s', async (_caseName, lookupError, status) => {
        jwtService.verify.mockReturnValue({ sub: 'user-1' })
        userService.getUserFromToken.mockRejectedValue(lookupError)

        await expect(createGuard().canActivate(createContext('Bearer valid-token'))).rejects.toBe(lookupError)
        expect(lookupError.getStatus()).toBe(status)
    })
})
