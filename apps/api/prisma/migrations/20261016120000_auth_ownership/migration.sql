CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(120) NOT NULL,
  "email" VARCHAR(254) NOT NULL UNIQUE,
  "password_hash" TEXT NOT NULL
);
CREATE TABLE "sessions" (
  "token_hash" CHAR(64) PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
-- No default/backfill: legacy tasks stay unassigned and invisible.
ALTER TABLE "tasks" ADD COLUMN "owner_id" INTEGER REFERENCES "users"("id") ON DELETE RESTRICT;
CREATE INDEX "tasks_owner_id_task_date_idx" ON "tasks"("owner_id", "task_date");
