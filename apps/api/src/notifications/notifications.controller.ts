import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgGuard } from '../auth/guards/org.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationChannelType } from '@prisma/client';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('organizations/:orgId/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('channels')
  @ApiOperation({ summary: 'List notification channels' })
  async findChannels(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.notificationsService.findChannels(orgId);
  }

  @Post('channels')
  @ApiOperation({ summary: 'Create notification channel' })
  async createChannel(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { name: string; type: NotificationChannelType; configEncrypted: string },
  ) {
    return this.notificationsService.createChannel({
      organizationId: orgId,
      createdById: userId,
      ...body,
    });
  }

  @Patch('channels/:id')
  @ApiOperation({ summary: 'Update notification channel' })
  async updateChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name?: string; enabled?: boolean; configEncrypted?: string },
  ) {
    return this.notificationsService.updateChannel(id, body);
  }

  @Delete('channels/:id')
  @ApiOperation({ summary: 'Delete notification channel' })
  async deleteChannel(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.deleteChannel(id);
  }

  @Post('channels/:id/test')
  @ApiOperation({ summary: 'Send test alert notification' })
  async sendTestNotification(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.sendTestNotification(id);
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'List notification delivery logs' })
  async findDeliveries(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.notificationsService.findDeliveries(orgId);
  }
}
