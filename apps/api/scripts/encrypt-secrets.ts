/**
 * One-off migration: encrypts webhook secrets that were stored as plaintext before
 * encryption at rest was introduced. Safe to run repeatedly (already-encrypted rows
 * are skipped).
 *
 *   npm run secrets:encrypt -w apps/api
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { SecretBox } from '../src/common/crypto/secret-box';

config();

async function main() {
  const box = new SecretBox(process.env.ENCRYPTION_KEY);
  const prisma = new PrismaClient();
  try {
    const repos = await prisma.repository.findMany({
      where: { webhookSecret: { not: null } },
      select: { id: true, webhookSecret: true },
    });
    const legacy = repos.filter((r) => r.webhookSecret && !SecretBox.isEncrypted(r.webhookSecret));
    for (const repo of legacy) {
      await prisma.repository.update({
        where: { id: repo.id },
        data: { webhookSecret: box.encrypt(repo.webhookSecret!) },
      });
    }
    console.log(`Encrypted ${legacy.length} of ${repos.length} webhook secret(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
