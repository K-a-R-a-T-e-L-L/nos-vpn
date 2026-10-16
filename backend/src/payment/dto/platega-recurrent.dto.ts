import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Equals, IsBoolean, IsISO8601, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

import { PaymentMerchant } from '../enum/payment-merchant.enum'

export class CreatePlategaRecurrentAgreementDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID()
    planId: string

    @ApiProperty({ enum: [true], description: 'Explicit acceptance of the recurrent payment disclosure' })
    @IsBoolean()
    @Equals(true)
    consent: true
}

export class PlategaSubscriptionStatusCallbackDto {
    @ApiProperty()
    @IsString()
    @MaxLength(128)
    Id: string

    @ApiProperty()
    @IsString()
    @MaxLength(128)
    SubscriptionId: string

    @ApiProperty()
    @IsInt()
    Amount: number

    @ApiProperty()
    @IsString()
    @MaxLength(3)
    Currency: string

    @ApiProperty()
    @IsString()
    @MaxLength(64)
    Status: string

    @ApiProperty()
    @IsInt()
    PaymentMethod: number

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(1024)
    Payload?: string

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsISO8601()
    NextChargeAt?: string | null
}

export class PlategaChargeCallbackDto {
    @ApiProperty()
    @IsString()
    @MaxLength(128)
    Id: string

    @ApiProperty()
    @IsInt()
    Amount: number

    @ApiProperty()
    @IsString()
    @MaxLength(3)
    Currency: string

    @ApiProperty()
    @IsString()
    @MaxLength(64)
    Status: string

    @ApiProperty()
    @IsInt()
    PaymentMethod: number

    @ApiProperty()
    @IsString()
    @MaxLength(128)
    SubscriptionId: string

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(1024)
    Payload?: string

    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsISO8601()
    NextChargeAt?: string | null
}

export class PlategaRecurrentAgreementResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string
    @ApiPropertyOptional({ nullable: true }) providerSubscriptionId: string | null
    @ApiProperty({ enum: PaymentMerchant }) merchant: PaymentMerchant
    @ApiProperty() status: string
    @ApiPropertyOptional({ nullable: true }) providerStatus: string | null
    @ApiProperty() amount: number
    @ApiProperty() currency: string
    @ApiProperty() durationDays: number
    @ApiPropertyOptional({ nullable: true }) redirect: string | null
    @ApiPropertyOptional({ nullable: true }) nextChargeAt: Date | null
    @ApiPropertyOptional({ nullable: true }) lastChargeAt: Date | null
    @ApiPropertyOptional({ nullable: true }) cancelledAt: Date | null
    @ApiProperty() createdAt: Date
}

export enum AdminPlategaRecurrentCadence {
    MONTHLY = 'MONTHLY',
    YEARLY = 'YEARLY',
}

export class AdminPlategaRecurrentAgreementDto {
    @ApiProperty({ format: 'uuid' }) id: string
    @ApiProperty({ format: 'uuid' }) userId: string
    @ApiProperty({ enum: PaymentMerchant }) merchant: PaymentMerchant
    @ApiProperty() status: string
    @ApiPropertyOptional({ nullable: true }) providerStatus: string | null
    @ApiProperty({ format: 'uuid' }) planId: string
    @ApiPropertyOptional({ nullable: true }) planName: string | null
    @ApiPropertyOptional({ nullable: true }) planPeriodDays: number | null
    @ApiProperty() amount: number
    @ApiProperty() currency: string
    @ApiPropertyOptional({ enum: AdminPlategaRecurrentCadence, nullable: true })
    cadence: AdminPlategaRecurrentCadence | null
    @ApiPropertyOptional({ nullable: true }) nextChargeAt: Date | null
    @ApiPropertyOptional({ nullable: true }) lastChargeAt: Date | null
    @ApiPropertyOptional({ nullable: true }) cancelledAt: Date | null
    @ApiPropertyOptional({ nullable: true }) consentAcceptedAt: Date | null
    @ApiPropertyOptional({ nullable: true }) consentLegalVersion: string | null
    @ApiProperty() canCancel: boolean
    @ApiProperty() canReconcile: boolean
    @ApiProperty() createdAt: Date
}
