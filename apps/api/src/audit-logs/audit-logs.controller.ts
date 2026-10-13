import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../auth/guards/org.guard';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('organizations/:orgId/audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List organization audit activity logs' })
  async findByOrganization(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditLogsService.findByOrganization(orgId, limit ? parseInt(limit, 10) : 50);
  }
}
