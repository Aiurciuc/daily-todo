CREATE TABLE "tasks" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "task_date" DATE NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tasks_title_nonblank" CHECK (length(btrim("title")) > 0)
);

CREATE INDEX "tasks_task_date_idx" ON "tasks"("task_date");
