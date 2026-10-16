import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, ValidationPipe } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'

import { AdminPlategaRecurrentAgreementDto } from '../../../payment/dto/platega-recurrent.dto'
import { PlategaRecurrentAgreementService } from '../../../payment/services/platega-recurrent-agreement.service'
import { AdminConfigureSubscriptionDto } from '../../../subscription/dto/admin-configure-subscription.dto'
import { SubscriptionAutoRenewService } from '../../../subscription/services/subscription-auto-renew.service'
import { SubscriptionService } from '../../../subscription/services/subscription.service'
import { AccessPresentationService } from '../../../vpn-access/services/access-presentation.service'
import { UserDecorator } from '../decorators/user.decorator'
import { AdminUserDetailsQueryDto, AdminUserQueryDto } from '../dto/admin-user-query.dto'
import {
    AdminUserAccessResponseDto,
    AdminUserDetailsResponseDto,
    AdminUserListResponseDto,
} from '../dto/response/admin-user-response.dto'
import { UpdateUserBlockDto } from '../dto/update-user-block.dto'
import { UpdateUserWalletDto } from '../dto/update-user-wallet.dto'
import { User } from '../entity/user.entity'
import { UserService } from '../services/user.service'

const strictQueryPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })

@Controller('admin/user')
@ApiTags('User admin')
export class UserAdminController {
    constructor(
        private readonly userService: UserService,
        private readonly subscriptionService: SubscriptionService,
        private readonly accessPresentationService: AccessPresentationService,
        private readonly autoRenewService: SubscriptionAutoRenewService,
        private readonly plategaRecurrentAgreements: PlategaRecurrentAgreementService,
    ) {}

    @Get()
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List admin users' })
    async list(@Query('search') search?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
        return this.userService.findAdminUsers(search, Number(page) || 1, Number(pageSize) || 25)
    }

    @Get('summary')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Get admin dashboard summary' })
    async summary() {
        return this.userService.getAdminSummary()
    }

    @Get('query')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Query safe admin users with server filtering and pagination' })
    @ApiOkResponse({ type: AdminUserListResponseDto })
    async queryUsers(@Query(strictQueryPipe) query: AdminUserQueryDto) {
        return this.userService.queryAdminUsers(query)
    }

    @Get(':id/details')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Get read-only safe admin user details' })
    @ApiOkResponse({ type: AdminUserDetailsResponseDto })
    async details(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Query(strictQueryPipe) query: AdminUserDetailsQueryDto,
    ) {
        return this.userService.getAdminUserDetails(id, query.paymentPage, query.paymentPageSize)
    }

    @Get(':id/recurrent')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List safe Platega recurrent agreements for one user' })
    @ApiOkResponse({ type: [AdminPlategaRecurrentAgreementDto] })
    recurrent(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
        return this.plategaRecurrentAgreements.listForAdminUser(id)
    }

    @Post(':id/recurrent/:agreementId/cancel')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Cancel an owned Platega recurrent agreement without changing paid access' })
    @ApiOkResponse({ type: AdminPlategaRecurrentAgreementDto })
    cancelRecurrent(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Param('agreementId', new ParseUUIDPipe({ version: '4' })) agreementId: string,
    ) {
        return this.plategaRecurrentAgreements.cancelForAdminUser(id, agreementId)
    }

    @Post(':id/recurrent/:agreementId/reconcile')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Reconcile an owned Platega recurrent agreement without fabricating payments or entitlement' })
    @ApiOkResponse({ type: AdminPlategaRecurrentAgreementDto })
    reconcileRecurrent(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Param('agreementId', new ParseUUIDPipe({ version: '4' })) agreementId: string,
    ) {
        return this.plategaRecurrentAgreements.reconcileForAdminUser(id, agreementId)
    }

    @Patch(':id/wallet')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Update referral wallet balance' })
    async updateWallet(@Param('id') id: string, @Body() dto: UpdateUserWalletDto) {
        return this.userService.updateReferralWalletBalance(id, dto.referralBonusBalanceRub)
    }

    @Patch(':id/block')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Block or unblock user' })
    async updateBlock(@Param('id') id: string, @Body() dto: UpdateUserBlockDto) {
        return this.userService.setBlocked(id, dto.isBlocked)
    }

    @Post(':id/subscription')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Issue or reconfigure user subscription' })
    async configureSubscription(
        @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
        @Body() dto: AdminConfigureSubscriptionDto,
    ) {
        return this.subscriptionService.adminConfigureSubscription(
            id,
            dto.planId,
            dto.endsAt ? new Date(dto.endsAt) : undefined,
        )
    }

    @Post(':id/subscription/stop')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Stop a user subscription and disable VPN access' })
    async stopSubscription(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
        return this.subscriptionService.stopSubscription(id)
    }

    @Get(':id/access')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Get the narrow current access URL for a user' })
    @ApiOkResponse({ type: AdminUserAccessResponseDto })
    async access(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<AdminUserAccessResponseDto> {
        const subscription = await this.subscriptionService.getResolvedForUser(id)
        if (!subscription) {
            return {
                status: null,
                deliveryMode: 'UNAVAILABLE',
                subscriptionUrl: null,
                expiresAt: null,
                planTitle: null,
            }
        }

        const payload = await this.accessPresentationService.buildPayload(subscription.id, subscription)
        if (!payload) {
            return {
                status: subscription.status || null,
                deliveryMode: 'UNAVAILABLE',
                subscriptionUrl: null,
                expiresAt: subscription.endsAt || null,
                planTitle: subscription.plan?.title || subscription.plan?.name || null,
            }
        }

        return {
            status: payload.status || null,
            deliveryMode: payload.deliveryMode,
            subscriptionUrl: payload.subscriptionUrl || null,
            expiresAt: payload.expiresAt || null,
            planTitle: payload.planTitle || null,
        }
    }

    @Post(':id/auto-renew/yookassa/disable')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Disable YooKassa saved-method auto-renew for a user' })
    async disableYooKassaAutoRenew(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
        return this.autoRenewService.disable(id)
    }

    @Delete(':id')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Permanently delete user' })
    async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @UserDecorator() actor: User) {
        return this.userService.permanentlyDeleteUser(id, actor.id)
    }
}
