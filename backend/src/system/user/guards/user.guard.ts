import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { UserService } from '../services/user.service'

const AUTHENTICATION_FAILED_DESCRIPTION = 'Authentication failed'

@Injectable()
export class UserGuard implements CanActivate {
    constructor(
        private userService: UserService,
        private jwtService: JwtService,
        private configService: ConfigService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest()
        const token = request.headers.authorization?.replace('Bearer ', '')

        if (!token) {
            throw new ErrorDto(ErrorCodeEnum.AUTH_FAIL, AUTHENTICATION_FAILED_DESCRIPTION)
        }

        try {
            this.jwtService.verify(token, { secret: this.configService.get('JWT_ACCESS_SECRET') })
        } catch {
            throw new ErrorDto(ErrorCodeEnum.AUTH_FAIL, AUTHENTICATION_FAILED_DESCRIPTION)
        }

        const user = await this.userService.getUserFromToken(token, false)
        request.user = user

        return true
    }
}
