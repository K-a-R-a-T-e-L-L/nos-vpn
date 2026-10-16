import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { UserService } from '../services/user.service'

@Injectable()
export class TokenGuard implements CanActivate {
    constructor(private userService: UserService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest()
        const token = request.headers.authorization

        if (!token) {
            request.session = undefined
            request.user = undefined
            return true
        }

        throw new ErrorDto(ErrorCodeEnum.UNAUTHORIZED, 'TokenGuard is disabled; use UserGuard for authenticated routes')
        // if (token) {
        //     const session = await this.userService.findSessionByToken(token.replace('Bearer ', ''))
        //     if (!session) throw new ErrorDto(ErrorCodeEnum.UNAUTHORIZED)
        //
        //     request.session = session
        //     request.user = session.user
        //
        //     return true
        // } else {
        //     request.session = undefined
        //     request.user = undefined
        //     return true
        // }
    }
}
