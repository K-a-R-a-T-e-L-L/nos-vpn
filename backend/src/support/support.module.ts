import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AdminSupportController } from './controllers/admin-support.controller'
import { SupportController } from './controllers/support.controller'
import { SupportMessage } from './entity/support-message.entity'
import { SupportThread } from './entity/support-thread.entity'
import { SupportMediaStorageService } from './services/support-media-storage.service'
import { SupportService } from './services/support.service'
import { User } from '../system/user/entity/user.entity'

@Module({
    imports: [TypeOrmModule.forFeature([SupportThread, SupportMessage, User])],
    controllers: [SupportController, AdminSupportController],
    providers: [SupportService, SupportMediaStorageService],
    exports: [SupportService, SupportMediaStorageService],
})
export class SupportModule {}
