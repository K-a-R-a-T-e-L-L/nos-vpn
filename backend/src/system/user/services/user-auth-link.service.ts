import { createHash, randomBytes } from 'crypto'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { parse } from '@tma.js/init-data-node'
import * as bcrypt from 'bcryptjs'
import { MoreThan, Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { UserProvisioningService } from './user-provisioning.service'
import { TelegramProfileInput, TemporaryWebCredentials } from './user-service.types'
import { BOT_CALLBACK } from '../../../bot/bot.constants'
import { tgEmoji } from '../../../bot/custom-emoji.registry'
import { NotificationService } from '../../../notification/notification.service'
import { UserAuthDto } from '../dto/user-auth.dto'
import { TelegramAuthRequest } from '../entity/telegram-auth-request.entity'
import { TelegramSiteLinkRequest } from '../entity/telegram-site-link-request.entity'
import { User } from '../entity/user.entity'
import { RolesEnum } from '../enum/roles.enum'


const TELEGRAM_LINK_TOKEN_PREFIX = 'link_'
const TELEGRAM_LINK_TTL_MINUTES = 15
const TELEGRAM_AUTH_TOKEN_PREFIX = 'auth_'
const TELEGRAM_AUTH_TTL_MINUTES = 10
const TELEGRAM_SITE_LINK_CODE_TTL_MINUTES = 15

@Injectable()
export class UserAuthLinkService {
    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @InjectRepository(TelegramAuthRequest)
        private readonly telegramAuthRequestRepository: Repository<TelegramAuthRequest>,
        @InjectRepository(TelegramSiteLinkRequest)
        private readonly telegramSiteLinkRequestRepository: Repository<TelegramSiteLinkRequest>,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly notificationService: NotificationService,
        private readonly provisioningService: UserProvisioningService,
    ) {}

    generateRefreshToken(user: User) {
        return this.jwtService.sign(
            { sub: user.id, role: user.role },
            {
                expiresIn: this.configService.get('JWT_REFRESH_EXPIRES'),
                secret: this.configService.get('JWT_REFRESH_SECRET'),
            },
        )
    }

    generateAccessToken(user: User) {
        return this.jwtService.sign(
            { sub: user.id, role: user.role },
            {
                expiresIn: this.configService.get('JWT_ACCESS_EXPIRES'),
                secret: this.configService.get('JWT_ACCESS_SECRET'),
            },
        )
    }

    generateTokenPair(user: User) {
        return {
            accessToken: this.generateAccessToken(user),
            refreshToken: this.generateRefreshToken(user),
        }
    }

    async authenticate(rawInitData: string) {
        let user: User | null = null
        let isNewUser = false
        let temporaryCredentials: TemporaryWebCredentials | undefined
        let initData
        const adminIds = (this.configService.get('TELEGRAM_ADMIN_IDS') || '')
            .split(',')
            .map((id: string) => id.trim())
            .filter(Boolean)

        if (rawInitData.startsWith('qqq')) {
            if (this.configService.get<string>('NODE_ENV') === 'production') {
                throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Development auth bypass is disabled in production')
            }

            const fallbackTelegramId = Number(adminIds[0] || '999000')
            user = await this.provisioningService.getUserByTelegramId(fallbackTelegramId)

            if (!user) {
                const provisioned = await this.provisioningService.ensureTelegramUserWithMetadata({
                    id: fallbackTelegramId,
                    username: 'dev_user',
                    first_name: 'Dev',
                    last_name: 'Local',
                    is_premium: false,
                    language_code: 'ru',
                })
                user = provisioned.user
                isNewUser = provisioned.isNewUser
                temporaryCredentials = provisioned.temporaryCredentials
            }
        } else {
            initData = parse(rawInitData)

            user = await this.provisioningService.getUserByTelegramId(initData.user.id)
        }

        if (user) {
            this.provisioningService.assertUserIsNotBlocked(user)
            let needUpdate = false
            if (!user.referralCode) {
                user.referralCode = await this.provisioningService.generateUniqueReferralCode(user.telegramId)
                needUpdate = true
            }

            if (initData) {
                if (user.telegramUsername !== initData.user.username) {
                    needUpdate = true
                    user.telegramUsername = initData.user.username
                }

                if (user.telegramLanguageCode !== initData.user.language_code) {
                    needUpdate = true
                    user.telegramLanguageCode = initData.user.language_code
                }

                if (user.telegramIsPremium !== initData.user.is_premium) {
                    needUpdate = true
                    user.telegramIsPremium = initData.user.is_premium
                }

                if (user.telegramFirstName !== initData.user.first_name) {
                    needUpdate = true
                    user.telegramFirstName = initData.user.first_name
                }

                if (user.telegramLastName !== initData.user.last_name) {
                    needUpdate = true
                    user.telegramLastName = initData.user.last_name
                }
            }

            if (adminIds.includes(String(user.telegramId)) && user.role !== RolesEnum.ADMIN) {
                user.role = RolesEnum.ADMIN
                needUpdate = true
            }

            if (needUpdate) {
                await this.userRepository.save(user)
            }

            const provisioned = await this.provisioningService.ensureTelegramUserWithMetadata({
                id: user.telegramId!,
                username: user.telegramUsername,
                first_name: user.telegramFirstName,
                last_name: user.telegramLastName,
                is_premium: user.telegramIsPremium,
                language_code: user.telegramLanguageCode,
            })

            return {
                accessToken: this.generateAccessToken(provisioned.user),
                refreshToken: this.generateRefreshToken(provisioned.user),
                isNewUser: false,
                temporaryCredentials: provisioned.temporaryCredentials || temporaryCredentials,
            }
        }

        const provisioned = await this.provisioningService.ensureTelegramUserWithMetadata({
            id: initData.user.id,
            username: initData.user.username,
            first_name: initData.user.first_name,
            last_name: initData.user.last_name,
            is_premium: initData.user.is_premium,
            language_code: initData.user.language_code,
        })
        const { accessToken, refreshToken } = this.generateTokenPair(provisioned.user)

        await this.jwtService.verify(refreshToken, {
            secret: this.configService.get('JWT_REFRESH_SECRET'),
        })

        return {
            refreshToken,
            accessToken,
            isNewUser: provisioned.isNewUser,
            temporaryCredentials: provisioned.temporaryCredentials,
        }
    }

    async registerByEmail(dto: UserAuthDto) {
        const email = this.normalizeEmail(dto.email)
        const existing = await this.userRepository.findOne({ where: { email } })
        if (existing) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Email is already registered')
        }

        const user = await this.userRepository.save({
            email,
            passwordHash: await bcrypt.hash(dto.password, 10),
            role: RolesEnum.USER,
            referralCode: await this.provisioningService.generateUniqueReferralCode(email),
        })

        return {
            ...this.generateTokenPair(user),
            isNewUser: true,
        }
    }

    async loginByEmail(dto: UserAuthDto) {
        const email = this.normalizeEmail(dto.email)
        const user = await this.userRepository
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .leftJoinAndSelect('user.subscription', 'subscription')
            .where('user.email = :email', { email })
            .getOne()
        if (!user) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Email is not registered')
        }
        this.provisioningService.assertUserIsNotBlocked(user)

        if (!user.passwordHash) {
            throw new ErrorDto(ErrorCodeEnum.AUTH_FAIL, 'Invalid email or password')
        }

        const passwordOk = await bcrypt.compare(dto.password, user.passwordHash)
        if (!passwordOk) {
            throw new ErrorDto(ErrorCodeEnum.AUTH_FAIL, 'Invalid email or password')
        }

        return {
            ...this.generateTokenPair(user),
            isNewUser: false,
        }
    }

    async attachEmailPassword(userId: string, dto: UserAuthDto) {
        const email = this.normalizeEmail(dto.email)
        const user = await this.userRepository.findOne({ where: { id: userId }, relations: { subscription: true } })
        if (!user) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
        }

        const existing = await this.userRepository.findOne({ where: { email } })
        if (existing && existing.id !== user.id) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Email is already registered')
        }

        user.email = email
        user.passwordHash = await bcrypt.hash(dto.password, 10)
        user.hasTemporaryWebCredentials = false
        user.emailVerifiedAt = user.emailVerifiedAt || new Date()
        const savedUser = await this.userRepository.save(user)
        await this.provisioningService.syncActiveAccessContacts(savedUser)
        return savedUser
    }

    async createTelegramLink(userId: string) {
        const user = await this.userRepository.findOne({ where: { id: userId } })
        if (!user) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
        }

        const token = randomBytes(24).toString('base64url')
        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + TELEGRAM_LINK_TTL_MINUTES)

        user.telegramLinkTokenHash = this.hashToken(token)
        user.telegramLinkTokenExpiresAt = expiresAt
        await this.userRepository.save(user)

        return {
            linkUrl: `${this.getTelegramBotStartUrl()}${TELEGRAM_LINK_TOKEN_PREFIX}${token}`,
            expiresAt,
        }
    }

    async createTelegramAuthLink() {
        const requestToken = randomBytes(24).toString('base64url')
        const botToken = randomBytes(24).toString('base64url')
        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + TELEGRAM_AUTH_TTL_MINUTES)

        await this.telegramAuthRequestRepository.save({
            requestTokenHash: this.hashToken(requestToken),
            botTokenHash: this.hashToken(botToken),
            expiresAt,
        })

        return {
            requestToken,
            linkUrl: `${this.getTelegramBotStartUrl()}${TELEGRAM_AUTH_TOKEN_PREFIX}${botToken}`,
            expiresAt,
        }
    }

    async confirmTelegramAuthByStartPayload(payload: string, telegramUser: TelegramProfileInput) {
        const token = payload.startsWith(TELEGRAM_AUTH_TOKEN_PREFIX)
            ? payload.slice(TELEGRAM_AUTH_TOKEN_PREFIX.length)
            : ''
        if (!token) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Telegram auth token is invalid')
        }

        const request = await this.telegramAuthRequestRepository.findOne({
            where: {
                botTokenHash: this.hashToken(token),
                expiresAt: MoreThan(new Date()),
            },
        })
        if (!request || request.consumedAt) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Telegram auth token is expired')
        }

        const provisioned = await this.provisioningService.ensureTelegramUserWithMetadata(telegramUser)
        request.userId = provisioned.user.id
        request.confirmedAt = new Date()
        await this.telegramAuthRequestRepository.save(request)
        return provisioned
    }

    async completeTelegramAuth(requestToken: string) {
        const request = await this.telegramAuthRequestRepository.findOne({
            where: {
                requestTokenHash: this.hashToken(requestToken),
            },
            relations: { user: true },
        })

        if (!request) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Telegram auth request not found')
        }

        if (request.consumedAt) {
            throw new ErrorDto(ErrorCodeEnum.AUTH_FAIL, 'Telegram auth request is already used')
        }

        if (request.expiresAt <= new Date()) {
            throw new ErrorDto(ErrorCodeEnum.AUTH_FAIL, 'Telegram auth request is expired')
        }

        if (!request.confirmedAt || !request.user) {
            return {
                status: 'pending' as const,
            }
        }

        request.consumedAt = new Date()
        await this.telegramAuthRequestRepository.save(request)

        return {
            status: 'confirmed' as const,
            ...this.generateTokenPair(request.user),
            isNewUser: false,
        }
    }

    async linkTelegramByStartPayload(payload: string, telegramUser: TelegramProfileInput) {
        const token = payload.startsWith(TELEGRAM_LINK_TOKEN_PREFIX)
            ? payload.slice(TELEGRAM_LINK_TOKEN_PREFIX.length)
            : ''
        if (!token) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Telegram link token is invalid')
        }

        const targetUser = await this.userRepository.findOne({
            where: {
                telegramLinkTokenHash: this.hashToken(token),
                telegramLinkTokenExpiresAt: MoreThan(new Date()),
            },
            relations: { subscription: true },
        })
        if (!targetUser) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Telegram link token is expired')
        }
        this.provisioningService.assertUserIsNotBlocked(targetUser)

        const currentTelegramOwner = await this.userRepository.findOne({
            where: { telegramId: telegramUser.id },
            relations: { subscription: true },
        })

        if (currentTelegramOwner && currentTelegramOwner.id !== targetUser.id) {
            throw new ErrorDto(
                ErrorCodeEnum.FORBIDDEN,
                'This Telegram account is already linked to another user. Contact support to merge accounts.',
            )
        }

        this.provisioningService.applyTelegramProfile(targetUser, telegramUser)
        this.provisioningService.applyAdminRoleIfTelegramAdmin(targetUser)
        targetUser.telegramLinkedAt = new Date()
        targetUser.telegramLinkTokenHash = null
        targetUser.telegramLinkTokenExpiresAt = null
        if (!targetUser.referralCode) {
            targetUser.referralCode = await this.provisioningService.generateUniqueReferralCode(String(telegramUser.id))
        }

        const savedUser = await this.userRepository.save(targetUser)
        await this.provisioningService.syncActiveAccessContacts(savedUser)
        return savedUser
    }

    async createTelegramSiteLinkCode(telegramUser: TelegramProfileInput) {
        const existingUser = await this.provisioningService.getUserByTelegramId(telegramUser.id)
        if (existingUser) {
            this.provisioningService.assertUserIsNotBlocked(existingUser)
            throw new ErrorDto(
                ErrorCodeEnum.FORBIDDEN,
                'This Telegram account is already linked to a NOS VPN account. Use that account on the site or contact support.',
            )
        }

        const code = await this.generateUniqueTelegramSiteLinkCode()
        const expiresAt = new Date()
        expiresAt.setMinutes(expiresAt.getMinutes() + TELEGRAM_SITE_LINK_CODE_TTL_MINUTES)

        await this.telegramSiteLinkRequestRepository.save({
            codeHash: this.hashToken(code),
            telegramId: telegramUser.id,
            telegramUsername: telegramUser.username,
            telegramFirstName: telegramUser.first_name || 'User',
            telegramLastName: telegramUser.last_name,
            telegramIsPremium: telegramUser.is_premium,
            telegramLanguageCode: telegramUser.language_code,
            expiresAt,
        })

        return { code, expiresAt }
    }

    async consumeTelegramSiteLinkCode(userId: string, rawCode: string) {
        const code = this.normalizeTelegramSiteLinkCode(rawCode)
        if (!code) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Telegram link code is invalid')
        }

        const request = await this.telegramSiteLinkRequestRepository.findOne({
            where: {
                codeHash: this.hashToken(code),
                expiresAt: MoreThan(new Date()),
            },
        })
        if (!request || request.consumedAt) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN, 'Telegram link code is expired')
        }

        const targetUser = await this.userRepository.findOne({
            where: { id: userId },
            relations: { subscription: true },
        })
        if (!targetUser) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'User not found')
        }
        this.provisioningService.assertUserIsNotBlocked(targetUser)

        if (targetUser.telegramId && targetUser.telegramId !== request.telegramId) {
            throw new ErrorDto(
                ErrorCodeEnum.FORBIDDEN,
                'Another Telegram account is already linked to this NOS VPN account. Unlinking requires support.',
            )
        }

        const currentTelegramOwner = await this.userRepository.findOne({
            where: { telegramId: request.telegramId },
            relations: { subscription: true },
        })
        if (currentTelegramOwner && currentTelegramOwner.id !== targetUser.id) {
            throw new ErrorDto(
                ErrorCodeEnum.FORBIDDEN,
                'This Telegram account is already linked to another user. Contact support to merge accounts.',
            )
        }

        this.provisioningService.applyTelegramProfile(targetUser, {
            id: request.telegramId,
            username: request.telegramUsername,
            first_name: request.telegramFirstName,
            last_name: request.telegramLastName,
            is_premium: request.telegramIsPremium,
            language_code: request.telegramLanguageCode,
        })
        this.provisioningService.applyAdminRoleIfTelegramAdmin(targetUser)
        targetUser.telegramLinkedAt = targetUser.telegramLinkedAt || new Date()
        targetUser.telegramLinkTokenHash = null
        targetUser.telegramLinkTokenExpiresAt = null
        if (!targetUser.referralCode) {
            targetUser.referralCode = await this.provisioningService.generateUniqueReferralCode(request.telegramId)
        }

        const savedUser = await this.userRepository.save(targetUser)
        await this.provisioningService.syncActiveAccessContacts(savedUser)

        request.consumedAt = new Date()
        request.linkedUserId = savedUser.id
        await this.telegramSiteLinkRequestRepository.save(request)

        await this.notificationService
            .notify(
                request.telegramId,
                [
                    `${tgEmoji('MENU_BUTTON_GET_ACCESS')} <b>Telegram привязан</b>`,
                    'Теперь сайт и бот работают как один аккаунт NOS VPN.',
                    'Нажмите кнопку ниже, чтобы перейти к выгодным тарифам, стабильным серверам и полному управлению подпиской.',
                ].join('\n\n'),
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: 'Продолжить',
                                    callback_data: BOT_CALLBACK.TELEGRAM_LINK_CONTINUE,
                                },
                            ],
                        ],
                    },
                },
            )
            .catch(() => null)

        return savedUser
    }

    async getUserFromToken(token: string, refreshToken: boolean) {
        const verify = this.jwtService.verify(token, {
            secret: this.configService.get(refreshToken ? 'JWT_REFRESH_SECRET' : 'JWT_ACCESS_SECRET'),
        })

        if (!verify) {
            throw new ErrorDto(ErrorCodeEnum.FORBIDDEN)
        }

        const user = await this.userRepository.findOneBy({ id: verify.sub })

        if (!user) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND)
        }
        this.provisioningService.assertUserIsNotBlocked(user)

        if (this.provisioningService.applyAdminRoleIfTelegramAdmin(user)) {
            return this.userRepository.save(user)
        }

        return user
    }

    async refreshAccessToken(refreshToken: string) {
        const user = await this.getUserFromToken(refreshToken, true)

        return this.generateTokenPair(user)
    }

    private normalizeEmail(email: string) {
        return String(email || '')
            .trim()
            .toLowerCase()
    }

    private normalizeTelegramSiteLinkCode(code: string) {
        return String(code || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
    }

    private hashToken(token: string) {
        return createHash('sha256').update(token).digest('hex')
    }

    private async generateUniqueTelegramSiteLinkCode() {
        while (true) {
            const code = this.normalizeTelegramSiteLinkCode(randomBytes(4).toString('hex'))
            const existing = await this.telegramSiteLinkRequestRepository.findOne({
                where: { codeHash: this.hashToken(code) },
                withDeleted: true,
            })
            if (!existing) {
                return code
            }
        }
    }

    private getTelegramBotStartUrl() {
        const configured = String(this.configService.get<string>('TELEGRAM_BOT_START_URL') || '').trim()
        if (configured) {
            return configured.replace(/\?start=.*$/, '').replace(/\/$/, '') + '?start='
        }

        const username = String(this.configService.get<string>('TELEGRAM_BOT_USERNAME') || '')
            .trim()
            .replace(/^@/, '')
        if (!username) {
            throw new ErrorDto(
                ErrorCodeEnum.ENTITY_CREATION_FAIL,
                'TELEGRAM_BOT_USERNAME or TELEGRAM_BOT_START_URL is not configured',
            )
        }

        return `https://t.me/${username}?start=`
    }
}
