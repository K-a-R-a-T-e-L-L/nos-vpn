import { ApiProperty } from '@nestjs/swagger'
import { IsNumber, Min } from 'class-validator'

export class UpdateUserWalletDto {
    @ApiProperty({
        description: 'Current user wallet balance in rubles',
        example: 0,
        minimum: 0,
    })
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    referralBonusBalanceRub: number
}
