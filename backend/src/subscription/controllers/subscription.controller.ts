import {Controller} from '@nestjs/common'
import {ApiTags} from '@nestjs/swagger'

import {UserAuthType} from '@common/decorators/auth.helpers'
import {UserDockGetManyNotPaginate} from '@common/swagger/user.swagger.helper'

import {UserService} from "../../system/user/services/user.service";
import {Subscription} from "../entity/subscription.entity";
import {SubscriptionService} from "../services/subscription.service";

@Controller('admin/subscriptions')
@ApiTags('Admin subscriptions')
export class SubscriptionController {
    constructor(
        private readonly subscriptionService: SubscriptionService,
        private readonly userService: UserService
    ) {}

    @UserDockGetManyNotPaginate('', UserAuthType.ADMIN, Subscription)
    async get() {
        return this.subscriptionService.find()
    }
}
