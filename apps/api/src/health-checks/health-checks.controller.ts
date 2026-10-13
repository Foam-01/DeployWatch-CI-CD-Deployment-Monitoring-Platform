import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../common/guards/org.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { HealthChecksService } from './health-checks.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@ApiTags('services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller()
export class HealthChecksController {
  constructor(private readonly healthChecksService: HealthChecksService) {}

  @Get('projects/:projectId/services')
  @ApiOperation({ summary: 'List services for a project' })
  getServices(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.healthChecksService.getServices(projectId, organizationId);
  }

  @Post('projects/:projectId/services')
  @ApiOperation({ summary: 'Add a service health check' })
  createService(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateServiceDto,
  ) {
    return this.healthChecksService.createService(projectId, organizationId, dto);
  }

  @Patch('services/:id')
  @ApiOperation({ summary: 'Update service configuration' })
  updateService(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.healthChecksService.updateService(id, dto);
  }

  @Get('services/:id/health-history')
  @ApiOperation({ summary: 'Get health check history for a service' })
  getHealthHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number,
  ) {
    return this.healthChecksService.getHealthHistory(id, limit);
  }
}
