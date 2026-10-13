import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Encrypts secrets at rest (e.g. webhook secrets) with AES-256-GCM.
 *
 * Stored format: `enc:v1:<iv>:<authTag>:<ciphertext>` (base64url parts). The
 * version prefix allows key/algorithm rotation later, and values without the
 * prefix are treated as legacy plaintext so existing rows keep working until
 * `npm run secrets:encrypt` re-encrypts them.
 */
const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export class SecretBox {
  private readonly key: Buffer;

  constructor(hexKey: string | undefined) {
    if (!hexKey || !/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error(
        'ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate one with: ' +
          `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
      );
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  static isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + [iv, tag, ciphertext].map((b) => b.toString('base64url')).join(':');
  }

  /** Throws if the value was tampered with or encrypted under a different key. */
  decrypt(stored: string): string {
    if (!SecretBox.isEncrypted(stored)) return stored; // legacy plaintext
    const [iv, tag, ciphertext] = stored.slice(PREFIX.length).split(':').map((p) => Buffer.from(p, 'base64url'));
    if (!iv || !tag || !ciphertext) throw new Error('Malformed encrypted secret.');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
