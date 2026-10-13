import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookEventProcessorService } from './webhook-event-processor.service';
import { WebhookInboxService } from './webhook-inbox.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookEventProcessorService, WebhookInboxService],
  exports: [WebhooksService, WebhookInboxService],
})
export class WebhooksModule {}
