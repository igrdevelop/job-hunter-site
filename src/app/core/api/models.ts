export type ApplicationStatus = 'applied' | 'sent' | 'failed' | 'expired' | 'pending';

export interface Application {
  id: string;
  date: string;
  company: string;
  jobTitle: string;
  stack: string;
  atsPercent: number | null;
  url: string;
  status: ApplicationStatus;
  sent: string | null;
  reApplication: boolean;
  toLearn: string;
  atsVerdict: number | null;
  costUsd: number | null;
}

export type ApplicationPatch = Partial<Pick<Application, 'sent' | 'reApplication' | 'toLearn'>>;

export interface ApplicationsQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  status?: ApplicationStatus | 'all';
  search?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApplicationsStats {
  total: number;
  applied: number;
  sent: number;
  failed: number;
  unsent: number;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number | null;
}

export interface FunnelPoint {
  stage: string;
  count: number;
}

export interface SourceStat {
  source: string;
  tracked: number;
  applied: number;
  sent: number;
  conversion: number;
}

export interface CostSummary {
  totalSpend: number;
  medianPerApply: number;
  last7Days: number;
  last30Days: number;
}

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all';
