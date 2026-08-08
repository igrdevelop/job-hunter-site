/**
 * UI-only shortcuts over the flat `exclude_levels` word list.
 * filters.yaml / API never see group ids — only the resulting words.
 * Mapping is pinned to fixture defaults by unit test.
 */
export interface ExcludeLevelGroup {
  id: string;
  label: string;
  words: readonly string[];
}

export const EXCLUDE_LEVEL_GROUPS: readonly ExcludeLevelGroup[] = [
  {
    id: 'junior_intern',
    label: 'Junior / Intern / internships',
    words: [
      'junior',
      'intern',
      'internship',
      'trainee',
      'stażysta',
      'praktykant',
      'staz',
    ],
  },
  {
    id: 'lead_management',
    label: 'Lead / management (tech lead, EM, CTO…)',
    words: [
      'tech lead',
      'tech-lead',
      'techlead',
      'техлид',
      'team lead',
      'тимлид',
      'project lead',
      'engineering manager',
      'head of engineering',
      'vp of engineering',
      'cto',
    ],
  },
  {
    id: 'part_time',
    label: 'Part-time',
    words: ['part-time', 'part time', 'parttime'],
  },
] as const;

export type GroupCheckState = 'checked' | 'unchecked' | 'indeterminate';

export function groupCheckState(
  list: readonly string[],
  words: readonly string[],
): GroupCheckState {
  const set = new Set(list.map((w) => w.toLowerCase()));
  let present = 0;
  for (const w of words) {
    if (set.has(w.toLowerCase())) present++;
  }
  if (present === 0) return 'unchecked';
  if (present === words.length) return 'checked';
  return 'indeterminate';
}

/** Apply a group toggle: indeterminate/unchecked → add all; checked → remove all. */
export function toggleGroupWords(
  list: readonly string[],
  words: readonly string[],
): string[] {
  const state = groupCheckState(list, words);
  const remove = new Set(words.map((w) => w.toLowerCase()));
  if (state === 'checked') {
    return list.filter((w) => !remove.has(w.toLowerCase()));
  }
  // unchecked or indeterminate → ensure full group is present
  const next = list.filter((w) => !remove.has(w.toLowerCase()));
  return [...next, ...words];
}
