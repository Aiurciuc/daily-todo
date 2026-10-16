ALTER TABLE "tasks" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Preserve the existing ID-based order for each day.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "task_date" ORDER BY "id") - 1 AS "position"
  FROM "tasks"
)
UPDATE "tasks" SET "position" = ranked."position" FROM ranked WHERE "tasks"."id" = ranked."id";
