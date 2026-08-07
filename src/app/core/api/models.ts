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
}

export type ApplicationPatch = Partial<Pick<Application, 'sent' | 'toLearn'>>;

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
