import { VpnProviderTypeEnum } from '../enum/vpn-provider-type.enum'

export type EnsureAccessInput = {
    operationKey: string
    userKey: string
    inboundKey: string
    telegramId?: number | string
    email?: string | null
    hwidDeviceLimit?: number
    providerExternalId?: string
    providerClientKey?: string
    expiresAt: Date
    serverBaseUrl?: string
    metadata?: Record<string, any>
}

export type ExtendAccessInput = {
    operationKey: string
    inboundKey: string
    providerExternalId?: string
    providerClientKey?: string
    expiresAt: Date
    serverBaseUrl?: string
}

export type DisableAccessInput = {
    operationKey: string
    inboundKey: string
    providerExternalId?: string
    providerClientKey?: string
    serverBaseUrl?: string
}

export type RemoveAccessInput = {
    operationKey: string
    inboundKey: string
    providerExternalId?: string
    providerClientKey?: string
    serverBaseUrl?: string
}

export type GetAccessStateInput = {
    inboundKey: string
    providerExternalId?: string
    providerClientKey?: string
    userKey?: string
    serverBaseUrl?: string
}

export type ProviderAccessState = {
    providerType: VpnProviderTypeEnum
    providerExternalId?: string
    providerClientKey?: string
    subscriptionUrl?: string
    qrPayload?: string
    configPayload?: Record<string, any>
    isActive: boolean
    expiresAt?: Date
    raw?: Record<string, any>
}

export interface VpnProvider {
    readonly type: VpnProviderTypeEnum

    ensureAccess(input: EnsureAccessInput): Promise<ProviderAccessState>
    extendAccess(input: ExtendAccessInput): Promise<ProviderAccessState>
    disableAccess(input: DisableAccessInput): Promise<ProviderAccessState>
    removeAccess(input: RemoveAccessInput): Promise<void>
    getAccessState(input: GetAccessStateInput): Promise<ProviderAccessState>
}
