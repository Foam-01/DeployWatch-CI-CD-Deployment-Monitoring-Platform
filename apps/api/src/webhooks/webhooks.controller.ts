import {
  Controller,
  Post,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common/interfaces';
import { Request } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/roles.decorator';
import { InvalidWebhookSignatureError, WebhooksService } from './webhooks.service';
import { RepositoryProvider } from '@prisma/client';

@ApiTags('webhooks')
@SkipThrottle({ short: true, medium: true, long: true })
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * GitHub webhook endpoint. Public because GitHub cannot send a user token;
   * authenticity is proven by the HMAC signature instead.
   */
  @Public()
  @Post('github/:repositoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive GitHub webhook events' })
  async handleGitHub(@Param('repositoryId', ParseUUIDPipe) repositoryId: string, @Req() req: RawBodyRequest<Request>) {
    const deliveryId = req.header('x-github-delivery');
    const eventType = req.header('x-github-event');

    if (!deliveryId || !eventType) {
      throw new BadRequestException('Missing required GitHub headers.');
    }

    try {
      const result = await this.webhooksService.handleGitHubEvent({
        repositoryId,
        deliveryId,
        eventType,
        signature: req.header('x-hub-signature-256'),
        rawBody: req.rawBody,
        payload: req.body,
      });
      // A processing failure is our bug, not GitHub's: acknowledge with 2xx so GitHub
      // does not retry, and rely on the stored FAILED inbox row for reprocessing.
      return { received: true, duplicate: result === 'duplicate' };
    } catch (err) {
      if (err instanceof InvalidWebhookSignatureError) {
        throw new UnauthorizedException('Invalid webhook signature.');
      }
      throw err;
    }
  }

  @Public()
  @Post('gitlab/:repositoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive GitLab webhook events' })
  async handleGitLab(
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-gitlab-token') token?: string,
    @Headers('x-gitlab-event') eventType?: string,
    @Headers('x-gitlab-event-uuid') eventId?: string,
  ) {
    if (!eventType) throw new BadRequestException('Missing required GitLab event header.');
    return this.handleProvider(repositoryId, req, 'GITLAB', eventType, token, eventId);
  }

  @Public()
  @Post('jenkins/:repositoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive signed Jenkins Generic Webhook Trigger events' })
  async handleJenkins(
    @Param('repositoryId', ParseUUIDPipe) repositoryId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-deploywatch-signature') signature?: string,
    @Headers('x-deploywatch-event') eventType?: string,
    @Headers('x-deploywatch-delivery') deliveryId?: string,
  ) {
    if (!eventType) throw new BadRequestException('Missing required Jenkins event header.');
    return this.handleProvider(repositoryId, req, 'JENKINS', eventType, signature, deliveryId);
  }

  private async handleProvider(
    repositoryId: string,
    req: RawBodyRequest<Request>,
    provider: RepositoryProvider,
    eventType: string,
    secret: string | undefined,
    suppliedDeliveryId?: string,
  ) {
    try {
      const result = await this.webhooksService.handleProviderEvent({
        provider,
        repositoryId,
        deliveryId: WebhooksService.deliveryId(req.rawBody, suppliedDeliveryId),
        eventType,
        secret,
        rawBody: req.rawBody,
        payload: req.body,
      });
      return { received: true, duplicate: result === 'duplicate' };
    } catch (err) {
      if (err instanceof InvalidWebhookSignatureError) {
        throw new UnauthorizedException('Invalid webhook authentication.');
      }
      throw err;
    }
  }
}
