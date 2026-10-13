import { SecretBox } from '../../src/common/crypto/secret-box';
import { backoffMs } from '../../src/webhooks/webhook-inbox.service';

const KEY = 'a'.repeat(64);

describe('SecretBox (AES-256-GCM)', () => {
  const box = new SecretBox(KEY);

  it('round-trips a secret and never stores the plaintext', () => {
    const sealed = box.encrypt('whsec_123');
    expect(sealed).toMatch(/^enc:v1:/);
    expect(sealed).not.toContain('whsec_123');
    expect(box.decrypt(sealed)).toBe('whsec_123');
  });

  it('uses a fresh IV, so the same secret encrypts differently each time', () => {
    expect(box.encrypt('same')).not.toBe(box.encrypt('same'));
  });

  it('rejects ciphertext that was tampered with', () => {
    const sealed = box.encrypt('whsec_123');
    const parts = sealed.split(':');
    const ct = Buffer.from(parts[4], 'base64url');
    ct[0] ^= 0xff;
    parts[4] = ct.toString('base64url');
    expect(() => box.decrypt(parts.join(':'))).toThrow();
  });

  it('cannot decrypt with a different key', () => {
    const sealed = box.encrypt('whsec_123');
    expect(() => new SecretBox('b'.repeat(64)).decrypt(sealed)).toThrow();
  });

  it('reads legacy plaintext values unchanged', () => {
    expect(box.decrypt('whsec_legacy')).toBe('whsec_legacy');
  });

  it.each([undefined, '', 'short', 'z'.repeat(64)])('refuses invalid key %p at startup', (key) => {
    expect(() => new SecretBox(key)).toThrow(/ENCRYPTION_KEY/);
  });
});

describe('webhook retry backoff', () => {
  it('doubles from 30s and caps at one hour', () => {
    expect([1, 2, 3, 4, 5].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000, 480_000]);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});
