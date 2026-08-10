export type SentFilter = 'all' | 'unsent' | 'filled';

export interface Application {
  id: string;
  date: string;
  company: string;
  title: string;
  stack: string;
  atsStatus: string;
  url: string;
  folder: string;
  sent: string;
  toLearn: string;
  costUsd: number | null;
  atsVerdict: number | null;
  // Optional until the API deploy that returns them; cells render "—" meanwhile.
  reapplication?: string;
  driveUrl?: string;
  appStatus?: string;
}

export type ApplicationPatch = Partial<Pick<Application, 'sent' | 'toLearn' | 'appStatus'>>;

// Manual status set by the user from the grid dropdown. Web-only field
// (tracker.db app_status) — independent of `sent`, which drives the
// Unsent/Filled filter and stats.
export const APP_STATUS_OPTIONS = [
  '',
  'Sent',
  'Rejected',
  'Interview',
  'Offer',
  'Filter miss',
  'Skipped',
] as const;

// A new application is created from a job listing URL, the vacancy text, or both.
export interface ApplicationCreate {
  url?: string;
  text?: string;
}

export const SORTABLE_COLUMNS = [
  'date',
  'company',
  'title',
  'stack',
  'atsStatus',
  'sent',
  'costUsd',
  'atsVerdict',
] as const;
export type SortableColumn = (typeof SORTABLE_COLUMNS)[number];

export interface ApplicationsQuery {
  page: number;
  limit: number;
  sort?: SortableColumn;
  order?: 'asc' | 'desc';
  status?: SentFilter;
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ApplicationStats {
  total: number;
  unsent: number;
  filled: number;
}

export interface FolderInfo {
  name: string;
  itemCount: number;
  modified: string;
}

export type FileType = 'pdf' | 'docx' | 'txt' | 'json' | 'other' | 'folder';

export interface FileInfo {
  name: string;
  size: number;
  type: FileType;
  modified: string;
}

export interface FunnelData {
  tracked: number;
  generated: number;
  sent: number;
  confirmed: number;
  answered: number;
}

export interface FunnelPoint {
  stage: string;
  count: number;
}

export interface SourceStats {
  source: string;
  tracked: number;
  generated: number;
  sent: number;
  confirmed: number;
  answered: number;
}

export interface CostSummary {
  totalCostUsd: number;
  averageCostUsd: number;
  applicationsWithCost: number;
}

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all';

export function periodToDays(period: AnalyticsPeriod): number | undefined {
  if (period === 'all') return undefined;
  return { '7d': 7, '30d': 30, '90d': 90 }[period];
}

export type TemplateCategory = 'resume' | 'cover-letter' | 'portfolio' | 'other';

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  fileType: FileType;
  size: number;
  modified: string;
  description?: string;
}

export interface SettingItem {
  key: string;
  value: string | null;
  type: string;
  description: string;
  isDefault: boolean;
  isSecret: boolean;
}

export interface SettingsCategory {
  name: string;
  icon: string;
  settings: SettingItem[];
}

export interface SettingsResponse {
  categories: SettingsCategory[];
}

export interface UserSettingItem {
  key: string;
  value: string | boolean | number | null;
  type: 'boolean' | 'number' | 'string' | 'select';
  description: string;
  options?: string[];
}

export interface UserSettingsResponse {
  settings: UserSettingItem[];
}

export interface TelegramStatus {
  linked: boolean;
  chatId?: string;
}

export interface TelegramLinkCode {
  code: string;
  expiresAt: string;
  botHandle: string;
}

export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
}

// ── Job filters (GET/PUT /api/filters) ──────────────────────────────────────

export type FilterMerge = 'replace' | 'extend_only';

export type FilterValueType =
  | 'string'
  | 'string_list'
  | 'pattern_list'
  | 'boolean'
  | 'stacks_without';

/** Generalized "block X unless Y is also present" rule. */
export interface ExcludeStacksWithout {
  unless: string;
  block: string[];
}

export type FilterScalar = string[] | boolean | ExcludeStacksWithout | null;

/** Full filter profile shape (defaults / effective). */
export interface FilterProfile {
  title_keywords: string[];
  require_title_terms: string[];
  exclude_levels: string[];
  exclude_patterns: string[];
  exclude_stacks_without: ExcludeStacksWithout | null;
  exclude_fullstack_with_backend: boolean;
  fullstack_backend_stacks: string[];
  exclude_body_disqualifiers: boolean;
  body_exclude_patterns: string[];
  exclude_body_onsite_city: boolean;
  allow_low_frequency_hybrid: boolean;
  exclude_german_language_required: boolean;
  exclude_unacceptable_contract: boolean;
  exclude_relocation_required: boolean;
  exclude_ai_training: boolean;
  exclude_companies: string[];
  extra_anti_hybrid_cities: string[];
  /** Derived from candidate.yaml — never written via PUT. */
  locations?: string[];
  /** Derived from candidate.yaml — never written via PUT. */
  languages?: string[];
  /** Derived display helper (home city label). */
  home_city?: string;
}

/** User file content — only keys the user overrode. */
export type FilterOverrides = {
  [K in keyof FilterProfile]?: FilterProfile[K];
};

export interface FilterMeta {
  type: FilterValueType;
  merge?: FilterMerge;
  /** When set, key is read-only and sourced from the named file. */
  derived?: string;
}

export interface FiltersPayload {
  defaults: FilterProfile;
  overrides: FilterOverrides;
  effective: FilterProfile;
  meta: Record<string, FilterMeta>;
}

/** PUT 400 body — per-field errors (`exclude_patterns[3]`, …). */
export interface FiltersErrors {
  errors: Record<string, string>;
}
