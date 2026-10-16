BEGIN;

CREATE TYPE "TaskVisibility" AS ENUM ('PRIVATE', 'SHARED');

-- Existing tasks keep their dates, completion state and order. No appointment
-- time is invented for legacy rows; visibility is a label, not access control.
ALTER TABLE "tasks"
  ADD COLUMN "start_minute" INTEGER,
  ADD COLUMN "duration_minutes" INTEGER,
  ADD COLUMN "visibility" "TaskVisibility" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "notes" VARCHAR(10000),
  ADD COLUMN "shared_with" VARCHAR(120),
  ADD CONSTRAINT "tasks_schedule_check" CHECK (
    ("start_minute" IS NULL AND "duration_minutes" IS NULL)
    OR (
      "start_minute" IS NOT NULL AND "duration_minutes" IS NOT NULL
      AND "start_minute" BETWEEN 0 AND 1439
      AND "duration_minutes" BETWEEN 1 AND 1440
      AND "start_minute" + "duration_minutes" <= 1440
    )
  );

CREATE INDEX "tasks_task_date_visibility_start_minute_idx"
  ON "tasks"("task_date", "visibility", "start_minute");

COMMIT;
