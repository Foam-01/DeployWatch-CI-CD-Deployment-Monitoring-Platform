import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../common/guards/org.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { assertWritableRole } from '../common/utils/assert-writable-role';
import { HealthChecksService } from './health-checks.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@ApiTags('services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller()
export class HealthChecksController {
  constructor(private readonly healthChecksService: HealthChecksService) {}

  @Get('services')
  @ApiOperation({ summary: 'List all services in the organization' })
  getAllServices(@CurrentUser('organizationId') organizationId: string) {
    return this.healthChecksService.getAllServices(organizationId);
  }

  @Get('services/:id')
  @ApiOperation({ summary: 'Get service details' })
  getService(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.healthChecksService.getService(id, organizationId);
  }

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
    @CurrentUser('memberRole') role: string,
    @Body() dto: CreateServiceDto,
  ) {
    assertWritableRole(role);
    return this.healthChecksService.createService(projectId, organizationId, dto);
  }

  @Patch('services/:id')
  @ApiOperation({ summary: 'Update service configuration' })
  updateService(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
    @Body() dto: UpdateServiceDto,
  ) {
    assertWritableRole(role);
    return this.healthChecksService.updateService(id, organizationId, dto);
  }

  @Get('services/:id/health-history')
  @ApiOperation({ summary: 'Get health check history for a service' })
  getHealthHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.healthChecksService.getHealthHistory(id, organizationId, limit);
  }
}
