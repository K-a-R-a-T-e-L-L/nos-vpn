import { randomUUID } from 'crypto'

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { RemnawaveHttpClient } from '../clients/remnawave-http.client'
import { VpnProviderTypeEnum } from '../enum/vpn-provider-type.enum'
import { RemnawaveRequestError } from '../errors/remnawave-request.error'
import {
    DisableAccessInput,
    EnsureAccessInput,
    ExtendAccessInput,
    GetAccessStateInput,
    ProviderAccessState,
    RemoveAccessInput,
    VpnProvider,
} from '../interfaces/vpn-provider.interface'
import { resolveTargetInternalSquadUuids } from '../policies/remnawave-squad-policy'

@Injectable()
export class RemnawaveProviderAdapter implements VpnProvider {
    readonly type = VpnProviderTypeEnum.REMNAWAVE
    private readonly logger = new Logger(RemnawaveProviderAdapter.name)

    constructor(
        private readonly client: RemnawaveHttpClient,
        private readonly configService: ConfigService,
    ) {}

    async ensureAccess(input: EnsureAccessInput): Promise<ProviderAccessState> {
        const username = input.userKey
        const correlationId = randomUUID()
        this.logger.log(`event=ensure_access_started correlationId=${correlationId}`)
        try {
            const existing = await this.findUser(input.providerExternalId, username, input.serverBaseUrl)
            const targetSquadUuids = this.resolveTargetSquads(existing)
            const payload = this.buildUserPayload(
                username,
                input.expiresAt,
                input.telegramId,
                input.email,
                input.hwidDeviceLimit,
                targetSquadUuids,
            )
            const branch = existing ? 'update' : 'create'
            this.logger.log(`event=ensure_access_branch_${branch} correlationId=${correlationId}`)
            const user = existing
                ? await this.updateExistingUser(existing, payload, input.serverBaseUrl)
                : await this.createNewUser(payload, input.serverBaseUrl)
            const resolved = await this.ensureUserWithUuid(user, username, input.serverBaseUrl)
            const assigned = await this.ensureInternalSquadMembership(resolved, targetSquadUuids, input.serverBaseUrl)
            this.logger.log(
                `event=ensure_access_succeeded correlationId=${correlationId} branch=${branch} resultCode=OK`,
            )
            return this.toProviderState(assigned, username)
        } catch (error: unknown) {
            const resultCode = error instanceof RemnawaveRequestError ? error.category : 'INTERNAL_ERROR'
            this.logger.error(`event=ensure_access_failed correlationId=${correlationId} resultCode=${resultCode}`)
            throw error
        }
    }

    async extendAccess(input: ExtendAccessInput): Promise<ProviderAccessState> {
        const user = await this.requireUser(input.providerExternalId, input.providerClientKey, input.serverBaseUrl)
        const targetSquadUuids = this.resolveTargetSquads(user)
        const updated = await this.client.updateUser(
            this.extractUserUuid(user),
            {
                expireAt: input.expiresAt.toISOString(),
                expiresAt: input.expiresAt.toISOString(),
            },
            input.serverBaseUrl,
        )

        const resolved = await this.ensureUserWithUuid(updated, input.providerClientKey, input.serverBaseUrl)
        const assigned = await this.ensureInternalSquadMembership(resolved, targetSquadUuids, input.serverBaseUrl)
        return this.toProviderState(assigned, input.providerClientKey)
    }

    async disableAccess(input: DisableAccessInput): Promise<ProviderAccessState> {
        const user = await this.findUser(input.providerExternalId, input.providerClientKey, input.serverBaseUrl)
        if (!user) {
            return {
                providerType: this.type,
                providerExternalId: input.providerExternalId,
                providerClientKey: input.providerClientKey,
                isActive: false,
            }
        }

        const disabled = await this.client.disableUser(this.extractUserUuid(user), input.serverBaseUrl)
        return this.toProviderState(disabled || user, input.providerClientKey, false)
    }

    async removeAccess(input: RemoveAccessInput): Promise<void> {
        const user = await this.findUser(input.providerExternalId, input.providerClientKey, input.serverBaseUrl)
        if (!user) {
            return
        }

        await this.client.deleteUser(this.extractUserUuid(user), input.serverBaseUrl)
    }

    async getAccessState(input: GetAccessStateInput): Promise<ProviderAccessState> {
        const user = await this.findUser(
            input.providerExternalId,
            input.providerClientKey || input.userKey,
            input.serverBaseUrl,
        )
        if (!user) {
            return {
                providerType: this.type,
                providerExternalId: input.providerExternalId,
                providerClientKey: input.providerClientKey || input.userKey,
                isActive: false,
            }
        }

        return this.toProviderState(user, input.providerClientKey || input.userKey)
    }

    async updateUserContacts(input: {
        providerExternalId?: string
        providerClientKey?: string
        telegramId?: number | string
        email?: string | null
        serverBaseUrl?: string
    }) {
        const user = await this.findUser(input.providerExternalId, input.providerClientKey, input.serverBaseUrl)
        if (!user) {
            this.logger.warn('event=update_user_contacts_skipped resultCode=USER_NOT_FOUND')
            return null
        }

        const payload: Record<string, any> = {}
        const numericTelegramId = this.toNumericTelegramId(input.telegramId)
        const normalizedEmail = this.normalizeEmail(input.email)

        if (numericTelegramId !== null) {
            payload.telegramId = numericTelegramId
        }

        if (normalizedEmail) {
            payload.email = normalizedEmail
        }

        if (!Object.keys(payload).length) {
            this.logger.log('event=update_user_contacts_skipped resultCode=NO_FIELDS')
            return user
        }

        return this.updateExistingUser(user, payload, input.serverBaseUrl)
    }

    private buildUserPayload(
        username: string,
        expiresAt: Date,
        telegramId?: number | string,
        email?: string | null,
        hwidDeviceLimit?: number,
        targetSquadUuids: string[] = [],
    ) {
        const payload: Record<string, any> = {
            username,
            expireAt: expiresAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            status: 'ACTIVE',
        }

        const numericTelegramId = this.toNumericTelegramId(telegramId)
        if (numericTelegramId !== null) {
            payload.telegramId = numericTelegramId
        }

        const normalizedEmail = this.normalizeEmail(email)
        if (normalizedEmail) {
            payload.email = normalizedEmail
        }

        if (hwidDeviceLimit && hwidDeviceLimit > 0) {
            payload.hwidDeviceLimit = hwidDeviceLimit
        }

        if (targetSquadUuids.length) {
            payload.activeInternalSquads = targetSquadUuids
        }

        return payload
    }

    private toNumericTelegramId(telegramId?: number | string) {
        if (telegramId === undefined || telegramId === null || telegramId === '') {
            return null
        }

        const numericTelegramId = Number(telegramId)
        if (!Number.isFinite(numericTelegramId)) {
            this.logger.warn('event=remnawave_contact_skipped resultCode=INVALID_TELEGRAM_ID')
            return null
        }

        return numericTelegramId
    }

    private normalizeEmail(email?: string | null) {
        const normalized = String(email || '')
            .trim()
            .toLowerCase()
        return normalized || null
    }

    private async createNewUser(payload: Record<string, any>, serverBaseUrl?: string) {
        return this.client.createUser(payload, serverBaseUrl)
    }

    private async updateExistingUser(existing: any, payload: Record<string, any>, serverBaseUrl?: string) {
        return this.client.updateUser(this.extractUserUuid(existing), payload, serverBaseUrl)
    }

    private async findUser(providerExternalId?: string, providerClientKey?: string, serverBaseUrl?: string) {
        if (providerExternalId) {
            try {
                return await this.client.getUser(providerExternalId, serverBaseUrl)
            } catch (error: any) {
                if (error instanceof RemnawaveRequestError && error.statusCode === 404) {
                    if (providerClientKey) {
                        this.logger.warn('event=find_user_fallback resultCode=UUID_NOT_FOUND')
                        return this.client.getUserByUsername(providerClientKey, serverBaseUrl)
                    }

                    return null
                }

                throw error
            }
        }

        if (providerClientKey) {
            return this.client.getUserByUsername(providerClientKey, serverBaseUrl)
        }

        return null
    }

    private async requireUser(providerExternalId?: string, providerClientKey?: string, serverBaseUrl?: string) {
        const user = await this.findUser(providerExternalId, providerClientKey, serverBaseUrl)
        if (!user) {
            throw new Error('Remnawave user was not found')
        }

        return user
    }

    private toProviderState(userResponse: any, fallbackUsername?: string, forcedActive?: boolean): ProviderAccessState {
        const user = this.unwrapUser(userResponse)
        const providerExternalId = user?.uuid || user?.id || user?.shortUuid
        const providerClientKey = user?.username || fallbackUsername
        const subscriptionUrl = this.extractSubscriptionUrl(user)
        const expiresAt = this.extractExpiresAt(user)
        const isActive =
            typeof forcedActive === 'boolean'
                ? forcedActive
                : !['DISABLED', 'DISABLE', 'LIMITED', 'EXPIRED'].includes(String(user?.status || '').toUpperCase()) &&
                  user?.isActive !== false &&
                  user?.enabled !== false

        return {
            providerType: this.type,
            providerExternalId,
            providerClientKey,
            subscriptionUrl,
            qrPayload: subscriptionUrl,
            configPayload: user || undefined,
            isActive,
            expiresAt,
            raw: userResponse,
        }
    }

    private extractUserUuid(userResponse: any) {
        const user = this.unwrapUser(userResponse)
        const uuid = user?.uuid || user?.id
        if (!uuid) {
            throw new Error('Remnawave user uuid is missing in provider response')
        }

        return String(uuid)
    }

    private async ensureUserWithUuid(userResponse: any, username?: string, serverBaseUrl?: string) {
        if (this.extractOptionalUuid(userResponse)) {
            return userResponse
        }

        if (username) {
            const resolved = await this.client.resolveUser(username, serverBaseUrl)
            if (this.extractOptionalUuid(resolved)) {
                return resolved
            }

            const byUsername = await this.client.getUserByUsername(username, serverBaseUrl)
            if (this.extractOptionalUuid(byUsername)) {
                return byUsername
            }
        }

        throw new Error('Remnawave user uuid is missing after create/update and fallbacks')
    }

    private async ensureInternalSquadMembership(userResponse: any, targetSquadUuids: string[], serverBaseUrl?: string) {
        if (!targetSquadUuids.length) {
            return userResponse
        }

        const userUuid = this.extractUserUuid(userResponse)
        const user = this.unwrapUser(userResponse)
        const activeSquadUuids = this.extractActiveSquadUuids(userResponse)
        const alreadyAssigned =
            activeSquadUuids.length === targetSquadUuids.length &&
            targetSquadUuids.every((uuid) => activeSquadUuids.includes(uuid))

        if (!alreadyAssigned) {
            await this.client.updateUserInternalSquads(userUuid, targetSquadUuids, serverBaseUrl)
        }

        return this.client.getUser(userUuid, serverBaseUrl)
    }

    private resolveTargetSquads(userResponse: any): string[] {
        const tariffSquadUuid = String(this.configService.get<string>('REMNAWAVE_DEFAULT_SQUAD_UUID') || '').trim()
        const preservedAllowlist = String(
            this.configService.get<string>('REMNAWAVE_PRESERVED_INTERNAL_SQUAD_UUIDS') || '',
        )
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        return resolveTargetInternalSquadUuids({
            tariffSquadUuids: tariffSquadUuid ? [tariffSquadUuid] : [],
            currentSquadUuids: this.extractActiveSquadUuids(userResponse),
            preservedAllowlist,
        })
    }

    private extractActiveSquadUuids(userResponse: any): string[] {
        const user = this.unwrapUser(userResponse)
        const squads = Array.isArray(user?.activeInternalSquads) ? user.activeInternalSquads : []
        const uuids = squads
            .map((squad: any) => String(squad?.uuid || squad || '').trim())
            .filter((uuid: string) => Boolean(uuid))
        return [...new Set<string>(uuids)]
    }

    private extractOptionalUuid(userResponse: any) {
        const user = this.unwrapUser(userResponse)
        return user?.uuid || user?.id || null
    }

    private unwrapUser(userResponse: any) {
        return (
            userResponse?.response?.user ||
            userResponse?.response?.users?.[0] ||
            userResponse?.response ||
            userResponse?.user ||
            userResponse?.users?.[0] ||
            userResponse?.data?.user ||
            userResponse?.data?.users?.[0] ||
            userResponse?.data ||
            userResponse
        )
    }

    private extractSubscriptionUrl(user: any) {
        const publicBaseUrl = (this.configService.get<string>('REMNAWAVE_SUBSCRIPTION_PUBLIC_BASE_URL') || '').replace(
            /\/$/,
            '',
        )
        const shortUuid = user?.shortUuid || user?.short_uuid
        if (publicBaseUrl && shortUuid) {
            return `${publicBaseUrl}/${shortUuid}`
        }

        const direct =
            user?.subscriptionUrl ||
            user?.subscription_url ||
            user?.subUrl ||
            user?.sub_url ||
            user?.links?.subscription ||
            user?.subscription?.url

        if (direct) {
            return String(direct)
        }

        return undefined
    }

    private extractExpiresAt(user: any) {
        const raw = user?.expireAt || user?.expiresAt || user?.expiredAt
        return raw ? new Date(raw) : undefined
    }
}
