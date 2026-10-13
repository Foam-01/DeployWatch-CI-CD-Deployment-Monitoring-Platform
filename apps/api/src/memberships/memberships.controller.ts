import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MemberRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../common/guards/org.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MembershipsService } from './memberships.service';
import { AddMemberDto, UpdateMemberRoleDto } from './dto/membership.dto';

/** OrgGuard verifies the caller belongs to :orgId and attaches their role. */
@ApiTags('memberships')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('organizations/:orgId/memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  @ApiOperation({ summary: 'List organization members' })
  findAll(@CurrentUser('organizationId') orgId: string) {
    return this.membershipsService.findByOrganization(orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Add an existing user to the organization' })
  addMember(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('memberRole') role: MemberRole,
    @Body() dto: AddMemberDto,
  ) {
    return this.membershipsService.addMember(orgId, { userId, role }, dto.email, dto.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change a member role' })
  updateRole(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('memberRole') role: MemberRole,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.membershipsService.updateRole(orgId, { userId, role }, id, dto.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a member from the organization' })
  removeMember(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('memberRole') role: MemberRole,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.removeMember(orgId, { userId, role }, id);
  }
}
