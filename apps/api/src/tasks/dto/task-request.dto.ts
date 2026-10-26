import { TaskVisibility } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ description: 'Calendar date in YYYY-MM-DD format', example: '2025-01-15' })
  @IsCalendarDay()
  date!: string;
}

export class TaskListQueryDto {
  @ApiPropertyOptional({ description: 'Calendar date in YYYY-MM-DD format', example: '2025-01-15' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsCalendarDay()
  date?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsCalendarDay()
  @ApiPropertyOptional({ description: 'Start of date range (YYYY-MM-DD)', example: '2025-01-01' })
  from?: string;

  @ApiPropertyOptional({ description: 'End of date range (YYYY-MM-DD)', example: '2025-01-31' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsCalendarDay()
  to?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(TaskVisibility)
  @ApiPropertyOptional({ enum: TaskVisibility })
  visibility?: TaskVisibility;

  @ApiPropertyOptional({ type: Boolean })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  completed?: boolean;
}

export class CreateTaskDto extends TaskDayQueryDto {
  @ApiProperty({ maxLength: 200, example: 'Buy groceries' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1439, nullable: true })
  startMinute?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 1440, nullable: true })
  durationMinutes?: number | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(TaskVisibility)
  @ApiPropertyOptional({ enum: TaskVisibility })
  visibility?: TaskVisibility;

  @ApiPropertyOptional({ type: String, maxLength: 10000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(254)
  @ApiPropertyOptional({
    type: String, maxLength: 254, nullable: true,
    description: "Registered recipient email, required for SHARED; ignored for PRIVATE",
  })
  sharedWith?: string | null;
}

export class ReorderTasksDto extends TaskDayQueryDto {
  @ApiProperty({ type: [Number], uniqueItems: true, example: [1, 2, 3] })
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  ids!: number[];
}

export class SetTaskCompletedDto {
  @ApiProperty({ type: Boolean })
  @IsBoolean()
  completed!: boolean;
}

export class TaskIdParamsDto {
  @ApiProperty({ type: Number, minimum: 1 })
  // Convert route text only. Body values deliberately use strict validation.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  @Max(2147483647)
  id!: number;
}
