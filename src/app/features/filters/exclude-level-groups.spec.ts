import { describe, expect, it } from 'vitest';
import { FILTERS_MOCK_PAYLOAD } from '../../core/api/filters.mock';
import {
  EXCLUDE_LEVEL_GROUPS,
  groupCheckState,
  toggleGroupWords,
} from './exclude-level-groups';

describe('EXCLUDE_LEVEL_GROUPS', () => {
  it('maps every group word onto fixture default exclude_levels', () => {
    const defaults = new Set(
      FILTERS_MOCK_PAYLOAD.defaults.exclude_levels.map((w) => w.toLowerCase()),
    );
    for (const group of EXCLUDE_LEVEL_GROUPS) {
      for (const word of group.words) {
        expect(defaults.has(word.toLowerCase()), `missing default: ${word}`).toBe(
          true,
        );
      }
    }
  });

  it('groupCheckState covers checked / unchecked / indeterminate', () => {
    const all = [...EXCLUDE_LEVEL_GROUPS[0].words, 'custom'];
    expect(groupCheckState(all, EXCLUDE_LEVEL_GROUPS[0].words)).toBe('checked');
    expect(groupCheckState(['custom'], EXCLUDE_LEVEL_GROUPS[0].words)).toBe(
      'unchecked',
    );
    expect(
      groupCheckState(['junior', 'custom'], EXCLUDE_LEVEL_GROUPS[0].words),
    ).toBe('indeterminate');
  });

  it('toggleGroupWords: checked removes group; indeterminate re-adds full group', () => {
    const group = EXCLUDE_LEVEL_GROUPS[0];
    const full = [...group.words, 'extra'];
    expect(toggleGroupWords(full, group.words)).toEqual(['extra']);

    const partial = ['junior', 'extra'];
    const restored = toggleGroupWords(partial, group.words);
    expect(groupCheckState(restored, group.words)).toBe('checked');
    expect(restored).toContain('extra');
  });
});
