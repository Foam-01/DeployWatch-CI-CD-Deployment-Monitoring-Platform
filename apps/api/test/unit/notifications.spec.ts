import { maskUrl, parseChannelConfig } from '../../src/notifications/channel-config';
import { classifyStatus } from '../../src/notifications/notification-dispatcher.service';
import { toSlackPayload, toWebhookPayload } from '../../src/notifications/notification-events';

describe('channel config validation', () => {
  it('accepts a Slack incoming webhook URL', () => {
    expect(parseChannelConfig('SLACK', 'https://hooks.slack.com/services/T1/B2/abc').url).toBe(
      'https://hooks.slack.com/services/T1/B2/abc',
    );
  });

  it.each([
    'http://hooks.slack.com/services/T1/B2/abc', // not https
    'https://hooks.slack.com.evil.example/services/x', // look-alike host
    'https://evil.example/hooks.slack.com/services/x',
    'https://hooks.slack.com/api/other', // wrong path
    'http://169.254.169.254/latest/meta-data',
  ])('pins Slack channels to hooks.slack.com: rejects %s', (url) => {
    expect(() => parseChannelConfig('SLACK', url)).toThrow(/hooks\.slack\.com/);
  });

  it('accepts http(s) webhooks and rejects other schemes', () => {
    expect(parseChannelConfig('WEBHOOK', 'https://ops.example.com/hook').url).toBe('https://ops.example.com/hook');
    expect(() => parseChannelConfig('WEBHOOK', 'file:///etc/passwd')).toThrow();
    expect(() => parseChannelConfig('WEBHOOK', 'not a url')).toThrow();
  });

  it('refuses channel types that cannot deliver yet', () => {
    expect(() => parseChannelConfig('EMAIL', 'https://example.com')).toThrow(/not supported/);
  });

  it('masks the secret part of a destination', () => {
    const masked = maskUrl('https://hooks.slack.com/services/T1/B2/SuperSecretToken');
    expect(masked).toBe('https://hooks.slack.com/…oken');
    expect(masked).not.toContain('SuperSecret');
  });
});

describe('delivery outcome classification', () => {
  it.each([
    [200, true, undefined],
    [204, true, undefined],
    [500, false, true],
    [503, false, true],
    [429, false, true],
    [408, false, true],
    [400, false, false],
    [404, false, false],
    [410, false, false],
  ])('HTTP %i → ok=%p retryable=%p', (status, ok, retryable) => {
    const outcome = classifyStatus(status);
    expect(outcome.ok).toBe(ok);
    if (!outcome.ok) expect(outcome.retryable).toBe(retryable);
  });
});

describe('outbound payloads', () => {
  const event = {
    organizationId: 'org',
    type: 'WORKFLOW_FAILURE' as const,
    eventKey: 'workflow_failure:1',
    title: 'CI #1 failed <script>',
    body: 'main & friends',
    link: '/workflow-runs/1',
  };

  it('Slack text escapes control characters and links back to the app', () => {
    const { text } = toSlackPayload(event, 'https://deploywatch.example');
    expect(text).toContain('[FAILED] CI #1 failed &lt;script&gt;');
    expect(text).toContain('main &amp; friends');
    expect(text).toContain('<https://deploywatch.example/workflow-runs/1|Open in DeployWatch>');
  });

  it('generic webhook envelope is versioned and uses absolute URLs', () => {
    const body = toWebhookPayload(event, 'https://deploywatch.example', new Date('2026-10-13T10:00:00Z'));
    expect(body).toEqual({
      version: 1,
      event: 'WORKFLOW_FAILURE',
      eventKey: 'workflow_failure:1',
      title: 'CI #1 failed <script>',
      body: 'main & friends',
      url: 'https://deploywatch.example/workflow-runs/1',
      occurredAt: '2026-10-13T10:00:00.000Z',
    });
  });
});
