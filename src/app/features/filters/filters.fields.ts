import { FilterProfile } from '../../core/api/models';

export interface FilterFieldCopy {
  label: string;
  hint?: string;
}

export const FILTER_FIELD_COPY: Partial<Record<keyof FilterProfile, FilterFieldCopy>> = {
  title_keywords: {
    label: 'Title keywords',
    hint: 'A listing is kept if the title contains at least one of these.',
  },
  require_title_terms: {
    label: 'Required title terms',
    hint: 'When set, every title must include these terms. Leave empty to require none.',
  },
  exclude_levels: {
    label: 'Excluded level words',
    hint: 'Full editable list. The checkboxes above are shortcuts only.',
  },
  exclude_patterns: {
    label: 'Skip if title matches',
    hint: 'Plain words use word boundaries automatically (“java” will not match “javascript”).',
  },
  exclude_stacks_without: {
    label: '“X without Y” rule',
    hint: 'Skip listings that mention stack X unless Y is also present.',
  },
  exclude_fullstack_with_backend: {
    label: 'Skip fullstack roles with a heavy backend',
  },
  fullstack_backend_stacks: {
    label: 'Heavy backend stacks',
  },
  exclude_body_disqualifiers: {
    label: 'Stop-stack in job body',
    hint: 'Catches a clean FE title when the description reveals an unwanted platform. Separate from the title list.',
  },
  body_exclude_patterns: {
    label: 'Body stop-stack patterns',
  },
  exclude_body_onsite_city: {
    label: 'Skip hybrid/office in another city',
    hint: 'Catches “remote” in the header plus “3 days in a Kraków office” in the body.',
  },
  allow_low_frequency_hybrid: {
    label: 'Allow hybrid with rare office visits',
    hint: 'About one day a week or less in a Polish city is kept; more often, unspecified, or abroad is still skipped.',
  },
  extra_anti_hybrid_cities: {
    label: 'Hybrid stop-cities',
    hint: 'Locked chips are the shared calibrated list and cannot be removed. Your additions can.',
  },
  exclude_german_language_required: {
    label: 'Skip jobs that require German',
  },
  exclude_unacceptable_contract: {
    label: 'Skip part-time and short contracts',
  },
  exclude_relocation_required: {
    label: 'Skip jobs that require relocation',
  },
  exclude_ai_training: {
    label: 'Skip AI-training / staffing-mill companies',
  },
  exclude_companies: {
    label: 'Company blocklist',
    hint: 'Locked entries are the shared blocklist (calibrated on real incidents) and cannot be removed.',
  },
};

/** Options for the exclude_stacks_without selects. */
export const STACK_SELECT_OPTIONS = ['react', 'vue', 'angular', 'svelte'] as const;
