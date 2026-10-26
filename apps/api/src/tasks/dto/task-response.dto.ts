import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { Task, TaskVisibility } from '@prisma/client';

@Exclude()
export class TaskResponseDto {
  @ApiProperty({ type: Number, example: 1 })
  @Expose()
  readonly id: number;

  @ApiProperty({ example: 'Buy groceries' })
  @Expose()
  readonly title: string;

  @ApiProperty({ example: '2025-01-15', description: 'Calendar date in YYYY-MM-DD format' })
  @Expose()
  readonly date: string;

  @ApiProperty({ type: Boolean })
  @Expose()
  readonly completed: boolean;

  @ApiProperty({ type: Number, nullable: true, example: 540 })
  @Expose()
  readonly startMinute: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 60 })
  @Expose()
  readonly durationMinutes: number | null;

  @ApiProperty({ enum: TaskVisibility })
  @Expose()
  readonly visibility: TaskVisibility;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  readonly notes: string | null;

  @ApiProperty({ type: String, nullable: true })
  @Expose()
  readonly sharedWith: string | null;

  @ApiProperty({ type: Boolean, description: "Only the owner can modify this task" })
  @Expose()
  readonly canEdit: boolean;

  constructor(task: Task, actorId: number) {
    this.canEdit = task.ownerId === actorId;
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
