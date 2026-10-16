import { Type } from 'class-transformer'
import { IsIn, IsNotEmpty, IsString, ValidateNested } from 'class-validator'

import { YOOKASSA_WEBHOOK_EVENTS } from '../types/yookassa-webhook.types'

class YooKassaWebhookObjectDto {
    @IsString()
    @IsNotEmpty()
    id: string

    @IsString()
    @IsNotEmpty()
    status: string
}

export class YooKassaWebhookDto {
    @IsIn(['notification'])
    type: 'notification'

    @IsIn(YOOKASSA_WEBHOOK_EVENTS)
    event: (typeof YOOKASSA_WEBHOOK_EVENTS)[number]

    @ValidateNested()
    @Type(() => YooKassaWebhookObjectDto)
    object: YooKassaWebhookObjectDto
}
