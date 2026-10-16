import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'

import { TelegramLoggerService } from './logger.service'
import { sanitizeLogString, sanitizeLogValue, sanitizeUrl } from './security-log-sanitizer'

function createInternalErrorResponse(status: HttpStatus) {
    return { statusCode: status, message: 'Internal server error' }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    constructor(private readonly logger: TelegramLoggerService) {}

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp()
        const response = ctx.getResponse()
        const request = ctx.getRequest()

        const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

        const exceptionResponse =
            exception instanceof HttpException ? exception.getResponse() : createInternalErrorResponse(status)
        const isInternalError = status >= HttpStatus.INTERNAL_SERVER_ERROR
        const clientResponse = isInternalError ? createInternalErrorResponse(status) : exceptionResponse

        const payload = sanitizeLogValue(
            isInternalError
                ? {
                      status,
                      path: sanitizeUrl(String(request.url || '')),
                      method: request.method,
                      error: { name: exception instanceof Error ? exception.name : 'UnknownError' },
                  }
                : {
                      status,
                      path: sanitizeUrl(String(request.url || '')),
                      method: request.method,
                      message: exceptionResponse,
                  },
        )
        if (isInternalError) {
            const stackFrames =
                exception instanceof Error && exception.stack
                    ? sanitizeLogString(exception.stack.split('\n').slice(1).join('\n')) || undefined
                    : undefined
            this.logger.error(payload, stackFrames, 'Exception')
        } else {
            this.logger.warn(payload, 'Exception')
        }

        if (response && typeof response.status === 'function' && typeof response.json === 'function') {
            response.status(status).json(clientResponse)
        }
    }
}
