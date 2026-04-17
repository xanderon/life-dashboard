export type AppStatus = 'ok' | 'warn' | 'down' | 'unknown';
export type ServiceStatus = 'ok' | 'down';

export type TermoDataDetails = {
  sector?: string | null;
  eta?: string | null;
  agent?: string | null;
  cause?: string | null;
  zone?: string | null;
};

export type TermoMetrics = {
  data?: TermoDataDetails | null;
  service?: {
    hot_water?: ServiceStatus | null;
    heat?: ServiceStatus | null;
  } | null;
  service_state?: AppStatus;
  source_url?: string | null;
  target?: {
    street?: string | null;
    block?: string | null;
  } | null;
  fetched_at?: string | null;
  found?: boolean | null;
} | null;

export type AppRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: AppStatus;
  last_run_at: string | null;
  github_url: string | null;
  chat_url: string | null;
  home_url: string | null;
};

export type RunRow = {
  id: string;
  created_at: string;
  started_at: string;
  ended_at: string | null;
  success: boolean | null;
  summary: string | null;
  metrics: TermoMetrics;
};

export type PeriodRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  hot_water_status: ServiceStatus;
  heat_status: ServiceStatus;
  eta: string | null;
  details: {
    source_url?: string | null;
    target?: {
      street?: string | null;
      block?: string | null;
    } | null;
    found?: boolean | null;
    data?: TermoDataDetails | null;
    fetched_at?: string | null;
  } | null;
};
