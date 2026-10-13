import { Module } from '@nestjs/common';
import { HealthCheckSchedulerService } from './health-check-scheduler.service';
import { HealthChecksController } from './health-checks.controller';
import { HealthChecksService } from './health-checks.service';

@Module({
  controllers: [HealthChecksController],
  providers: [HealthChecksService, HealthCheckSchedulerService],
  exports: [HealthChecksService],
})
export class HealthChecksModule {}
