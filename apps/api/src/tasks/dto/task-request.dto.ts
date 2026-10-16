import { TaskVisibility } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDay } from '../task-date';

export class TaskDayQueryDto {
  @IsCalendarDay()
  date!: string;
}

export class TaskListQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsCalendarDay()
  date?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsCalendarDay()
  from?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsCalendarDay()
  to?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(TaskVisibility)
  visibility?: TaskVisibility;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  completed?: boolean;
}

export class CreateTaskDto extends TaskDayQueryDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(TaskVisibility)
  visibility?: TaskVisibility;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(120)
  sharedWith?: string | null;
}

export class ReorderTasksDto extends TaskDayQueryDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  ids!: number[];
}

export class SetTaskCompletedDto {
  @IsBoolean()
  completed!: boolean;
}

export class TaskIdParamsDto {
  // Convert route text only. Body values deliberately use strict validation.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id!: number;
}
