import { randomUUID } from 'crypto'

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { RemnawaveRequestError } from '../errors/remnawave-request.error'

type RequestOptions = {
    method: string
    body?: Record<string, any>
    baseUrl?: string
}

@Injectable()
export class RemnawaveHttpClient {
    private readonly logger = new Logger(RemnawaveHttpClient.name)

    constructor(private readonly configService: ConfigService) {}

    private get baseUrl() {
        return this.configService.get<string>('REMNAWAVE_BASE_URL')!.replace(/\/$/, '')
    }

    private get apiToken() {
        return this.configService.get<string>('REMNAWAVE_API_TOKEN')!
    }

    private get timeoutMs() {
        return Number(this.configService.get<number>('REMNAWAVE_TIMEOUT_MS') || 10000)
    }

    createUser(payload: Record<string, any>, baseUrl?: string) {
        return this.request<any>('/api/users', { method: 'POST', body: payload, baseUrl })
    }

    updateUser(userUuid: string, payload: Record<string, any>, baseUrl?: string) {
        return this.request<any>('/api/users', { method: 'PATCH', body: { uuid: userUuid, ...payload }, baseUrl })
    }

    getUser(userUuid: string, baseUrl?: string) {
        return this.request<any>(`/api/users/${encodeURIComponent(userUuid)}`, { method: 'GET', baseUrl })
    }

    async getUserByUsername(username: string, baseUrl?: string) {
        const encoded = encodeURIComponent(username)

        try {
            return await this.request<any>(`/api/users/by-username/${encoded}`, { method: 'GET', baseUrl })
        } catch (error: unknown) {
            if (!(error instanceof RemnawaveRequestError) || error.statusCode !== 404) {
                throw error
            }
        }

        return null
    }

    resolveUser(username: string, baseUrl?: string) {
        return this.request<any>('/api/users/resolve', {
            method: 'POST',
            body: { username },
            baseUrl,
        })
    }

    updateUserInternalSquads(userUuid: string, squadUuids: string[], baseUrl?: string) {
        return this.request<any>('/api/users/bulk/update-squads', {
            method: 'POST',
            body: {
                uuids: [userUuid],
                activeInternalSquads: squadUuids,
            },
            baseUrl,
        })
    }

    enableUser(userUuid: string, baseUrl?: string) {
        return this.request<any>(`/api/users/${encodeURIComponent(userUuid)}/actions/enable`, {
            method: 'POST',
            baseUrl,
        })
    }

    disableUser(userUuid: string, baseUrl?: string) {
        return this.request<any>(`/api/users/${encodeURIComponent(userUuid)}/actions/disable`, {
            method: 'POST',
            baseUrl,
        })
    }

    revokeUserSubscription(userUuid: string, baseUrl?: string) {
        return this.request<any>(`/api/users/${encodeURIComponent(userUuid)}/actions/revoke`, {
            method: 'POST',
            baseUrl,
        })
    }

    deleteUser(userUuid: string, baseUrl?: string) {
        return this.request<any>(`/api/users/${encodeURIComponent(userUuid)}`, { method: 'DELETE', baseUrl })
    }

    private async request<T>(path: string, options: RequestOptions): Promise<T> {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
        const url = `${(options.baseUrl || this.baseUrl).replace(/\/$/, '')}${path}`
        const correlationId = randomUUID()
        const pathTemplate = this.toPathTemplate(path)
        const startedAt = Date.now()
        this.logger.log(
            `event=remnawave_request_started method=${options.method} pathTemplate=${pathTemplate} correlationId=${correlationId}`,
        )

        try {
            const response = await fetch(url, {
                method: options.method,
                headers: {
                    Authorization: `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: options.body ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
            })

            const text = await response.text()

            if (!response.ok) {
                this.logger.warn(
                    `event=remnawave_request_finished method=${options.method} pathTemplate=${pathTemplate} status=${response.status} durationMs=${Date.now() - startedAt} correlationId=${correlationId}`,
                )
                throw new RemnawaveRequestError(
                    'HTTP_ERROR',
                    options.method,
                    pathTemplate,
                    correlationId,
                    response.status,
                )
            }

            let payload: unknown = null
            if (text) {
                try {
                    payload = JSON.parse(text)
                } catch {
                    this.logger.error(
                        `event=remnawave_request_finished method=${options.method} pathTemplate=${pathTemplate} status=${response.status} result=INVALID_RESPONSE durationMs=${Date.now() - startedAt} correlationId=${correlationId}`,
                    )
                    throw new RemnawaveRequestError(
                        'INVALID_RESPONSE',
                        options.method,
                        pathTemplate,
                        correlationId,
                        response.status,
                    )
                }
            }
            this.logger.log(
                `event=remnawave_request_finished method=${options.method} pathTemplate=${pathTemplate} status=${response.status} durationMs=${Date.now() - startedAt} correlationId=${correlationId}`,
            )
            return payload as T
        } catch (error: unknown) {
            if (error instanceof RemnawaveRequestError) {
                throw error
            }
            this.logger.error(
                `event=remnawave_request_finished method=${options.method} pathTemplate=${pathTemplate} result=NETWORK_ERROR durationMs=${Date.now() - startedAt} correlationId=${correlationId}`,
            )
            throw new RemnawaveRequestError('NETWORK_ERROR', options.method, pathTemplate, correlationId)
        } finally {
            clearTimeout(timeout)
        }
    }

    private toPathTemplate(path: string): string {
        const pathname = path.split('?')[0]
        return pathname
            .replace(/\/api\/users\/by-username\/[^/]+$/, '/api/users/by-username/:username')
            .replace(/\/api\/users\/[^/]+\/actions\/(enable|disable|revoke)$/, '/api/users/:uuid/actions/$1')
            .replace(/\/api\/users\/[^/]+$/, '/api/users/:uuid')
    }
}
