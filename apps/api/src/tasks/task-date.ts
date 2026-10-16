import { BadRequestException } from '@nestjs/common';
import { ValidateBy, ValidationOptions } from 'class-validator';

export function isCalendarDay(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.startsWith('0000-')
  ) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function IsCalendarDay(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isCalendarDay',
      validator: {
        validate: isCalendarDay,
        defaultMessage: () => 'date must be a valid YYYY-MM-DD calendar date',
      },
    },
    options,
  );
}

export function parseDay(value: string): Date {
  if (!isCalendarDay(value)) {
    throw new BadRequestException('date must be a valid YYYY-MM-DD calendar date');
  }
  return new Date(`${value}T00:00:00.000Z`);
}
