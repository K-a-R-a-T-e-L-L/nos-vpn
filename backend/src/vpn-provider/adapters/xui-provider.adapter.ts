import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { XuiHttpClient } from '../clients/xui-http.client'
import { VpnProviderTypeEnum } from '../enum/vpn-provider-type.enum'
import {
    DisableAccessInput,
    EnsureAccessInput,
    ExtendAccessInput,
    GetAccessStateInput,
    ProviderAccessState,
    RemoveAccessInput,
    VpnProvider,
} from '../interfaces/vpn-provider.interface'

@Injectable()
export class XuiProviderAdapter implements VpnProvider {
    readonly type = VpnProviderTypeEnum.XUI

    constructor(
        private readonly configService: ConfigService,
        private readonly xuiClient: XuiHttpClient,
    ) {}

    async ensureAccess(input: EnsureAccessInput): Promise<ProviderAccessState> {
        const inboundKey = input.inboundKey || this.configService.get<string>('XUI_INBOUND_ID')!
        const existing = await this.findClient({
            inboundKey,
            providerClientKey: input.userKey,
            serverBaseUrl: input.serverBaseUrl,
        })

        const expiresAtMs = input.expiresAt.getTime()
        const clientId = existing?.id || input.metadata?.clientId || input.userKey

        const settings = {
            clients: [
                {
                    id: clientId,
                    email: input.userKey,
                    enable: true,
                    expiryTime: expiresAtMs,
                    totalGB: 0,
                    limitIp: 0,
                    tgId: '',
                    subId: input.userKey,
                    reset: 0,
                },
            ],
        }

        if (existing?.id) {
            await this.xuiClient.updateClient(inboundKey, existing.id, settings, input.serverBaseUrl)
        } else {
            await this.xuiClient.addClient(inboundKey, settings, input.serverBaseUrl)
        }

        const state = await this.getAccessState({
            inboundKey,
            providerClientKey: input.userKey,
            serverBaseUrl: input.serverBaseUrl,
        })
        return {
            ...state,
            providerClientKey: input.userKey,
        }
    }

    async extendAccess(input: ExtendAccessInput): Promise<ProviderAccessState> {
        const inboundKey = input.inboundKey || this.configService.get<string>('XUI_INBOUND_ID')!
        const existing = await this.findClient({
            inboundKey,
            providerExternalId: input.providerExternalId,
            providerClientKey: input.providerClientKey,
            serverBaseUrl: input.serverBaseUrl,
        })

        if (!existing?.id) {
            throw new Error('XUI client was not found for extendAccess')
        }

        const settings = {
            clients: [
                {
                    ...existing,
                    enable: true,
                    expiryTime: input.expiresAt.getTime(),
                },
            ],
        }

        await this.xuiClient.updateClient(inboundKey, existing.id, settings, input.serverBaseUrl)
        return this.getAccessState({
            inboundKey,
            providerExternalId: existing.id,
            providerClientKey: existing.email,
            serverBaseUrl: input.serverBaseUrl,
        })
    }

    async disableAccess(input: DisableAccessInput): Promise<ProviderAccessState> {
        const inboundKey = input.inboundKey || this.configService.get<string>('XUI_INBOUND_ID')!
        const existing = await this.findClient({
            inboundKey,
            providerExternalId: input.providerExternalId,
            providerClientKey: input.providerClientKey,
            serverBaseUrl: input.serverBaseUrl,
        })

        if (!existing?.id) {
            return {
                providerType: this.type,
                isActive: false,
            }
        }

        const settings = {
            clients: [
                {
                    ...existing,
                    enable: false,
                },
            ],
        }

        await this.xuiClient.updateClient(inboundKey, existing.id, settings, input.serverBaseUrl)
        return this.getAccessState({
            inboundKey,
            providerExternalId: existing.id,
            providerClientKey: existing.email,
            serverBaseUrl: input.serverBaseUrl,
        })
    }

    async removeAccess(input: RemoveAccessInput): Promise<void> {
        const inboundKey = input.inboundKey || this.configService.get<string>('XUI_INBOUND_ID')!
        const existing = await this.findClient({
            inboundKey,
            providerExternalId: input.providerExternalId,
            providerClientKey: input.providerClientKey,
            serverBaseUrl: input.serverBaseUrl,
        })

        if (!existing?.id) {
            return
        }

        await this.xuiClient.deleteClient(inboundKey, existing.id, input.serverBaseUrl)
    }

    async getAccessState(input: GetAccessStateInput): Promise<ProviderAccessState> {
        const inboundKey = input.inboundKey || this.configService.get<string>('XUI_INBOUND_ID')!
        const existing = await this.findClient({
            inboundKey,
            providerExternalId: input.providerExternalId,
            providerClientKey: input.providerClientKey || input.userKey,
            serverBaseUrl: input.serverBaseUrl,
        })

        if (!existing) {
            return {
                providerType: this.type,
                providerExternalId: input.providerExternalId,
                providerClientKey: input.providerClientKey || input.userKey,
                isActive: false,
            }
        }

        return {
            providerType: this.type,
            providerExternalId: existing.id,
            providerClientKey: existing.email,
            isActive: Boolean(existing.enable),
            expiresAt: existing.expiryTime ? new Date(existing.expiryTime) : undefined,
            configPayload: existing,
            raw: existing,
        }
    }

    private async findClient(input: {
        inboundKey: string
        providerExternalId?: string
        providerClientKey?: string
        serverBaseUrl?: string
    }): Promise<any | null> {
        const inbounds = await this.xuiClient.getInbounds(input.serverBaseUrl)
        const inbound = inbounds.find((item: any) => String(item.id) === String(input.inboundKey))

        if (!inbound?.settings) {
            return null
        }

        const settings = typeof inbound.settings === 'string' ? JSON.parse(inbound.settings) : inbound.settings
        const clients = settings?.clients || []

        return (
            clients.find((client: any) => {
                if (input.providerExternalId && client.id === input.providerExternalId) {
                    return true
                }

                if (input.providerClientKey && client.email === input.providerClientKey) {
                    return true
                }

                return false
            }) || null
        )
    }
}
