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

// ── Resume profile store (GET/PUT /api/profile) ─────────────────────────────
// Mirrors bot `hunter/profile_schema.py` (schema_version 1) field-for-field —
// same snake_case, same shapes; the API stores/forwards the document opaquely
// beyond a few structural checks. See docs/RESUME_PROFILE_STORE.md.

/** `parsed` = came from the resume parser untouched; `edited` = the user
 * touched it — an `edited` element is never auto-overwritten by a re-parse. */
export type ProfileOrigin = 'parsed' | 'edited';

export interface ProfileBullet {
  text: string;
  origin: ProfileOrigin;
  /** Empty = shared by every track's base CV; see Role.bullets_by_track for the full-rewrite case. */
  tracks: string[];
}

export interface ProfileIdentity {
  full_name: string;
  aka: string;
  headline: string;
  contact: string;
  cv_filename_prefix: string;
}

export interface ProfileLocation {
  home_city: string;
  home_city_aliases: string[];
  acceptable_hybrid: string[];
  weekly_hybrid: string[];
  work_authorization: string;
}

export interface ProfileLanguages {
  spoken: string[];
  cv_languages: string[];
  disqualify_required: string[];
}

export interface ProfileFlexibleEmployer {
  name: string;
  period: string;
  projects: string[];
}

export interface ProfileEmployers {
  protected: string[];
  flexible: ProfileFlexibleEmployer;
}

export interface ProfileEducationEntry {
  text: string;
  origin: ProfileOrigin;
}

export interface ProfileEducation {
  entries: ProfileEducationEntry[];
  school_keyword: string;
  expected_role_count: number;
}

export interface ProfileExperience {
  years_label: string;
  since_year: number;
}

export interface ProfileRole {
  id: string;
  company: string;
  title: string;
  period: string;
  subtitle: string;
  description: string;
  backend: string;
  bullets_max: string;
  legacy_stack_ok: boolean;
  title_by_track: Record<string, string>;
  subtitle_by_track: Record<string, string>;
  stack_line: string;
  stack_line_by_track: Record<string, string>;
  bullets: ProfileBullet[];
  /** Full per-track REPLACEMENT of `bullets` (a rewrite, not a filtered subset). Absent for a track ⇒ fall back to filtering `bullets` by their own `tracks`. */
  bullets_by_track: Record<string, string[]>;
  origin: ProfileOrigin;
}

export interface ProfileSkillCategory {
  category: string;
  items: string[];
  origin: ProfileOrigin;
  /** Same shared-unless-tagged semantics as ProfileBullet.tracks, for the whole category. */
  tracks: string[];
}

export interface ProfileExtra {
  /** Free-form in the schema (bot keeps it a plain str); known values: certification | link | award | other. */
  kind: string;
  text: string;
  origin: ProfileOrigin;
}

export interface ProfileCore {
  identity: ProfileIdentity;
  location: ProfileLocation;
  languages: ProfileLanguages;
  employers: ProfileEmployers;
  education: ProfileEducation;
  experience: ProfileExperience;
  summary: string;
  roles: ProfileRole[];
  skills: ProfileSkillCategory[];
  extras: ProfileExtra[];
  /** Free-text prompt tail ("story bank"); renders verbatim when non-empty. */
  generation_notes: string;
}

/** A track "personality": a delta of presentation over `core`, never a second copy of the facts. */
export interface ProfileVariant {
  headline: string;
  summary: string;
  /** Replaces (not merges with) core.skills for this track when non-empty. */
  skills: ProfileSkillCategory[];
}

/** A raw parser fragment that could not be confidently placed anywhere. */
export interface ProfileLeftover {
  text: string;
  source_upload_id: string;
}

export interface ProfileUpload {
  id: string;
  filename: string;
  sha256: string;
  parsed_at: string;
}

/**
 * Canonical resume-profile document. The client round-trips this whole object
 * through the editor and PUTs it back in full — the `[key: string]: unknown`
 * passthrough (here and it should be preserved wherever this type is
 * reconstructed) is what lets a newer server field survive an older client's
 * PUT instead of being silently dropped (docs/RESUME_PROFILE_STORE.md risk).
 */
export interface ProfileDocument {
  schema_version: number;
  core: ProfileCore;
  variants: Record<string, ProfileVariant>;
  leftovers: ProfileLeftover[];
  uploads: ProfileUpload[];
  [key: string]: unknown;
}

export interface ProfileGetResponse {
  profile: ProfileDocument;
  revision: number;
  updatedAt: string;
}

export interface ProfilePutResponse {
  revision: number;
  renderJobId: string | null;
}

/** PUT 400 body — human-readable structural validation failures. */
export interface ProfileErrors {
  errors: string[];
}
