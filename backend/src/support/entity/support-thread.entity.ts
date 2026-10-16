import { ApiProperty } from '@nestjs/swagger'
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm'

import { BaseEntity } from '@common/database/base/base.entity'

import { SupportThreadStatusEnum } from './support.enum'
import { User } from '../../system/user/entity/user.entity'

@Entity('support_thread')
export class SupportThread extends BaseEntity {
    @ApiProperty()
    @Column({ name: 'user_id', type: 'uuid', unique: true })
    userId: string

    @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User

    @ApiProperty({ enum: SupportThreadStatusEnum })
    @Column({ type: 'varchar', default: SupportThreadStatusEnum.OPEN })
    status: SupportThreadStatusEnum

    @ApiProperty()
    @Column({ name: 'last_message_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    lastMessageAt: Date

    @ApiProperty({ required: false })
    @Column({ name: 'last_user_message_at', type: 'timestamptz', nullable: true })
    lastUserMessageAt?: Date | null

    @ApiProperty({ required: false })
    @Column({ name: 'last_admin_message_at', type: 'timestamptz', nullable: true })
    lastAdminMessageAt?: Date | null
}
