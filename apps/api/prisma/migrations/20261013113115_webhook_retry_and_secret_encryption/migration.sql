-- AlterTable
ALTER TABLE "webhook_events" ADD COLUMN     "locked_at" TIMESTAMPTZ,
ADD COLUMN     "next_attempt_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "webhook_events_processing_status_next_attempt_at_idx" ON "webhook_events"("processing_status", "next_attempt_at");
