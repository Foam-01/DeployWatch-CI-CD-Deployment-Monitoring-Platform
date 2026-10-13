import { AlertEventType } from '@prisma/client';

/** A domain event worth telling people about. */
export interface NotificationEvent {
  organizationId: string;
  type: AlertEventType;
  /** Stable per real-world event so retries and redeliveries never notify twice. */
  eventKey: string;
  title: string;
  body?: string;
  /** App-relative path, e.g. /incidents/<id>. */
  link?: string;
}

const TITLE_PREFIX: Record<AlertEventType, string> = {
  WORKFLOW_FAILURE: '[FAILED]',
  DEPLOYMENT_FAILURE: '[DEPLOY FAILED]',
  SERVICE_DOWN: '[DOWN]',
  SERVICE_RECOVERED: '[RECOVERED]',
  INCIDENT_OPENED: '[INCIDENT]',
  INCIDENT_RESOLVED: '[RESOLVED]',
};

/** Slack incoming-webhook body. Links are absolute so they work from Slack. */
export function toSlackPayload(event: NotificationEvent, appUrl: string) {
  const link = event.link ? `<${appUrl}${event.link}|Open in DeployWatch>` : '';
  const lines = [`*${TITLE_PREFIX[event.type]} ${escapeSlack(event.title)}*`];
  if (event.body) lines.push(escapeSlack(event.body));
  if (link) lines.push(link);
  return { text: lines.join('\n') };
}

/** Generic webhook body: a small, documented, versioned JSON envelope. */
export function toWebhookPayload(event: NotificationEvent, appUrl: string, occurredAt: Date) {
  return {
    version: 1,
    event: event.type,
    eventKey: event.eventKey,
    title: event.title,
    body: event.body ?? null,
    url: event.link ? `${appUrl}${event.link}` : null,
    occurredAt: occurredAt.toISOString(),
  };
}

/** Slack treats &, < and > as control characters in mrkdwn. */
function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
