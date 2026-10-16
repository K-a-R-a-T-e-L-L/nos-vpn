import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { ServerNode } from '../entity/server-node.entity'
import { VpnProviderTypeEnum } from '../enum/vpn-provider-type.enum'

@Injectable()
export class ServerNodeResolverService {
    constructor(
        @InjectRepository(ServerNode)
        private readonly serverNodeRepository: Repository<ServerNode>,
    ) {}

    async resolveNode(providerType: VpnProviderTypeEnum, preferredNodeId?: string) {
        if (preferredNodeId) {
            const preferred = await this.serverNodeRepository.findOne({
                where: { id: preferredNodeId, providerType, isActive: true },
            })

            if (preferred) {
                return preferred
            }
        }

        const fallback = await this.serverNodeRepository.findOne({
            where: { providerType, isActive: true },
            order: { priority: 'ASC', createdAt: 'ASC' },
        })

        if (!fallback) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, `No active server node found for ${providerType}`)
        }

        return fallback
    }
}
