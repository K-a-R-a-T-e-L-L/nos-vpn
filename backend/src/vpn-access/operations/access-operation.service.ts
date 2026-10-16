import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import {
    AccessOperationLog,
    AccessOperationStatusEnum,
    AccessOperationTypeEnum,
} from './access-operation-log.entity'
import { VpnProviderTypeEnum } from '../../vpn-provider/enum/vpn-provider-type.enum'

@Injectable()
export class AccessOperationService {
    constructor(
        @InjectRepository(AccessOperationLog)
        private readonly operationRepository: Repository<AccessOperationLog>,
    ) {}

    async begin(input: {
        operationKey: string
        operationType: AccessOperationTypeEnum
        subscriptionId?: string
        accessId?: string
        providerType: VpnProviderTypeEnum
    }) {
        const existing = await this.operationRepository.findOne({ where: { operationKey: input.operationKey } })
        if (existing) {
            return { existing, isNew: false }
        }

        const created = await this.operationRepository.save({
            operationKey: input.operationKey,
            operationType: input.operationType,
            subscriptionId: input.subscriptionId,
            accessId: input.accessId,
            providerType: input.providerType,
            status: AccessOperationStatusEnum.STARTED,
            startedAt: new Date(),
        })

        return { existing: created, isNew: true }
    }

    async succeed(operationKey: string, resultSnapshot?: Record<string, any>) {
        const op = await this.operationRepository.findOne({ where: { operationKey } })
        if (!op) {
            return null
        }

        op.status = AccessOperationStatusEnum.SUCCESS
        op.finishedAt = new Date()
        op.error = null
        op.resultSnapshot = resultSnapshot || op.resultSnapshot
        return this.operationRepository.save(op)
    }

    async fail(operationKey: string, error: string) {
        const op = await this.operationRepository.findOne({ where: { operationKey } })
        if (!op) {
            return null
        }

        op.status = AccessOperationStatusEnum.FAILED
        op.finishedAt = new Date()
        op.error = error
        return this.operationRepository.save(op)
    }
}
