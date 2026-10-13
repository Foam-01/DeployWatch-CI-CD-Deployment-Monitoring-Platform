import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../common/guards/org.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DeploymentsService } from './deployments.service';

@ApiTags('deployments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller()
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard overview metrics' })
  getDashboard(@CurrentUser('organizationId') orgId: string) {
    return this.deploymentsService.getDashboardOverview(orgId);
  }

  @Get('projects/:id/deployments')
  @ApiOperation({ summary: 'Get deployments for a project' })
  findByProject(
    @Param('id', ParseUUIDPipe) projectId: string,
    @CurrentUser('organizationId') orgId: string,
    @Query() query: any,
  ) {
    return this.deploymentsService.findByProject(projectId, orgId, query);
  }

  @Get('deployments/:id')
  @ApiOperation({ summary: 'Get deployment detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.deploymentsService.findOne(id);
  }
}
