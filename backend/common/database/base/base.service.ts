import { PaginateConfig, PaginateQuery, Paginated, paginate } from 'nestjs-paginate'
import { DeepPartial, FindOneOptions, Repository } from 'typeorm'

import { ErrorCodeEnum } from '../../enums/validator/error.code.enum'
import { ErrorDto } from '../../errors/error.dto'

export class BaseService<T, SaveDto extends DeepPartial<T>, UpdateDto extends DeepPartial<T>> {
    constructor(private readonly repository: Repository<T>) {}

    async findAll(query: PaginateQuery, config: PaginateConfig<T>): Promise<Paginated<T>> {
        return await paginate(query, this.repository, config)
    }

    async getOne(options: FindOneOptions<T>) {
        try {
            return await this.repository.findOne(options)
        } catch (e) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND)
        }
    }

    async findOne(id: string) {
        try {
            return await this.repository.findOneOrFail({
                where: { id },
            } as FindOneOptions)
        } catch (e) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND)
        }
    }

    async findOneByCode(code: string) {
        try {
            return await this.repository.findOneOrFail({
                where: { code },
            } as FindOneOptions)
        } catch (e) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND)
        }
    }

    async save(dto: SaveDto) {
        try {
            const entity = this.repository.create(dto)

            return await this.repository.save(entity)
        } catch (e) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_CREATION_FAIL, e.message)
        }
    }

    async update(id: string, partialEntity: UpdateDto) {
        const entity = await this.repository.findOne({ where: { id } } as FindOneOptions)

        if (!entity) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND)
        }

        const updatedEntity = this.repository.merge(entity, partialEntity)
        return await this.repository.save(updatedEntity)
    }

    async remove(id: string) {
        const entity = await this.repository.findOne({ where: { id } } as FindOneOptions)

        if (!entity) {
            throw new ErrorDto(ErrorCodeEnum.ENTITY_NOT_FOUND)
        }

        await this.repository.softDelete(id)
        return await this.repository.findOne({ where: { id }, withDeleted: true } as FindOneOptions)
    }
}
