import type {
  AnalyticsOverview,
  ApiEnvelope,
  HealthStatus,
  Network,
  PageResponse,
  NpiSyncPreview,
  RinexEpochSummary,
  RinexFile,
  RinexFileHeader,
  RinexRemoteFile,
  SatelliteHistoryItem,
  Site,
  SiteAvailability,
  SiteEpochMetric,
  SppPrecheck,
  SolutionEpoch,
  SolveJob,
  SolveResult,
  SystemStatus,
} from './types';

const API_PREFIX = '/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

export const api = {
  getHealth: () => request<HealthStatus>('/system/health'),
  getBootstrapStatus: () => request<SystemStatus>('/system/bootstrap-status'),
  bootstrap: (force = false) => request('/system/bootstrap', { method: 'POST', body: JSON.stringify({ force }) }),
  getNpiSyncPreview: () => request<NpiSyncPreview>('/system/sync/npi/preview', { method: 'POST' }),
  applyNpiSync: (force = true) =>
    request('/system/sync/npi/apply', { method: 'POST', body: JSON.stringify({ force }) }),
  getAnalyticsOverview: () => request<AnalyticsOverview>('/analytics/network-overview'),
  getNetworks: (params: URLSearchParams) => request<PageResponse<Network>>(`/networks?${params.toString()}`),
  createNetwork: (body: { name: string; description?: string; status: string }) =>
    request<Network>('/networks', { method: 'POST', body: JSON.stringify(body) }),
  updateNetwork: (id: number, body: { name?: string; description?: string; status?: string }) =>
    request<Network>(`/networks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteNetwork: (id: number) => request(`/networks/${id}`, { method: 'DELETE' }),
  getSites: (params: URLSearchParams) => request<PageResponse<Site>>(`/sites?${params.toString()}`),
  createSite: (body: Record<string, unknown>) =>
    request<Site>('/sites', { method: 'POST', body: JSON.stringify(body) }),
  updateSite: (id: number, body: Record<string, unknown>) =>
    request<Site>(`/sites/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSite: (id: number) => request(`/sites/${id}`, { method: 'DELETE' }),
  getRinexFiles: (params: URLSearchParams) => request<PageResponse<RinexFile>>(`/rinex-files?${params.toString()}`),
  queryRemoteRinexFiles: (body: Record<string, unknown>) =>
    request<RinexRemoteFile[]>('/rinex-files/query-remote', { method: 'POST', body: JSON.stringify(body) }),
  downloadRinexFiles: (body: Record<string, unknown>) =>
    request<{ items: Array<{ id: number; filename: string; status: string }> }>('/rinex-files/download', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getRinexFile: (id: number) => request<RinexFile>(`/rinex-files/${id}`),
  getRinexFileHeader: (id: number) => request<RinexFileHeader>(`/rinex-files/${id}/header`),
  getRinexFileEpochs: (id: number) => request<RinexEpochSummary>(`/rinex-files/${id}/epochs`),
  reindexRinexFiles: (ids: number[]) =>
    request<{ items: Array<{ id: number; index_status: string; filename: string }> }>('/rinex-files/reindex', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  deleteRinexFile: (id: number) => request(`/rinex-files/${id}`, { method: 'DELETE' }),
  getSolveJobs: () => request<PageResponse<SolveJob>>('/solve-jobs'),
  createSppSolveJob: (body: Record<string, unknown>) =>
    request<SolveJob>('/solve-jobs/spp', { method: 'POST', body: JSON.stringify(body) }),
  precheckSppSolveJob: (body: Record<string, unknown>) =>
    request<SppPrecheck>('/solve-jobs/spp/precheck', { method: 'POST', body: JSON.stringify(body) }),
  getSolveJob: (id: number) => request<SolveJob>(`/solve-jobs/${id}`),
  getSolveResult: (id: number) => request<SolveResult>(`/solve-jobs/${id}/result`),
  getSolveEpochs: (id: number) => request<SolutionEpoch[]>(`/solve-jobs/${id}/epochs`),
  getSolveSatellites: (id: number) => request<SatelliteHistoryItem[]>(`/solve-jobs/${id}/satellites`),
  getSiteAvailability: () => request<SiteAvailability[]>('/analytics/site-availability'),
  getSiteEpochMetrics: (siteId?: number) =>
    request<SiteEpochMetric[]>(`/analytics/site-epochs${siteId ? `?site_id=${siteId}` : ''}`),
  getSatelliteHistory: (filters?: { satellite_system?: string; satellite_prn?: string }) => {
    const params = new URLSearchParams();
    if (filters?.satellite_system) params.set('satellite_system', filters.satellite_system);
    if (filters?.satellite_prn) params.set('satellite_prn', filters.satellite_prn);
    return request<SatelliteHistoryItem[]>(`/analytics/satellite-history${params.toString() ? `?${params.toString()}` : ''}`);
  },
};
