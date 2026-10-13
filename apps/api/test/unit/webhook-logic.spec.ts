import * as crypto from 'crypto';
import { verifyGitHubSignature } from '../../src/webhooks/github-signature';
import {
  mapWorkflowConclusion,
  mapWorkflowStatus,
  shouldApplyStatus,
} from '../../src/webhooks/workflow-run-state';

describe('verifyGitHubSignature', () => {
  const secret = 'webhook-secret';
  const body = Buffer.from(JSON.stringify({ action: 'completed', workflow_run: { id: 1 } }));
  const sign = (b: Buffer, key = secret) => `sha256=${crypto.createHmac('sha256', key).update(b).digest('hex')}`;

  it('accepts a signature made with the shared secret', () => {
    expect(verifyGitHubSignature(body, sign(body), secret)).toBe(true);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifyGitHubSignature(body, sign(body, 'other'), secret)).toBe(false);
  });

  it('rejects when a single byte of the body changed', () => {
    const tampered = Buffer.from(body.toString().replace('"id":1', '"id":2'));
    expect(verifyGitHubSignature(tampered, sign(body), secret)).toBe(false);
  });

  it('rejects re-serialized JSON with different whitespace (must use the raw body)', () => {
    const pretty = Buffer.from(JSON.stringify(JSON.parse(body.toString()), null, 2));
    expect(verifyGitHubSignature(pretty, sign(body), secret)).toBe(false);
  });

  it.each([
    ['missing signature', undefined],
    ['empty signature', ''],
    ['legacy sha1 header', 'sha1=abc'],
    ['wrong length', 'sha256=abc'],
  ])('rejects %s without throwing', (_label, signature) => {
    expect(verifyGitHubSignature(body, signature, secret)).toBe(false);
  });

  it('rejects when the raw body is unavailable', () => {
    expect(verifyGitHubSignature(undefined, sign(body), secret)).toBe(false);
  });
});

describe('workflow run state mapping', () => {
  it.each([
    ['queued', 'QUEUED'],
    ['waiting', 'QUEUED'],
    ['requested', 'QUEUED'],
    ['in_progress', 'IN_PROGRESS'],
    ['completed', 'COMPLETED'],
    [undefined, 'QUEUED'],
  ])('maps GitHub status %s → %s', (input, expected) => {
    expect(mapWorkflowStatus(input)).toBe(expected);
  });

  it.each([
    ['success', 'SUCCESS'],
    ['failure', 'FAILURE'],
    ['cancelled', 'CANCELLED'],
    ['timed_out', 'TIMED_OUT'],
    ['startup_failure', 'FAILURE'],
    ['something_new', 'FAILURE'],
    [null, null],
  ])('maps GitHub conclusion %s → %s', (input, expected) => {
    expect(mapWorkflowConclusion(input)).toBe(expected);
  });

  it('only allows forward transitions, so late events cannot roll a run back', () => {
    expect(shouldApplyStatus('QUEUED', 'IN_PROGRESS')).toBe(true);
    expect(shouldApplyStatus('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(shouldApplyStatus('QUEUED', 'COMPLETED')).toBe(true);
    expect(shouldApplyStatus('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(shouldApplyStatus('COMPLETED', 'QUEUED')).toBe(false);
    expect(shouldApplyStatus('IN_PROGRESS', 'IN_PROGRESS')).toBe(false);
  });
});
