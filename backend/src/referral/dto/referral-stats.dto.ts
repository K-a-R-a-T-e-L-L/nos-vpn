import { ApiProperty } from '@nestjs/swagger'

export class ReferralStatsDto {
    @ApiProperty()
    referralCode: string

    @ApiProperty({ required: false, nullable: true })
    telegramBotStartUrl?: string | null

    @ApiProperty()
    invitedCount: number

    @ApiProperty()
    bonusBalanceRub: number

    @ApiProperty()
    totalBonusRub: number
}
