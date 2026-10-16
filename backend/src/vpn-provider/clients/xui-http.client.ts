import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

type XuiResponse<T = any> = {
    success: boolean
    msg?: string
    obj?: T
}

@Injectable()
export class XuiHttpClient {
    private cookies = new Map<string, string>()

    constructor(private readonly configService: ConfigService) {}

    private get baseUrl() {
        return this.configService.get<string>('XUI_BASE_URL')!.replace(/\/$/, '')
    }

    private get timeoutMs() {
        return Number(this.configService.get<number>('XUI_TIMEOUT_MS') || 10000)
    }

    private get username() {
        return this.configService.get<string>('XUI_USERNAME')!
    }

    private get password() {
        return this.configService.get<string>('XUI_PASSWORD')!
    }

    async login(force = false, baseUrl?: string) {
        if (this.cookies.size > 0 && !force) {
            return
        }

        const res = await this.rawRequest('/login', {
            method: 'POST',
            body: { username: this.username, password: this.password },
            skipAuthRetry: true,
            baseUrl,
        })

        if (!res.ok) {
            throw new Error(`XUI login failed with status ${res.status}`)
        }

        const rawSetCookies =
            typeof (res.headers as any).getSetCookie === 'function'
                ? (res.headers as any).getSetCookie()
                : this.extractSetCookiesFallback(res.headers.get('set-cookie'))
        if (!rawSetCookies?.length) {
            throw new Error('XUI login did not return session cookie')
        }

        this.cookies.clear()
        for (const rawCookie of rawSetCookies) {
            const pair = rawCookie.split(';')[0]?.trim()
            if (!pair) {
                continue
            }
            const idx = pair.indexOf('=')
            if (idx <= 0) {
                continue
            }
            const key = pair.substring(0, idx).trim()
            const value = pair.substring(idx + 1).trim()
            this.cookies.set(key, value)
        }
    }

    async getInbounds(baseUrl?: string) {
        const data = await this.request<XuiResponse<any[]>>('/panel/api/inbounds/list', {
            method: 'GET',
            baseUrl,
        })

        return data.obj || []
    }

    async addClient(inboundId: string, settings: Record<string, any>, baseUrl?: string) {
        return this.request<XuiResponse>(`/panel/api/inbounds/addClient`, {
            method: 'POST',
            body: {
                id: Number(inboundId),
                settings: JSON.stringify(settings),
            },
            baseUrl,
        })
    }

    async updateClient(inboundId: string, clientId: string, settings: Record<string, any>, baseUrl?: string) {
        return this.request<XuiResponse>(`/panel/api/inbounds/updateClient/${clientId}`, {
            method: 'POST',
            body: {
                id: Number(inboundId),
                settings: JSON.stringify(settings),
            },
            baseUrl,
        })
    }

    async deleteClient(inboundId: string, clientId: string, baseUrl?: string) {
        return this.request<XuiResponse>(`/panel/api/inbounds/${Number(inboundId)}/delClient/${clientId}`, {
            method: 'POST',
            baseUrl,
        })
    }

    private async request<T = any>(path: string, init: { method: string; body?: any; baseUrl?: string }) {
        await this.login(false, init.baseUrl)
        const response = await this.rawRequest(path, { ...init })

        if (response.status === 401) {
            await this.login(true, init.baseUrl)
            const retryResponse = await this.rawRequest(path, { ...init, skipAuthRetry: true })
            return this.parseResponse<T>(retryResponse)
        }

        return this.parseResponse<T>(response)
    }

    private async rawRequest(
        path: string,
        init: { method: string; body?: any; skipAuthRetry?: boolean; baseUrl?: string },
    ): Promise<Response> {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

        try {
            const response = await fetch(`${(init.baseUrl || this.baseUrl).replace(/\/$/, '')}${path}`, {
                method: init.method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.cookies.size > 0 ? { Cookie: this.buildCookieHeader() } : {}),
                },
                body: init.body ? JSON.stringify(init.body) : undefined,
                signal: controller.signal,
            })

            return response
        } finally {
            clearTimeout(timeout)
        }
    }

    private async parseResponse<T>(response: Response): Promise<T> {
        if (!response.ok) {
            throw new Error(`XUI request failed with status ${response.status}`)
        }

        return response.json() as Promise<T>
    }

    private buildCookieHeader() {
        return Array.from(this.cookies.entries())
            .map(([k, v]) => `${k}=${v}`)
            .join('; ')
    }

    private extractSetCookiesFallback(raw: string | null): string[] {
        if (!raw) {
            return []
        }
        const parts = raw.split(/,(?=\s*[A-Za-z0-9!#$%&'*+\-.^_`|~]+=)/g)
        return parts.map((s) => s.trim()).filter(Boolean)
    }
}
