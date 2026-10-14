import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../common/guards/org.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WorkflowRunsService } from './workflow-runs.service';
import { WorkflowRunExportQueryDto } from './dto/workflow-run-export-query.dto';

@ApiTags('workflow-runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller()
export class WorkflowRunsController {
  constructor(private readonly workflowRunsService: WorkflowRunsService) {}

  @Get('workflow-runs')
  @ApiOperation({ summary: 'Search workflow runs' })
  findAll(@CurrentUser('organizationId') orgId: string, @Query() query: any) {
    return this.workflowRunsService.findAll(orgId, query);
  }

  @Get('workflow-runs/export.csv')
  @ApiOperation({ summary: 'Export workflow runs as CSV' })
  async exportCsv(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: WorkflowRunExportQueryDto,
    @Res() response: Response,
  ) {
    const csv = await this.workflowRunsService.exportCsv(orgId, query);
    response
      .status(200)
      .type('text/csv')
      .set('Content-Disposition', 'attachment; filename="workflow-runs.csv"')
      .send(csv);
  }

  @Get('workflow-runs/:id')
  @ApiOperation({ summary: 'Get workflow run detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') orgId: string) {
    return this.workflowRunsService.findOne(id, orgId);
  }

  @Get('projects/:id/workflow-runs')
  @ApiOperation({ summary: 'Get workflow runs for a project' })
  findByProject(
    @Param('id', ParseUUIDPipe) projectId: string,
    @CurrentUser('organizationId') orgId: string,
    @Query() query: any,
  ) {
    return this.workflowRunsService.findByProject(projectId, orgId, query);
  }
}
