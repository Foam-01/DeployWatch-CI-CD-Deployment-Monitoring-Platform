import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../auth/guards/org.guard';
import { MembershipsService } from './memberships.service';
import { MemberRole } from '@prisma/client';

@ApiTags('memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('organizations/:orgId/memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  @ApiOperation({ summary: 'List organization members' })
  async findAll(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.membershipsService.findByOrganization(orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Invite or add a user to organization' })
  async addMember(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body('email') email: string,
    @Body('role') role?: MemberRole,
  ) {
    return this.membershipsService.addMember(orgId, email, role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update member role' })
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('role') role: MemberRole,
  ) {
    return this.membershipsService.updateRole(id, role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove member from organization' })
  async removeMember(@Param('id', ParseUUIDPipe) id: string) {
    return this.membershipsService.removeMember(id);
  }
}
