import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindManyOptions, FindOneOptions, Repository } from 'typeorm'


import { UserAdminService } from './user-admin.service'
import { UserAuthLinkService } from './user-auth-link.service'
import { UserDeleteService } from './user-delete.service'
import { UserProvisioningService } from './user-provisioning.service'
import { TelegramProfileInput, TelegramUserProvisionResult } from './user-service.types'
import { AdminUserQueryDto } from '../dto/admin-user-query.dto'
import { CreateUserDto } from '../dto/create-user.dto'
import { UserAuthDto } from '../dto/user-auth.dto'
import { User } from '../entity/user.entity'

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        private readonly authLinkService: UserAuthLinkService,
        private readonly provisioningService: UserProvisioningService,
        private readonly adminService: UserAdminService,
        private readonly deleteService: UserDeleteService,
    ) {}

    generateRefreshToken(user: User) {
        return this.authLinkService.generateRefreshToken(user)
    }

    generateAccessToken(user: User) {
        return this.authLinkService.generateAccessToken(user)
    }

    generateTokenPair(user: User) {
        return this.authLinkService.generateTokenPair(user)
    }

    async authenticate(rawInitData: string) {
        return this.authLinkService.authenticate(rawInitData)
    }

    async registerByEmail(dto: UserAuthDto) {
        return this.authLinkService.registerByEmail(dto)
    }

    async loginByEmail(dto: UserAuthDto) {
        return this.authLinkService.loginByEmail(dto)
    }

    async attachEmailPassword(userId: string, dto: UserAuthDto) {
        return this.authLinkService.attachEmailPassword(userId, dto)
    }

    async createTelegramLink(userId: string) {
        return this.authLinkService.createTelegramLink(userId)
    }

    async createTelegramAuthLink() {
        return this.authLinkService.createTelegramAuthLink()
    }

    async confirmTelegramAuthByStartPayload(payload: string, telegramUser: TelegramProfileInput) {
        return this.authLinkService.confirmTelegramAuthByStartPayload(payload, telegramUser)
    }

    async completeTelegramAuth(requestToken: string) {
        return this.authLinkService.completeTelegramAuth(requestToken)
    }

    async linkTelegramByStartPayload(payload: string, telegramUser: TelegramProfileInput) {
        return this.authLinkService.linkTelegramByStartPayload(payload, telegramUser)
    }

    async createTelegramSiteLinkCode(telegramUser: TelegramProfileInput) {
        return this.authLinkService.createTelegramSiteLinkCode(telegramUser)
    }

    async consumeTelegramSiteLinkCode(userId: string, rawCode: string) {
        return this.authLinkService.consumeTelegramSiteLinkCode(userId, rawCode)
    }

    async create(user: CreateUserDto) {
        return await this.userRepository.save(user)
    }

    async getUserFromToken(token: string, refreshToken: boolean) {
        return this.authLinkService.getUserFromToken(token, refreshToken)
    }

    async getUserByTelegramId(telegramId: number) {
        return this.provisioningService.getUserByTelegramId(telegramId)
    }

    async ensureTelegramUser(telegramUser: TelegramProfileInput) {
        return this.provisioningService.ensureTelegramUser(telegramUser)
    }

    async ensureTelegramUserWithMetadata(telegramUser: TelegramProfileInput): Promise<TelegramUserProvisionResult> {
        return this.provisioningService.ensureTelegramUserWithMetadata(telegramUser)
    }

    async find(options?: FindManyOptions<User>) {
        return this.userRepository.find(options)
    }

    async findBroadcastRecipients() {
        return this.adminService.findBroadcastRecipients()
    }

    async findAdminUsers(search?: string, page = 1, pageSize = 25) {
        return this.adminService.findAdminUsers(search, page, pageSize)
    }

    async queryAdminUsers(dto: AdminUserQueryDto) {
        return this.adminService.queryAdminUsers(dto)
    }

    async getAdminUserDetails(userId: string, paymentPage = 1, paymentPageSize = 25) {
        return this.adminService.getAdminUserDetails(userId, paymentPage, paymentPageSize)
    }

    async findOne(options: FindOneOptions<User>) {
        return this.userRepository.findOne(options)
    }

    async updateReferralWalletBalance(userId: string, balanceRub: number) {
        return this.adminService.updateReferralWalletBalance(userId, balanceRub)
    }

    async setBlocked(userId: string, isBlocked: boolean) {
        return this.adminService.setBlocked(userId, isBlocked)
    }

    async permanentlyDeleteUser(userId: string, actorUserId: string) {
        return this.deleteService.permanentlyDeleteUser(userId, actorUserId)
    }

    async refreshAccessToken(refreshToken: string) {
        return this.authLinkService.refreshAccessToken(refreshToken)
    }

    async getAdminSummary() {
        return this.adminService.getAdminSummary()
    }
}
