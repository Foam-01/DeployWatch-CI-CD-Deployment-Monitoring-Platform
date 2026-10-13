import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsUUID, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgGuard } from '../common/guards/org.guard';
import { parseLimit } from '../common/utils/pagination';
import { CreateChannelDto, UpdateChannelDto } from './dto/channel.dto';
import { NotificationsService } from './notifications.service';

class MarkReadDto {
  /** Omit to mark everything read. */
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids?: string[];
}

/** Channels and delivery history — owners and admins (checked in the service). */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('organizations/:orgId/notifications')
export class NotificationChannelsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('channels')
  @ApiOperation({ summary: 'List notification channels (destinations are masked)' })
  findChannels(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('memberRole') role: string,
  ) {
    return this.notifications.findChannels(orgId, { userId, role });
  }

  @Post('channels')
  @ApiOperation({ summary: 'Add a Slack or webhook channel' })
  createChannel(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('memberRole') role: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.notifications.createChannel(orgId, { userId, role }, dto);
  }

  @Patch('channels/:id')
  @ApiOperation({ summary: 'Rename, enable/disable, change events or destination' })
  updateChannel(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('memberRole') role: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.notifications.updateChannel(orgId, { userId, role }, id, dto);
  }

  @Delete('channels/:id')
  @ApiOperation({ summary: 'Delete a channel and its delivery history' })
  deleteChannel(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('memberRole') role: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.deleteChannel(orgId, { userId, role }, id);
  }

  @Post('channels/:id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a real test message and return the delivery result' })
  sendTest(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('memberRole') role: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.sendTest(orgId, { userId, role }, id);
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Delivery history with status, attempts and last error' })
  findDeliveries(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('memberRole') role: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('status') status?: string,
  ) {
    return this.notifications.findDeliveries(orgId, { userId, role }, { limit: parseLimit(limit, 50), cursor, status });
  }
}

/** The signed-in user's in-app notifications for their active organization. */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('notifications')
export class InAppNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List in-app notifications' })
  list(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('unread') unread?: string,
  ) {
    return this.notifications.findForUser(orgId, userId, { limit: parseLimit(limit, 30), cursor, unread: unread === 'true' });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications (for the bell badge)' })
  unreadCount(@CurrentUser('organizationId') orgId: string, @CurrentUser('sub') userId: string) {
    return this.notifications.unreadCount(orgId, userId);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notifications read (all when ids is omitted)' })
  markRead(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.notifications.markRead(orgId, userId, dto.ids ?? 'all');
  }
}
