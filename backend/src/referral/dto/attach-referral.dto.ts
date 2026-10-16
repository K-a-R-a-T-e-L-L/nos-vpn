import { ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'

export class AttachReferralDto {
    @ApiProperty({
        description: 'Referral code captured from Telegram deep link or website invite link',
        example: 'ref_2iazzkb',
    })
    @IsString()
    @MinLength(3)
    referralCode: string
}
