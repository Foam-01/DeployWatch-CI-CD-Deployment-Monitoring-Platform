-- AlterTable
ALTER TABLE "notification_channels" ADD COLUMN     "events" "AlertEventType"[] DEFAULT ARRAY[]::"AlertEventType"[];

-- AlterTable
ALTER TABLE "notification_deliveries" ADD COLUMN     "locked_at" TIMESTAMPTZ,
ADD COLUMN     "next_attempt_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "event_type" "AlertEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_reads" (
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id","user_id")
);

-- CreateIndex
CREATE INDEX "notifications_organization_id_created_at_idx" ON "notifications"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_organization_id_event_key_key" ON "notifications"("organization_id", "event_key");

-- CreateIndex
CREATE INDEX "notification_reads_user_id_idx" ON "notification_reads"("user_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_next_attempt_at_idx" ON "notification_deliveries"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
