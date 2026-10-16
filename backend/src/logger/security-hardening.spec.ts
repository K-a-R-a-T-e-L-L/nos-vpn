import {
    BadGatewayException,
    BadRequestException,
    ExecutionContext,
    HttpException,
    ServiceUnavailableException,
} from '@nestjs/common'
import { of } from 'rxjs'

import { AllExceptionsFilter } from './all-exceptions.filter'
import { HttpLoggingInterceptor } from './http-logging.interceptor'
import { TelegramLoggerService } from './logger.service'

function createHttpHost(url: string, method = 'GET') {
    const response = {
        status: jest.fn(),
        json: jest.fn(),
    }
    response.status.mockReturnValue(response)
    const host = {
        switchToHttp: () => ({
            getRequest: () => ({ url, method }),
            getResponse: () => response,
        }),
    }
    return { host: host as any, response }
}

describe('security logging boundaries', () => {
    it('hides internal 5xx details from clients and logs only sanitized context and stack frames', () => {
        const logger = { error: jest.fn(), warn: jest.fn() }
        const filter = new AllExceptionsFilter(logger as any)
        const { host, response } = createHttpHost('/api/fail?token=query-secret&state=ready', 'POST')
        const error = new Error('database password=internal-secret')
        error.stack = 'Error: database password=internal-secret\n    at service.ts:10:2'

        filter.catch(error, host)

        expect(response.status).toHaveBeenCalledWith(500)
        expect(response.json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' })
        expect(logger.error).toHaveBeenCalledWith(
            {
                status: 500,
                path: '/api/fail?token=[REDACTED]&state=ready',
                method: 'POST',
                error: { name: 'Error' },
            },
            '    at service.ts:10:2',
            'Exception',
        )
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain('query-secret')
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain('internal-secret')
    })

    it('also hides response details from an explicit 5xx HttpException', () => {
        const logger = { error: jest.fn(), warn: jest.fn() }
        const filter = new AllExceptionsFilter(logger as any)
        const { host, response } = createHttpHost('/api/fail')

        filter.catch(new HttpException({ statusCode: 500, message: 'provider secret=unsafe' }, 500), host)

        expect(response.json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' })
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain('unsafe')
    })

    it('preserves an explicit 503 status in the generic no-details body', () => {
        const logger = { error: jest.fn(), warn: jest.fn() }
        const filter = new AllExceptionsFilter(logger as any)
        const { host, response } = createHttpHost('/api/provider')

        filter.catch(new ServiceUnavailableException('provider secret=unsafe'), host)

        expect(response.status).toHaveBeenCalledWith(503)
        expect(response.json).toHaveBeenCalledWith({ statusCode: 503, message: 'Internal server error' })
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain('unsafe')
    })

    it('preserves an explicit 502 status in the generic no-details body', () => {
        const logger = { error: jest.fn(), warn: jest.fn() }
        const filter = new AllExceptionsFilter(logger as any)
        const { host, response } = createHttpHost('/api/provider')

        filter.catch(new BadGatewayException('provider secret=unsafe'), host)

        expect(response.status).toHaveBeenCalledWith(502)
        expect(response.json).toHaveBeenCalledWith({ statusCode: 502, message: 'Internal server error' })
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain('unsafe')
    })

    it('preserves known 4xx response semantics while sanitizing the logged copy', () => {
        const logger = { error: jest.fn(), warn: jest.fn() }
        const filter = new AllExceptionsFilter(logger as any)
        const { host, response } = createHttpHost('/api/user?refresh_token=query-secret')
        const body = {
            statusCode: 400,
            error: 'Bad Request',
            message: ['email|IS_EMAIL'],
            accessToken: 'metadata-secret',
        }

        filter.catch(new BadRequestException(body), host)

        expect(response.json).toHaveBeenCalledWith(body)
        expect(logger.warn).toHaveBeenCalledWith(
            expect.objectContaining({
                path: '/api/user?refresh_token=[REDACTED]',
                message: expect.objectContaining({ accessToken: '[REDACTED]' }),
            }),
            'Exception',
        )
        expect(body.accessToken).toBe('metadata-secret')
    })

    it('sanitizes the URL when the optional HTTP interceptor is used', () => {
        const logger = { log: jest.fn() }
        const interceptor = new HttpLoggingInterceptor(logger as any)
        const context = {
            switchToHttp: () => ({
                getRequest: () => ({ method: 'GET', url: '/api/link?token=unsafe&state=ready' }),
            }),
        } as ExecutionContext

        interceptor.intercept(context, { handle: () => of({ ok: true }) }).subscribe()

        expect(logger.log).toHaveBeenCalledWith(
            expect.stringContaining('/api/link?token=[REDACTED]&state=ready'),
            'HTTP',
        )
        expect(logger.log.mock.calls[0][0]).not.toContain('unsafe')
    })

    it('sanitizes generic logger messages and traces before console serialization', () => {
        const service = new TelegramLoggerService({} as any, {
            chatId: '',
            enableConsoleLog: true,
            logLevels: [],
        })
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)

        service.error(
            { Authorization: 'Bearer header-secret', cookie: 'sid=cookie-secret', operation: 'auth' },
            'Error: password=trace-secret\n    at auth.ts:1:1',
            'SecurityTest',
        )

        const output = String(consoleError.mock.calls[0][0])
        expect(output).toContain('operation')
        expect(output).toContain('[REDACTED]')
        expect(output).not.toContain('header-secret')
        expect(output).not.toContain('cookie-secret')
        expect(output).not.toContain('trace-secret')
        consoleError.mockRestore()
    })

    it('sanitizes Telegram transport failures before the console fallback', async () => {
        const bot = {
            telegram: {
                sendMessage: jest.fn().mockRejectedValue(new Error('request failed: token=transport-secret')),
            },
        }
        const service = new TelegramLoggerService(bot as any, { chatId: 'admin', logLevels: [] })
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)

        await (service as any).sendToTelegram('safe log')

        const output = consoleError.mock.calls.flat().join(' ')
        expect(output).toContain('token=[REDACTED]')
        expect(output).not.toContain('transport-secret')
        consoleError.mockRestore()
    })
})
