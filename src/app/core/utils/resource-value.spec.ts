import { vi } from 'vitest';
import { safeResourceValue } from './resource-value';

describe('safeResourceValue', () => {
  it('returns the value when the resource has one', () => {
    const resource = { hasValue: () => true, value: () => 42 };
    expect(safeResourceValue(resource)).toBe(42);
  });

  it('returns undefined instead of calling value() when the resource has none', () => {
    const value = vi.fn(() => {
      throw new Error('value() should not be called while hasValue() is false');
    });
    const resource = { hasValue: () => false, value };
    expect(safeResourceValue(resource)).toBeUndefined();
    expect(value).not.toHaveBeenCalled();
  });
});
