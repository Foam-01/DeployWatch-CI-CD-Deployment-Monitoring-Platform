import { BadRequestException } from '@nestjs/common';
import { NotificationChannelType } from '@prisma/client';

/** Channel types that can actually deliver today. EMAIL needs SMTP, which is not configured yet. */
export const SUPPORTED_CHANNEL_TYPES = ['SLACK', 'WEBHOOK'] as const;
export type SupportedChannelType = (typeof SUPPORTED_CHANNEL_TYPES)[number];

export interface ChannelConfig {
  url: string;
}

/**
 * Validates a channel destination before it is encrypted and stored.
 * Slack is pinned to Slack's incoming-webhook host, so a "Slack" channel can never be
 * pointed at an internal service; generic webhooks go through the SSRF guard at send time.
 */
export function parseChannelConfig(type: NotificationChannelType, url: unknown): ChannelConfig {
  if (typeof url !== 'string' || url.length > 2048) throw new BadRequestException('url is required.');
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new BadRequestException('url must be a valid URL.');
  }

  if (type === 'SLACK') {
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'hooks.slack.com' || !parsed.pathname.startsWith('/services/')) {
      throw new BadRequestException('Slack channels need an incoming webhook URL (https://hooks.slack.com/services/…).');
    }
  } else if (type === 'WEBHOOK') {
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException('Webhook url must use http or https.');
    }
  } else {
    throw new BadRequestException(`Channel type ${type} is not supported yet.`);
  }
  return { url: parsed.toString() };
}

/** Shows enough of the destination to recognise it, never the secret token in the path. */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    const tail = u.pathname.slice(-4);
    return `${u.protocol}//${u.host}/…${tail}`;
  } catch {
    return '…';
  }
}

/** Reads stored config; seeded legacy rows used { webhookUrl }. */
export function readStoredConfig(json: string): ChannelConfig {
  const value = JSON.parse(json) as { url?: string; webhookUrl?: string };
  const url = value.url ?? value.webhookUrl;
  if (!url) throw new Error('Channel has no destination configured.');
  return { url };
}
