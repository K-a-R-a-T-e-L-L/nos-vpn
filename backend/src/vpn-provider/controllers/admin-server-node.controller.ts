import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { UserAuth, UserAuthType } from '@common/decorators/auth.helpers'
import { ErrorCodeEnum } from '@common/enums/validator/error.code.enum'
import { ErrorDto } from '@common/errors/error.dto'

import { CreateServerNodeDto } from '../dto/create-server-node.dto'
import { UpdateServerNodeDto } from '../dto/update-server-node.dto'
import { ServerNode } from '../entity/server-node.entity'

@ApiTags('Admin server nodes')
@Controller('admin/server-nodes')
export class AdminServerNodeController {
    constructor(
        @InjectRepository(ServerNode)
        private readonly serverNodeRepository: Repository<ServerNode>,
    ) {}

    @Get()
    @UserAuth(UserAuthType.ADMIN)
    async list() {
        return this.serverNodeRepository.find({ order: { priority: 'ASC', createdAt: 'DESC' } })
    }

    @Post()
    @UserAuth(UserAuthType.ADMIN)
    async create(@Body() dto: CreateServerNodeDto) {
        const existing = await this.serverNodeRepository.findOne({ where: { code: dto.code } })
        if (existing) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Server node code already exists')
        }

        return this.serverNodeRepository.save({
            code: dto.code,
            name: dto.name,
            region: dto.region,
            providerType: dto.providerType,
            baseUrl: dto.baseUrl,
            isActive: dto.isActive ?? true,
            priority: dto.priority ?? 100,
            meta: dto.defaultAccessKey ? { defaultAccessKey: dto.defaultAccessKey } : {},
        })
    }

    @Patch(':id')
    @UserAuth(UserAuthType.ADMIN)
    async update(@Param('id') id: string, @Body() dto: UpdateServerNodeDto) {
        const node = await this.serverNodeRepository.findOne({ where: { id } })
        if (!node) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Server node not found')
        }

        if (dto.code && dto.code !== node.code) {
            const existing = await this.serverNodeRepository.findOne({ where: { code: dto.code } })
            if (existing) {
                throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, 'Server node code already exists')
            }
            node.code = dto.code
        }

        if (dto.name !== undefined) node.name = dto.name
        if (dto.region !== undefined) node.region = dto.region
        if (dto.providerType !== undefined) node.providerType = dto.providerType
        if (dto.baseUrl !== undefined) node.baseUrl = dto.baseUrl
        if (dto.isActive !== undefined) node.isActive = dto.isActive
        if (dto.priority !== undefined) node.priority = dto.priority
        if (dto.defaultAccessKey !== undefined) {
            node.meta = { ...(node.meta || {}), defaultAccessKey: dto.defaultAccessKey || node.code }
        }

        return this.serverNodeRepository.save(node)
    }

    @Delete(':id')
    @UserAuth(UserAuthType.ADMIN)
    async delete(@Param('id') id: string) {
        const node = await this.serverNodeRepository.findOne({ where: { id } })
        if (!node) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND, 'Server node not found')
        }

        await this.serverNodeRepository.delete(id)
        return { ok: true, id }
    }
}
