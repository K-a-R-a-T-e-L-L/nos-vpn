import { isIP } from 'node:net'

import { Body, Controller, Req, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Request } from 'express'

import { UserAuthType } from '@common/decorators/auth.helpers'
import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'
import { UserDockGetOne, UserDockPost } from '@common/swagger/user.swagger.helper'

import { UserDecorator } from '../decorators/user.decorator'
import { EmailAuthResponseDto } from '../dto/email-auth-response.dto'
import { RefreshResponseDto } from '../dto/refresh-response.dto'
import { TelegramAuthLinkResponseDto } from '../dto/telegram-auth-link-response.dto'
import { TelegramAuthStatusResponseDto } from '../dto/telegram-auth-status-response.dto'
import { TelegramAuthStatusDto } from '../dto/telegram-auth-status.dto'
import { TelegramLinkResponseDto } from '../dto/telegram-link-response.dto'
import { TelegramSiteLinkCodeDto } from '../dto/telegram-site-link-code.dto'
import { TgAuthResponseDto } from '../dto/tg-auth-response.dto'
import { TgAuthDto } from '../dto/tg-auth.dto'
import { UserAuthDto } from '../dto/user-auth.dto'
import { User } from '../entity/user.entity'
import { UserService } from '../services/user.service'



@Controller('user')
@ApiTags('User')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @UserDockPost('tg-auth', UserAuthType.NOT_AUTH, TgAuthDto, TgAuthResponseDto)
    async authenticate(@Res({ passthrough: true }) response: any, @Body() tgAuth: TgAuthDto) {
        const { isNewUser, refreshToken, accessToken } = await this.userService.authenticate(tgAuth.rawInitData)
        this.setRefreshCookie(response, refreshToken)
        return { accessToken, isNewUser }
    }

    @UserDockPost('register', UserAuthType.NOT_AUTH, UserAuthDto, EmailAuthResponseDto)
    async register(@Res({ passthrough: true }) response: any, @Body() dto: UserAuthDto) {
        const { isNewUser, refreshToken, accessToken } = await this.userService.registerByEmail(dto)
        this.setRefreshCookie(response, refreshToken)
        return { accessToken, isNewUser }
    }

    @UserDockPost('login', UserAuthType.NOT_AUTH, UserAuthDto, EmailAuthResponseDto)
    async login(@Res({ passthrough: true }) response: any, @Body() dto: UserAuthDto) {
        const { isNewUser, refreshToken, accessToken } = await this.userService.loginByEmail(dto)
        this.setRefreshCookie(response, refreshToken)
        return { accessToken, isNewUser }
    }

    @UserDockPost('refresh', UserAuthType.NOT_AUTH, null, RefreshResponseDto)
    async refreshAccessToken(@Req() request: Request, @Res({ passthrough: true }) response: any) {
        const refreshToken = request.cookies?.['refresh_token']
        if (!refreshToken) {
            this.clearRefreshCookie(response)
            throw new ErrorDto(ErrorCodeEnum.AUTH_FAIL, 'Refresh token is required')
        }

        try {
            const tokenPair = await this.userService.refreshAccessToken(refreshToken)
            this.setRefreshCookie(response, tokenPair.refreshToken)
            return tokenPair
        } catch (error) {
            this.clearRefreshCookie(response)
            throw error
        }
    }

    @UserDockPost('logout', UserAuthType.NOT_AUTH, null, null)
    async logout(@Res({ passthrough: true }) response: any) {
        this.clearRefreshCookie(response)
        return { ok: true }
    }

    @UserDockPost('telegram-auth-link', UserAuthType.NOT_AUTH, null, TelegramAuthLinkResponseDto)
    async createTelegramAuthLink() {
        return this.userService.createTelegramAuthLink()
    }

    @UserDockPost('telegram-auth-status', UserAuthType.NOT_AUTH, TelegramAuthStatusDto, TelegramAuthStatusResponseDto)
    async completeTelegramAuth(
        @Res({ passthrough: true }) response: any,
        @Body() dto: TelegramAuthStatusDto,
    ) {
        const result = await this.userService.completeTelegramAuth(dto.requestToken)
        if (result.status === 'confirmed') {
            this.setRefreshCookie(response, result.refreshToken)
            return {
                status: result.status,
                accessToken: result.accessToken,
                isNewUser: result.isNewUser,
            }
        }

        return result
    }

    @UserDockGetOne('', UserAuthType.USER, User)
    async get(@UserDecorator() user: User) {
        return this.userService.findOne({ where: { id: user.id }, relations: { subscription: true } })
    }

    @UserDockPost('email-password', UserAuthType.USER, UserAuthDto, User)
    async attachEmailPassword(@UserDecorator() user: User, @Body() dto: UserAuthDto) {
        return this.userService.attachEmailPassword(user.id, dto)
    }

    @UserDockPost('telegram-link', UserAuthType.USER, null, TelegramLinkResponseDto)
    async createTelegramLink(@UserDecorator() user: User) {
        return this.userService.createTelegramLink(user.id)
    }

    @UserDockPost('telegram-link-code/consume', UserAuthType.USER, TelegramSiteLinkCodeDto, User)
    async consumeTelegramLinkCode(@UserDecorator() user: User, @Body() dto: TelegramSiteLinkCodeDto) {
        return this.userService.consumeTelegramSiteLinkCode(user.id, dto.code)
    }

    private setRefreshCookie(response: any, refreshToken: string) {
        response.cookie('refresh_token', refreshToken, {
            ...this.getRefreshCookieOptions(),
            maxAge: 1000 * 60 * 60 * 24 * 30,
        })
    }

    private clearRefreshCookie(response: any) {
        response.clearCookie('refresh_token', this.getRefreshCookieOptions())
    }

    private getRefreshCookieOptions() {
        const frontendOrigin = String(process.env.FRONTEND_ORIGIN || '').trim()
        const explicitDomain = String(process.env.AUTH_COOKIE_DOMAIN || '').trim()
        const hostname = frontendOrigin ? new URL(frontendOrigin).hostname : ''
        const secure =
            process.env.AUTH_COOKIE_SECURE === 'true' ||
            (process.env.AUTH_COOKIE_SECURE !== 'false' && frontendOrigin.startsWith('https://'))

        const domain = explicitDomain || this.resolveCookieDomain(hostname)

        return {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure,
            ...(domain ? { domain } : {}),
        } as const
    }

    private resolveCookieDomain(hostname: string) {
        if (!hostname || hostname === 'localhost' || isIP(hostname)) {
            return undefined
        }

        return hostname
    }
}
