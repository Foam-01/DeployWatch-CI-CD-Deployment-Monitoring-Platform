ALTER TYPE "RepositoryProvider" ADD VALUE 'GITLAB';
ALTER TYPE "RepositoryProvider" ADD VALUE 'JENKINS';

ALTER TABLE "repositories"
ADD COLUMN "integration_url" TEXT;
