import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { RemnawaveProviderAdapter } from './adapters/remnawave-provider.adapter'
import { ServerNodeBootstrapService } from './bootstrap/server-node-bootstrap.service'
import { RemnawaveHttpClient } from './clients/remnawave-http.client'
import { AdminServerNodeController } from './controllers/admin-server-node.controller'
import { ServerNode } from './entity/server-node.entity'
import { ServerNodeResolverService } from './services/server-node-resolver.service'

@Module({
    imports: [TypeOrmModule.forFeature([ServerNode])],
    controllers: [AdminServerNodeController],
    providers: [RemnawaveHttpClient, RemnawaveProviderAdapter, ServerNodeResolverService, ServerNodeBootstrapService],
    exports: [TypeOrmModule, RemnawaveProviderAdapter, ServerNodeResolverService],
})
export class VpnProviderModule {}
