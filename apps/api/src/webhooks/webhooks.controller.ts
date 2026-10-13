import {
  Controller,
  Post,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../common/decorators/roles.decorator';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * GitHub Webhook endpoint.
   * Must be public — signature validation is performed inside the service.
   */
  @Public()
  @Post('github/:repositoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive GitHub webhook events' })
  async handleGitHub(
    @Param('repositoryId') repositoryId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const deliveryId = req.headers['x-github-delivery'] as string;
    const eventType = req.headers['x-github-event'] as string;
    const signature = req.headers['x-hub-signature-256'] as string;

    if (!deliveryId || !eventType) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Missing required GitHub headers.',
      });
    }

    // Read raw body for signature verification
    const rawBody = (req as any).rawBody as Buffer;

    try {
      await this.webhooksService.handleGitHubEvent({
        repositoryId,
        deliveryId,
        eventType,
        signature,
        rawBody,
        payload: req.body,
      });

      // Always acknowledge quickly
      return res.status(HttpStatus.OK).json({ received: true });
    } catch (error: any) {
      this.logger.error(`Webhook error for delivery ${deliveryId}: ${error.message}`);

      if (error.message === 'DUPLICATE_EVENT') {
        return res.status(HttpStatus.OK).json({ received: true, duplicate: true });
      }

      if (error.message === 'INVALID_SIGNATURE') {
        return res.status(HttpStatus.UNAUTHORIZED).json({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Invalid webhook signature.',
        });
      }

      // Don't expose internal errors — always return 200 to prevent GitHub retries for our bugs
      return res.status(HttpStatus.OK).json({ received: true });
    }
  }
}
