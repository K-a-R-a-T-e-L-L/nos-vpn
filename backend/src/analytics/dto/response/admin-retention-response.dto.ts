import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class AdminRetentionOverviewResponseDto {
    @ApiProperty() asOf: string
    @ApiProperty() timezone: string
    @ApiProperty() scope: string
    @ApiProperty() customerUsers: number
    @ApiProperty() currentPaidUsers: number
    @ApiProperty() activeRepeatPayers: number
    @ApiProperty() repeatPayersEver: number
    @ApiProperty() onePaymentNoPaidEntitlement: number
    @ApiProperty() trialOnlyNoEntitlement: number
    @ApiProperty() trialUsers: number
    @ApiProperty() trialConvertedUsers: number
    @ApiProperty() payingUsersEver: number
    @ApiProperty() trialConversionRate: string
    @ApiProperty() repeatPurchaseRate: string
}

export class AdminRetentionUsersResponseDto {
    @ApiProperty() asOf: string
    @ApiProperty() timezone: string
    @ApiProperty() segment: string
    @ApiProperty({ type: [Object] }) items: object[]
    @ApiProperty() total: number
    @ApiProperty() page: number
    @ApiProperty() pageSize: number
    @ApiProperty() totalPages: number
}

export class AdminRetentionCohortsResponseDto {
    @ApiProperty() asOf: string
    @ApiProperty() timezone: string
    @ApiProperty() cohortType: string
    @ApiProperty() outcomeMode: string
    @ApiProperty() months: number
    @ApiProperty({ type: [Object] }) items: object[]
}
