import { TaskVisibility } from '@prisma/client';

export const taskDetails = {
  startMinute: null,
  durationMinutes: null,
  visibility: TaskVisibility.PRIVATE,
  notes: null,
  sharedWith: null,
};
