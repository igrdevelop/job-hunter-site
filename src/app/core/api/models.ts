export type ApplicationStatus = 'applied' | 'sent' | 'failed' | 'expired' | 'pending';

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
  status: ApplicationStatus;
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
  status?: ApplicationStatus | 'all';
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export type ApplicationStats = Record<ApplicationStatus, number> & { total: number };

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
