import { ApiProperty } from '@nestjs/swagger'

export enum PaymentRecurrentCadence {
    MONTHLY = 'MONTHLY',
    YEARLY = 'YEARLY',
}

export class PaymentCheckoutAvailabilityDto {
    @ApiProperty()
    available: boolean
}

export class PaymentRecurrentCheckoutOptionDto extends PaymentCheckoutAvailabilityDto {
    @ApiProperty()
    eligible: boolean

    @ApiProperty({ enum: PaymentRecurrentCadence, nullable: true })
    cadence: PaymentRecurrentCadence | null
}

export class PaymentCheckoutOptionsDto {
    @ApiProperty({ format: 'uuid' })
    planId: string

    @ApiProperty({ type: PaymentCheckoutAvailabilityDto })
    oneTime: PaymentCheckoutAvailabilityDto

    @ApiProperty({ type: PaymentCheckoutAvailabilityDto })
    crypto: PaymentCheckoutAvailabilityDto

    @ApiProperty({ type: PaymentRecurrentCheckoutOptionDto })
    recurrent: PaymentRecurrentCheckoutOptionDto
}
