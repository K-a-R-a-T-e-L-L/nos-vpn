import { Type, applyDecorators } from '@nestjs/common'
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger'
import { ReferenceObject, SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface'
import { PaginateConfig, PaginatedDocumented } from 'nestjs-paginate'

export const ApiOkPaginatedResponse = <DTO extends Type<unknown>>(
    dataDto: DTO,
    paginatedConfig: PaginateConfig<any>,
) => {
    const cols = paginatedConfig?.filterableColumns || {}

    return applyDecorators(
        ApiExtraModels(PaginatedDocumented, dataDto),
        ApiOkResponse({
            schema: {
                required: ['data', 'meta', 'links'],
                properties: {
                    data: {
                        type: 'array',
                        items: { $ref: getSchemaPath(dataDto) },
                    },
                    meta: {
                        properties: {
                            itemsPerPage: { type: 'number' },
                            totalItems: { type: 'number' },
                            currentPage: { type: 'number' },
                            totalPages: { type: 'number' },
                            sortBy: {
                                type: 'array',
                                items: { type: 'string', enum: ['ASC', 'DESC'] },
                            },
                            searchBy: { type: 'array', items: { type: 'string' } },
                            search: { type: 'string' },
                            select: {
                                type: 'array',
                                items: {
                                    type: 'string',
                                    enum: paginatedConfig?.select,
                                },
                            },
                            filter: {
                                type: 'object',
                                properties: Object.keys(cols).reduce(
                                    (acc, key) => {
                                        acc[key] = {
                                            oneOf: [
                                                {
                                                    type: 'string',
                                                },
                                                {
                                                    type: 'array',
                                                    items: {
                                                        type: 'string',
                                                    },
                                                },
                                            ],
                                        }
                                        return acc
                                    },
                                    {} as Record<string, SchemaObject | ReferenceObject>,
                                ),
                            },
                        },
                    },
                    links: {
                        type: 'object',
                        properties: {
                            first: { type: 'string' },
                            previous: { type: 'string' },
                            current: { type: 'string' },
                            next: { type: 'string' },
                            last: { type: 'string' },
                        },
                    },
                },
            },
        }),
    )
}
