import { FilterProfile } from '../../core/api/models';

export interface FilterFieldCopy {
  label: string;
  hint?: string;
}

export const FILTER_FIELD_COPY: Partial<Record<keyof FilterProfile, FilterFieldCopy>> = {
  title_keywords: {
    label: 'Keep — title keywords',
    hint: 'A listing is kept only if its title contains at least one of these keywords.',
  },
  require_title_terms: {
    label: 'Keep — required title terms',
    hint: 'If set, the title must also contain all of these terms. Leave empty to add no extra requirement.',
  },
  exclude_levels: {
    label: 'Skip — level words in the title',
    hint: 'A listing is skipped if its title contains any of these words. This is the full editable list; the checkboxes above are just shortcuts.',
  },
  exclude_patterns: {
    label: 'Skip — title patterns',
    hint: 'A listing is skipped if its title matches any of these. Plain words use word boundaries automatically (“java” will not match “javascript”).',
  },
  exclude_stacks_without: {
    label: 'Skip — “X without Y” rule',
    hint: 'Skips listings that mention stack X unless Y is also present.',
  },
  exclude_fullstack_with_backend: {
    label: 'Skip full-stack roles with a heavy backend',
  },
  fullstack_backend_stacks: {
    label: 'Backend stacks that trigger this skip',
  },
  exclude_body_disqualifiers: {
    label: 'Skip when the description mentions a blocked stack',
    hint: 'Catches a clean frontend title whose description reveals an unwanted platform. Separate from the title list above.',
  },
  body_exclude_patterns: {
    label: 'Blocked stacks in the description',
  },
  exclude_body_onsite_city: {
    label: 'Skip hybrid/office roles in another city',
    hint: 'Catches “remote” in the header plus “3 days in a Kraków office” in the body.',
  },
  allow_low_frequency_hybrid: {
    label: 'Allow hybrid with rare office visits',
    hint: 'Listings asking for about one office day a week or less in a Polish city are kept; anything more frequent, unspecified, or abroad is still skipped.',
  },
  extra_anti_hybrid_cities: {
    label: 'Skip hybrid offers tied to these cities',
    hint: 'Locked chips are the shared calibrated list and cannot be removed; your own additions can be.',
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
    label: 'Skip — company blocklist',
    hint: 'Listings from these companies are always skipped. Locked entries are the shared blocklist (calibrated on real incidents) and cannot be removed.',
  },
};

/** Options for the exclude_stacks_without selects. */
export const STACK_SELECT_OPTIONS = ['react', 'vue', 'angular', 'svelte'] as const;
