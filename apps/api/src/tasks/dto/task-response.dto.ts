import { Exclude, Expose } from 'class-transformer';
import { Task, TaskVisibility } from '@prisma/client';

@Exclude()
export class TaskResponseDto {
  @Expose()
  readonly id: number;

  @Expose()
  readonly title: string;

  @Expose()
  readonly date: string;

  @Expose()
  readonly completed: boolean;

  @Expose()
  readonly startMinute: number | null;

  @Expose()
  readonly durationMinutes: number | null;

  @Expose()
  readonly visibility: TaskVisibility;

  @Expose()
  readonly notes: string | null;

  @Expose()
  readonly sharedWith: string | null;

  constructor(task: Task) {
    this.id = task.id;
    this.title = task.title;
    this.date = task.date.toISOString().slice(0, 10);
    this.completed = task.completed;
    this.startMinute = task.startMinute;
    this.durationMinutes = task.durationMinutes;
    this.visibility = task.visibility;
    this.notes = task.notes;
    this.sharedWith = task.sharedWith;
  }
}
