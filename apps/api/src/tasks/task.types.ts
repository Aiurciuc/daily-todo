import { TaskVisibility } from '@prisma/client';

export interface TaskFilters {
  visibility?: TaskVisibility;
  completed?: boolean;
}

export interface TaskDetails {
  startMinute: number | null;
  durationMinutes: number | null;
  visibility: TaskVisibility;
  notes: string | null;
  sharedWith: string | null;
}
