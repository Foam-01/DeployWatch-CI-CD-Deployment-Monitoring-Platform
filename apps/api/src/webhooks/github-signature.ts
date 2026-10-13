import * as crypto from 'crypto';

/**
 * Verifies GitHub's `X-Hub-Signature-256` header against the raw request body.
 * Uses a constant-time comparison so response timing does not leak the expected digest.
 */
export function verifyGitHubSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signature || !signature.startsWith('sha256=')) return false;

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);

  return expectedBuf.length === signatureBuf.length && crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
