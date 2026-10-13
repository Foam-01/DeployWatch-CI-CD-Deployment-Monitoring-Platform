import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookEventProcessorService } from './webhook-event-processor.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookEventProcessorService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
