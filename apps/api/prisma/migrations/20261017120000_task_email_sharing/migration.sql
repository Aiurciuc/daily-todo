-- Legacy shared_with labels are deliberately NOT resolved into recipient grants.
ALTER TABLE "tasks" ALTER COLUMN "shared_with" TYPE VARCHAR(254);
ALTER TABLE "tasks" ADD COLUMN "recipient_id" INTEGER;
CREATE INDEX "tasks_recipient_id_task_date_idx" ON "tasks"("recipient_id", "task_date");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
