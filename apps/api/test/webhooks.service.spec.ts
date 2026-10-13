import * as crypto from 'crypto';

describe('Webhooks HMAC Signature Verification & Security', () => {
  const secret = 'test_webhook_secret_key_123';
  const payload = JSON.stringify({
    action: 'completed',
    workflow_run: {
      id: 84729101,
      name: 'Deploy Production',
      status: 'completed',
      conclusion: 'success',
    },
  });

  function generateSignature(body: string, key: string): string {
    const hmac = crypto.createHmac('sha256', key);
    return `sha256=${hmac.update(body).digest('hex')}`;
  }

  function verifySignature(body: string, signature: string, key: string): boolean {
    if (!signature || !signature.startsWith('sha256=')) {
      return false;
    }
    const expected = generateSignature(body, key);
    const sigBuffer = Buffer.from(signature);
    const expBuffer = Buffer.from(expected);

    if (sigBuffer.length !== expBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuffer, expBuffer);
  }

  it('should accept valid HMAC-SHA256 signature generated with matching secret', () => {
    const validSignature = generateSignature(payload, secret);
    const result = verifySignature(payload, validSignature, secret);
    expect(result).toBe(true);
  });

  it('should reject signature generated with mismatched secret key', () => {
    const wrongSignature = generateSignature(payload, 'wrong_key');
    const result = verifySignature(payload, wrongSignature, secret);
    expect(result).toBe(false);
  });

  it('should reject tampered payload even with original signature', () => {
    const validSignature = generateSignature(payload, secret);
    const tamperedPayload = payload + ' ';
    const result = verifySignature(tamperedPayload, validSignature, secret);
    expect(result).toBe(false);
  });

  it('should reject missing or malformed signature prefixes', () => {
    expect(verifySignature(payload, '', secret)).toBe(false);
    expect(verifySignature(payload, 'invalid_format', secret)).toBe(false);
  });
});
