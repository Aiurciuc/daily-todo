import { adjacentDay } from './task-date';

describe('adjacentDay', () => {
  it('handles leap days and year boundaries without timezone offsets', () => {
    expect(adjacentDay('2024-02-28', 1)).toBe('2024-02-29');
    expect(adjacentDay('2024-02-29', 1)).toBe('2024-03-01');
    expect(adjacentDay('2024-01-01', -1)).toBe('2023-12-31');
  });

  it('keeps dates in the supported four-digit year range', () => {
    expect(adjacentDay('0001-01-01', -1)).toBeUndefined();
    expect(adjacentDay('9999-12-31', 1)).toBeUndefined();
  });
});
