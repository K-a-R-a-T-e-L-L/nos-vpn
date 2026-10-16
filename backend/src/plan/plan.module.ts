import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'

import { AdminPlanController } from './controllers/admin-plan.controller'
import { PlanController } from './controllers/plan.controller'
import { Plan } from './entity/plan.entity'
import { PlanBootstrapService } from './services/plan-bootstrap.service'
import { PlanService } from './services/plan.service'
import { Meter } from '../billing/entities/meter.entity'
import { PlanLimit } from '../billing/entities/plan-limit.entity'

@Module({
    imports: [TypeOrmModule.forFeature([Plan, Meter, PlanLimit])],
    controllers: [PlanController, AdminPlanController],
    providers: [PlanService, PlanBootstrapService],
    exports: [PlanService]
})
export class PlanModule {}
