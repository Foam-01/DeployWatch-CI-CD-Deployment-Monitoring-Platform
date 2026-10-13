import { Body, Controller, ForbiddenException, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationsService } from './organizations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgGuard } from '../common/guards/org.guard';

export class UpdateOrganizationDto {
  @ApiProperty({ example: 'Acme Cloud Platform' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current organization' })
  getCurrent(@CurrentUser('organizationId') orgId: string) {
    return this.organizationsService.findOne(orgId);
  }

  /** :orgId is checked by OrgGuard against the caller's memberships. */
  @Patch(':orgId')
  @ApiOperation({ summary: 'Rename organization (owner only)' })
  update(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('memberRole') role: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    if (role !== 'OWNER') throw new ForbiddenException('Only owners can change organization settings.');
    return this.organizationsService.update(orgId, userId, dto);
  }
}
