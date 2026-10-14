import { Module } from '@nestjs/common';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [WebhooksModule],
  controllers: [RepositoriesController],
  providers: [RepositoriesService],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
