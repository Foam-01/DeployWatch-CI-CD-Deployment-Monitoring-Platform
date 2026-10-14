import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../common/guards/org.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RepositoriesService } from './repositories.service';
import { CreateRepositoryDto } from './dto/create-repository.dto';
import { DiscoverRepositoriesDto } from './dto/discover-repositories.dto';

/** Only Owners and Admins may manage repository integrations. */
function assertIntegrationManager(role: string | undefined) {
  if (role !== 'OWNER' && role !== 'ADMIN') {
    throw new ForbiddenException('Only owners and admins can manage repository integrations.');
  }
}

@ApiTags('repositories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('projects/:projectId/repositories')
export class RepositoriesController {
  constructor(private readonly repositoriesService: RepositoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List repositories in project' })
  findByProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.repositoriesService.findByProject(projectId, organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get repository details' })
  findOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.repositoriesService.findOne(id, projectId, organizationId);
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Sync recent workflow runs from GitLab or Jenkins' })
  sync(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
  ) {
    assertIntegrationManager(role);
    return this.repositoriesService.sync(id, projectId, organizationId);
  }

  @Post('discover')
  @ApiOperation({ summary: 'Discover repositories or jobs from GitLab or Jenkins' })
  discover(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
    @Body() dto: DiscoverRepositoriesDto,
  ) {
    assertIntegrationManager(role);
    return this.repositoriesService.discover(projectId, organizationId, dto);
  }

  @Post()
  @ApiOperation({ summary: 'Link repository to project (returns webhook secret once)' })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
    @Body() dto: CreateRepositoryDto,
  ) {
    assertIntegrationManager(role);
    return this.repositoriesService.create(projectId, organizationId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Unlink repository' })
  remove(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
  ) {
    assertIntegrationManager(role);
    return this.repositoriesService.remove(id, projectId, organizationId);
  }
}
