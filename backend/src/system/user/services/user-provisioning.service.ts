import { randomBytes } from 'crypto'

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import * as bcrypt from 'bcryptjs'
import { Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { TelegramProfileInput, TelegramUserProvisionResult, TemporaryWebCredentials } from './user-service.types'
import { VpnAccessService } from '../../../vpn-access/services/vpn-access.service'
import { RemnawaveProviderAdapter } from '../../../vpn-provider/adapters/remnawave-provider.adapter'
import { VpnProviderTypeEnum } from '../../../vpn-provider/enum/vpn-provider-type.enum'
import { ServerNodeResolverService } from '../../../vpn-provider/services/server-node-resolver.service'
import { User } from '../entity/user.entity'
import { RolesEnum } from '../enum/roles.enum'


@Injectable()
export class UserProvisioningService {
    private readonly logger = new Logger('UserService')
    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        private readonly configService: ConfigService,
        private readonly vpnAccessService: VpnAccessService,
        private readonly remnawaveProvider: RemnawaveProviderAdapter,
        private readonly serverNodeResolver: ServerNodeResolverService,
    ) {}

    async getUserByTelegramId(telegramId: number) {
        return await this.userRepository.findOne({
            where: {
                telegramId: telegramId,
            },
            relations: {
                subscription: true,
            },
        })
    }

    async ensureTelegramUser(telegramUser: TelegramProfileInput) {
        return (await this.ensureTelegramUserWithMetadata(telegramUser)).user
    }

    async ensureTelegramUserWithMetadata(telegramUser: TelegramProfileInput): Promise<TelegramUserProvisionResult> {
        let user = await this.getUserByTelegramId(telegramUser.id)
        if (user) {
            this.assertUserIsNotBlocked(user)
            let needUpdate = false
            let temporaryCredentials: TemporaryWebCredentials | undefined
            if (user.telegramUsername !== telegramUser.username) {
                user.telegramUsername = telegramUser.username
                needUpdate = true
            }
            if (user.telegramFirstName !== (telegramUser.first_name || user.telegramFirstName)) {
                user.telegramFirstName = telegramUser.first_name || user.telegramFirstName
                needUpdate = true
            }
            if (user.telegramLastName !== telegramUser.last_name) {
                user.telegramLastName = telegramUser.last_name
                needUpdate = true
            }
            if (user.telegramIsPremium !== telegramUser.is_premium) {
                user.telegramIsPremium = telegramUser.is_premium
                needUpdate = true
            }
            if (user.telegramLanguageCode !== telegramUser.language_code) {
                user.telegramLanguageCode = telegramUser.language_code
                needUpdate = true
            }
            if (!user.referralCode) {
                user.referralCode = await this.generateUniqueReferralCode(user.telegramId)
                needUpdate = true
            }
            if (!user.telegramLinkedAt) {
                user.telegramLinkedAt = new Date()
                needUpdate = true
            }
            if (!user.email && !user.hasTemporaryWebCredentials) {
                temporaryCredentials = await this.assignTemporaryWebCredentials(user, telegramUser.id)
                needUpdate = true
            }
            if (this.applyAdminRoleIfTelegramAdmin(user)) {
                needUpdate = true
            }
            if (needUpdate) {
                user = await this.userRepository.save(user)
            }
            return {
                user,
                isNewUser: false,
                temporaryCredentials,
            }
        }

        const newUser = this.userRepository.create({
            telegramId: telegramUser.id,
            telegramUsername: telegramUser.username,
            telegramFirstName: telegramUser.first_name || 'User',
            telegramLastName: telegramUser.last_name,
            telegramIsPremium: telegramUser.is_premium,
            telegramLanguageCode: telegramUser.language_code,
            telegramLinkedAt: new Date(),
            referralCode: await this.generateUniqueReferralCode(telegramUser.id),
            role: this.isTelegramAdmin(telegramUser.id) ? RolesEnum.ADMIN : RolesEnum.USER,
        })
        const temporaryCredentials = await this.assignTemporaryWebCredentials(newUser, telegramUser.id)
        const savedUser = await this.userRepository.save(newUser)
        return {
            user: savedUser,
            isNewUser: true,
            temporaryCredentials,
        }
    }

    private generateReferralCode(seed: string | number) {
        const raw = String(seed || randomBytes(6).toString('hex')).toLowerCase()
        const normalized = raw.replace(/[^a-z0-9]/g, '')
        return `ref_${(normalized || randomBytes(6).toString('hex')).slice(0, 16)}`
    }

    async generateUniqueReferralCode(seed: string | number) {
        const base = this.generateReferralCode(seed)
        let code = base
        let attempt = 0

        while (await this.userRepository.findOne({ where: { referralCode: code }, withDeleted: true })) {
            attempt += 1
            code = `${base}_${attempt.toString(36)}`
        }

        return code
    }

    applyTelegramProfile(user: User, telegramUser: TelegramProfileInput) {
        user.telegramId = telegramUser.id
        user.telegramUsername = telegramUser.username
        user.telegramFirstName = telegramUser.first_name || user.telegramFirstName || 'User'
        user.telegramLastName = telegramUser.last_name
        user.telegramIsPremium = telegramUser.is_premium
        user.telegramLanguageCode = telegramUser.language_code
    }

    applyAdminRoleIfTelegramAdmin(user: User) {
        if (this.isTelegramAdmin(user.telegramId) && user.role !== RolesEnum.ADMIN) {
            user.role = RolesEnum.ADMIN
            return true
        }

        return false
    }

    private isTelegramAdmin(telegramId?: number | string | null) {
        if (!telegramId) {
            return false
        }

        return (this.configService.get('TELEGRAM_ADMIN_IDS') || '')
            .split(',')
            .map((id: string) => id.trim())
            .filter(Boolean)
            .includes(String(telegramId))
    }

    assertUserIsNotBlocked(user: User) {
        if (user.isBlocked) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'User is blocked')
        }
    }

    async syncActiveAccessContacts(user: User) {
        if (!user?.subscription?.id) {
            return
        }

        const access = await this.vpnAccessService.findActiveBySubscription(user.subscription.id)
        if (!access) {
            return
        }

        if (!user.telegramId && !user.email) {
            return
        }

        try {
            const node = await this.serverNodeResolver.resolveNode(VpnProviderTypeEnum.REMNAWAVE, access.serverNodeId)
            await this.remnawaveProvider.updateUserContacts({
                providerExternalId: access.providerExternalId,
                providerClientKey: access.providerClientKey,
                telegramId: user.telegramId,
                email: user.email,
                serverBaseUrl: node.baseUrl,
            })
        } catch (error: any) {
            this.logger.warn(
                `Failed to sync Remnawave contact fields for user=${user.id} subscription=${user.subscription.id}: ${error?.message || 'unknown error'}`,
            )
        }
    }

    private buildTemporaryWebLogin(telegramId: number) {
        return `tg_${telegramId}@telegram.local`
    }

    private async assignTemporaryWebCredentials(user: User, telegramId: number) {
        const password = randomBytes(24).toString('base64url')
        user.email = this.buildTemporaryWebLogin(telegramId)
        user.passwordHash = await bcrypt.hash(password, 10)
        user.hasTemporaryWebCredentials = true
        user.emailVerifiedAt = null
        return {
            login: user.email,
            password,
        }
    }
}
