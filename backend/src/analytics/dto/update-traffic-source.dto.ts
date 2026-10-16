import { PartialType } from '@nestjs/swagger'

import { CreateTrafficSourceDto } from './create-traffic-source.dto'

export class UpdateTrafficSourceDto extends PartialType(CreateTrafficSourceDto) {}
