import helmet from 'helmet'

export function createHttpSecurityMiddleware(enableSwagger: boolean) {
    return helmet(enableSwagger ? { contentSecurityPolicy: false } : undefined)
}
