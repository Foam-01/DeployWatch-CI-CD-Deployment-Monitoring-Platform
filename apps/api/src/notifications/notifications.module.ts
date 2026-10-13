import { Global, Module } from '@nestjs/common';
import { InAppNotificationsController, NotificationChannelsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotifierService } from './notifier.service';
import { NotificationDispatcherService, OUTBOUND_HTTP, safeOutboundHttp } from './notification-dispatcher.service';

/** Global so any domain module can emit events through NotifierService. */
@Global()
@Module({
  controllers: [NotificationChannelsController, InAppNotificationsController],
  providers: [
    NotificationsService,
    NotifierService,
    NotificationDispatcherService,
    { provide: OUTBOUND_HTTP, useValue: safeOutboundHttp },
  ],
  exports: [NotifierService, NotificationsService, NotificationDispatcherService],
})
export class NotificationsModule {}
