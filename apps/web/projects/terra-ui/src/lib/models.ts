export interface TerraAvatar {
  initials: string;
  name: string;
  color?: string;
}
export interface TerraSegment<T extends string = string> {
  value: T;
  label: string;
  count?: number;
  icon?: string;
  disabled?: boolean;
}
export interface TerraCalendarCell {
  date: Date;
  current: boolean;
  selected?: boolean;
  inRange?: boolean;
  disabled?: boolean;
}
export interface TerraTaskDetails {
  title: string;
  timeLabel: string;
  dateLabel: string;
  shared: boolean;
  completed?: boolean;
  notes?: string;
}
