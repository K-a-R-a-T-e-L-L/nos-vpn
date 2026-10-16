import { PaginateConfig } from 'nestjs-paginate'

import { Plan } from '../../src/plan/entity/plan.entity'
import { User } from '../../src/system/user/entity/user.entity'

export const UsersPaginated: PaginateConfig<User> = {
    defaultSortBy: [['createdAt', 'DESC']],
    filterableColumns: {
        id: true,
        name: true,
        email: true,
        phone: true,
    },
    relations: {},
    searchableColumns: [],
    select: undefined,
    sortableColumns: ['id'],
    where: undefined,
    maxLimit: 60,
    defaultLimit: 60,
}

export const PlansPaginated: PaginateConfig<Plan> = {
    defaultSortBy: [['createdAt', 'DESC']],
    filterableColumns: {
        id: true,
        name: true,
    },
    relations: {},
    searchableColumns: [],
    select: undefined,
    sortableColumns: ['id'],
    where: undefined,
    maxLimit: 60,
    defaultLimit: 60,
}
