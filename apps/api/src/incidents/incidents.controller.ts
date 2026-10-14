import { Controller, Get, Post, Param, Query, Body, UseGuards, ParseUUIDPipe, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IncidentSeverity, IncidentStatus } from '@prisma/client';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../common/guards/org.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { assertWritableRole } from '../common/utils/assert-writable-role';
import { IncidentsService } from './incidents.service';
import { IncidentExportQueryDto } from './dto/incident-export-query.dto';

@ApiTags('incidents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @ApiOperation({ summary: 'List incidents' })
  findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query('status') status?: IncidentStatus,
    @Query('severity') severity?: IncidentSeverity,
  ) {
    return this.incidentsService.findAll(organizationId, status, severity);
  }

  @Get('export.csv')
  @ApiOperation({ summary: 'Export incidents as CSV' })
  async exportCsv(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: IncidentExportQueryDto,
    @Res() response: Response,
  ) {
    const csv = await this.incidentsService.exportCsv(organizationId, query);
    response.status(200).type('text/csv').set('Content-Disposition', 'attachment; filename="incidents.csv"').send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get incident details' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') organizationId: string) {
    return this.incidentsService.findOne(id, organizationId);
  }

  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge incident' })
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
    @CurrentUser('sub') userId: string,
  ) {
    assertWritableRole(role);
    return this.incidentsService.acknowledge(id, organizationId, userId);
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Resolve incident' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
    @CurrentUser('sub') userId: string,
    @Body('message') message?: string,
  ) {
    assertWritableRole(role);
    return this.incidentsService.resolve(id, organizationId, userId, message);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'Get incident event timeline' })
  getEvents(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organizationId') organizationId: string) {
    return this.incidentsService.getEvents(id, organizationId);
  }
}
