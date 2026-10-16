import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, ValidationPipe } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'

import { AdminAnalyticsFilterDto } from '../dto/admin-analytics-filter.dto'
import { AdminPaymentQueryDto } from '../dto/admin-payment-query.dto'
import { AdminReferralQueryDto } from '../dto/admin-referral-query.dto'
import { AdminReferrerInvitesQueryDto } from '../dto/admin-referrer-invites-query.dto'
import { AdminReferrerQueryDto } from '../dto/admin-referrer-query.dto'
import { AdminRetentionCohortsQueryDto, AdminRetentionUsersQueryDto } from '../dto/admin-retention-query.dto'
import { CreateTrafficSourceDto } from '../dto/create-traffic-source.dto'
import {
    AdminMoneyBreakdownsResponseDto,
    AdminMoneyOverviewResponseDto,
    AdminMoneyTimeseriesResponseDto,
    AdminPaymentListResponseDto,
    AdminReferralListResponseDto,
    AdminReferralOverviewResponseDto,
} from '../dto/response/admin-analytics-response.dto'
import {
    AdminReferrerInvitesResponseDto,
    AdminReferrerListResponseDto,
} from '../dto/response/admin-referrer-response.dto'
import { AdminRetentionCohortsResponseDto, AdminRetentionOverviewResponseDto, AdminRetentionUsersResponseDto } from '../dto/response/admin-retention-response.dto'
import { UpdateTrafficSourceDto } from '../dto/update-traffic-source.dto'
import { AdminFinanceAnalyticsService } from '../services/admin-finance-analytics.service'
import { AdminReferrerAnalyticsService } from '../services/admin-referrer-analytics.service'
import { AdminRetentionAnalyticsService } from '../services/admin-retention-analytics.service'
import { AnalyticsService } from '../services/analytics.service'

const strictQueryPipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })

@Controller('admin/analytics')
@ApiTags('Admin analytics')
export class AdminAnalyticsController {
    constructor(
        private readonly analyticsService: AnalyticsService,
        private readonly financeAnalytics: AdminFinanceAnalyticsService,
        private readonly referrerAnalytics: AdminReferrerAnalyticsService,
        private readonly retentionAnalytics: AdminRetentionAnalyticsService = {} as AdminRetentionAnalyticsService,
    ) {}

    @Get('money/overview')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Get financial analytics overview' })
    @ApiOkResponse({ type: AdminMoneyOverviewResponseDto })
    moneyOverview(@Query(strictQueryPipe) query: AdminAnalyticsFilterDto) {
        return this.financeAnalytics.getMoneyOverview(query)
    }

    @Get('retention/overview')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Get lifetime current-state retention overview' })
    @ApiOkResponse({ type: AdminRetentionOverviewResponseDto })
    retentionOverview() { return this.retentionAnalytics.getOverview() }

    @Get('retention/users')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List safe retention segment users' })
    @ApiOkResponse({ type: AdminRetentionUsersResponseDto })
    retentionUsers(@Query(strictQueryPipe) query: AdminRetentionUsersQueryDto) { return this.retentionAnalytics.listUsers(query) }

    @Get('retention/cohorts')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Get registration cohorts with lifetime outcomes as of now' })
    @ApiOkResponse({ type: AdminRetentionCohortsResponseDto })
    retentionCohorts(@Query(strictQueryPipe) query: AdminRetentionCohortsQueryDto) { return this.retentionAnalytics.getCohorts(query.months) }

    @Get('money/timeseries')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Get daily financial analytics' })
    @ApiOkResponse({ type: AdminMoneyTimeseriesResponseDto })
    moneyTimeseries(@Query(strictQueryPipe) query: AdminAnalyticsFilterDto) {
        return this.financeAnalytics.getTimeseries(query)
    }

    @Get('money/breakdowns')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Get financial analytics breakdowns' })
    @ApiOkResponse({ type: AdminMoneyBreakdownsResponseDto })
    moneyBreakdowns(@Query(strictQueryPipe) query: AdminAnalyticsFilterDto) {
        return this.financeAnalytics.getBreakdowns(query)
    }

    @Get('money/payments')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List safe payments with server filtering and pagination' })
    @ApiOkResponse({ type: AdminPaymentListResponseDto })
    moneyPayments(@Query(strictQueryPipe) query: AdminPaymentQueryDto) {
        return this.financeAnalytics.listPayments(query)
    }

    @Get('referrals/overview')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'Get referral analytics overview' })
    @ApiOkResponse({ type: AdminReferralOverviewResponseDto })
    referralOverview(@Query(strictQueryPipe) query: AdminReferralQueryDto) {
        return this.financeAnalytics.getReferralOverview(query)
    }

    @Get('referrals/referrers')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List per-referrer analytics with server filtering and pagination' })
    @ApiOkResponse({ type: AdminReferrerListResponseDto })
    referrers(@Query(strictQueryPipe) query: AdminReferrerQueryDto) {
        return this.referrerAnalytics.listReferrers(query)
    }

    @Get('referrals/referrers/:userId/invites')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List invited users for one referrer' })
    @ApiOkResponse({ type: AdminReferrerInvitesResponseDto })
    referrerInvites(
        @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
        @Query(strictQueryPipe) query: AdminReferrerInvitesQueryDto,
    ) {
        return this.referrerAnalytics.getReferrerInvites(userId, query)
    }

    @Get('referrals')
    @UserAuth(UserAuthType.ADMIN)
    @ApiOperation({ summary: 'List referral analytics with server filtering and pagination' })
    @ApiOkResponse({ type: AdminReferralListResponseDto })
    referrals(@Query(strictQueryPipe) query: AdminReferralQueryDto) {
        return this.financeAnalytics.listReferrals(query)
    }

    @Get('overview')
    @UserAuth(UserAuthType.ADMIN)
    async overview() {
        return this.analyticsService.getOverview()
    }

    @Get('sources')
    @UserAuth(UserAuthType.ADMIN)
    async listSources(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
        return this.analyticsService.listSourcesWithMetrics(Number(page) || 1, Number(pageSize) || 20)
    }

    @Post('sources')
    @UserAuth(UserAuthType.ADMIN)
    async createSource(@Body() dto: CreateTrafficSourceDto) {
        return this.analyticsService.createSource(dto)
    }

    @Patch('sources/:id')
    @UserAuth(UserAuthType.ADMIN)
    async updateSource(@Param('id') id: string, @Body() dto: UpdateTrafficSourceDto) {
        return this.analyticsService.updateSource(id, dto)
    }

    @Delete('sources/:id')
    @UserAuth(UserAuthType.ADMIN)
    async deleteSource(@Param('id') id: string) {
        return this.analyticsService.deleteSource(id)
    }

    @Get('attributions')
    @UserAuth(UserAuthType.ADMIN)
    async listAttributions(
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
    ) {
        return this.analyticsService.listAttributedUsers(search, Number(page) || 1, Number(pageSize) || 25)
    }
}
