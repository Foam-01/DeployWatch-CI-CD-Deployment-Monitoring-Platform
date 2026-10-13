import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { assertWritableRole } from '../common/utils/assert-writable-role';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { OrgGuard } from '../common/guards/org.guard';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List projects in organization' })
  findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() query: ProjectQueryDto,
  ) {
    return this.projectsService.findAll(organizationId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  create(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
    @Body() dto: CreateProjectDto,
  ) {
    assertWritableRole(role);
    return this.projectsService.create(organizationId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project details' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.projectsService.findOne(id, organizationId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
    @Body() dto: UpdateProjectDto,
  ) {
    assertWritableRole(role);
    return this.projectsService.update(id, organizationId, dto);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive project' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
  ) {
    assertWritableRole(role);
    return this.projectsService.archive(id, organizationId);
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: 'Get project metrics' })
  getMetrics(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.projectsService.getMetrics(id, organizationId);
  }

  @Post(':id/environments')
  @ApiOperation({ summary: 'Add an environment (name must match the GitHub Environment)' })
  createEnvironment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
    @Body() dto: CreateEnvironmentDto,
  ) {
    assertWritableRole(role);
    return this.projectsService.createEnvironment(id, organizationId, dto);
  }

  @Delete(':id/environments/:environmentId')
  @ApiOperation({ summary: 'Remove an environment that has no deployments' })
  deleteEnvironment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('environmentId', ParseUUIDPipe) environmentId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('memberRole') role: string,
  ) {
    assertWritableRole(role);
    return this.projectsService.deleteEnvironment(id, environmentId, organizationId);
  }
}
