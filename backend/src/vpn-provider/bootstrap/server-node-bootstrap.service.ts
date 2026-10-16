import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ServerNode } from '../entity/server-node.entity'
import { VpnProviderTypeEnum } from '../enum/vpn-provider-type.enum'

@Injectable()
export class ServerNodeBootstrapService implements OnModuleInit {
    constructor(
        @InjectRepository(ServerNode)
        private readonly nodeRepository: Repository<ServerNode>,
        private readonly configService: ConfigService,
    ) {}

    async onModuleInit() {
        const baseUrl = this.configService.get<string>('REMNAWAVE_BASE_URL')
        if (!baseUrl) {
            return
        }

        const code = this.configService.get<string>('REMNAWAVE_DEFAULT_NODE_CODE') || 'remnawave-default'
        const name = code
        const region = 'default'
        const accessKey = this.configService.get<string>('REMNAWAVE_DEFAULT_SQUAD_UUID') || code

        const existing = await this.nodeRepository.findOne({ where: { code } })
        if (existing) {
            let changed = false
            if (existing.baseUrl !== baseUrl) {
                existing.baseUrl = baseUrl
                changed = true
            }
            if (existing.providerType !== VpnProviderTypeEnum.REMNAWAVE) {
                existing.providerType = VpnProviderTypeEnum.REMNAWAVE
                changed = true
            }
            existing.isActive = true
            existing.meta = { ...(existing.meta || {}), defaultAccessKey: accessKey }
            if (changed) {
                await this.nodeRepository.save(existing)
            } else {
                await this.nodeRepository.save(existing)
            }
            return
        }

        await this.nodeRepository.save({
            code,
            name,
            region,
            providerType: VpnProviderTypeEnum.REMNAWAVE,
            baseUrl,
            isActive: true,
            priority: 100,
            meta: { defaultAccessKey: accessKey },
        })
    }
}
