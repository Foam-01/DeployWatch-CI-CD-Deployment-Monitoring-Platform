import { Controller, Get, Post, Delete, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../auth/guards/org.guard';
import { RepositoriesService } from './repositories.service';
import { RepositoryProvider } from '@prisma/client';

@ApiTags('repositories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('projects/:projectId/repositories')
export class RepositoriesController {
  constructor(private readonly repositoriesService: RepositoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List repositories in project' })
  async findByProject(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.repositoriesService.findByProject(projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get repository details' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.repositoriesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Link repository to project' })
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: { fullName: string; externalRepoId: string; provider?: RepositoryProvider; defaultBranch?: string },
  ) {
    return this.repositoriesService.create({
      ...body,
      projectId,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Unlink repository' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.repositoriesService.remove(id);
  }
}
