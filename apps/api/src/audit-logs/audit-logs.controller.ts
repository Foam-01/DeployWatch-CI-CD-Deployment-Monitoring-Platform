import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../common/guards/org.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { parseLimit } from '../common/utils/pagination';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('organizations/:orgId/audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List organization audit activity (owners and admins)' })
  findByOrganization(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('memberRole') role: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('resourceType') resourceType?: string,
  ) {
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Only owners and admins can view the audit log.');
    }
    return this.auditLogsService.findByOrganization(orgId, { limit: parseLimit(limit, 50), cursor, resourceType });
  }
}
