export type ApiEnvelope<T> = {
  code: string;
  message: string;
  data: T;
  meta: Record<string, unknown>;
};

export type PageResponse<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type SystemStatus = {
  bootstrapped: boolean;
  latest_batch: {
    id: number;
    source: string;
    status: string;
    total_networks: number;
    total_sites: number;
    created_at: string;
  } | null;
  counts: {
    networks: number;
    sites: number;
  };
};

export type HealthStatus = {
  backend: { status: string; name: string; version: string };
  database: { status: string; path: string };
  storage: { status: string; data_dir: string };
  solver: { status: string; base_url: string };
};

export type Network = {
  id: number;
  source_type: string;
  external_id: number | null;
  name: string;
  description: string | null;
  status: string;
  site_count: number;
  created_at: string;
  updated_at: string;
};

export type SiteNetwork = {
  id: number;
  name: string;
  status: string;
};

export type Site = {
  id: number;
  source_type: string;
  external_id: number | null;
  name: string | null;
  four_char_id: string | null;
  domes_number: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  ellipsoidal_height: number | null;
  date_installed: string | null;
  site_status: string | null;
  monument_description: string | null;
  monument_foundation: string | null;
  marker_description: string | null;
  monument_height: string | null;
  geologic_characteristic: string | null;
  bedrock_type: string | null;
  networks: SiteNetwork[];
  created_at: string;
  updated_at: string;
};

export type AnalyticsOverview = {
  totals: {
    networks: number;
    sites: number;
    rinex_files?: number;
  };
  solve_jobs: number;
  recent_success_rate: number | null;
};

export type RinexFile = {
  id: number;
  site_id: number | null;
  station_id: string | null;
  source: string;
  remote_file_id: string | null;
  remote_url: string | null;
  filename: string;
  local_path: string | null;
  file_type: string | null;
  file_period: string | null;
  rinex_version: string | null;
  compression_type: string | null;
  sample_interval_seconds: number | null;
  start_time: string | null;
  end_time: string | null;
  file_size: number | null;
  download_status: string;
  index_status: string;
  metadata_status: string | null;
  constellations_json: string[] | null;
  observation_types_json: Record<string, string[]> | null;
  header_json: {
    header_lines?: string[];
    rinex_version?: string | null;
    sample_interval_seconds?: number | null;
    time_of_first_obs?: string | null;
    time_of_last_obs?: string | null;
    constellations?: string[];
    observation_types?: Record<string, string[]>;
  } | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  site_name?: string | null;
  four_char_id?: string | null;
};

export type RinexRemoteFile = {
  siteId: string;
  fileType: string;
  filePeriod: string;
  startDate: string;
  rinexVersion: string;
  fileLocation: string;
  metadataStatus: string;
  fileSize: number | null;
  createdAt: string | null;
  modifiedAt: string | null;
  fileId: string;
  metadataErrors: Array<Record<string, unknown>>;
  filename: string;
};

export type RinexFileHeader = {
  id: number;
  filename: string;
  header: RinexFile['header_json'];
};

export type RinexEpochSummary = {
  id: number;
  filename: string;
  start_time: string | null;
  end_time: string | null;
  sample_interval_seconds: number | null;
  file_period: string | null;
};

export type SolveJob = {
  id: number;
  job_type: string;
  status: string;
  request_json: Record<string, unknown>;
  solver_job_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  engine: string | null;
  summary: Record<string, unknown> | null;
};

export type SolveResult = {
  job_id: number;
  engine: string;
  summary: Record<string, unknown>;
  quality: Record<string, unknown>;
};

export type SolutionEpoch = {
  id: number;
  job_id: number;
  epoch_time: string;
  site_role: string;
  solution_status: string;
  x: number | null;
  y: number | null;
  z: number | null;
  latitude: number | null;
  longitude: number | null;
  height: number | null;
  pdop: number | null;
  hdop: number | null;
  vdop: number | null;
  nsat_used: number | null;
  sigma0: number | null;
  residual_summary_json: Record<string, unknown> | null;
};

export type SiteAvailability = {
  site_id: number;
  four_char_id: string | null;
  site_name: string | null;
  site_status: string | null;
  rinex_file_count: number;
  solve_job_count: number;
  solve_success_rate: number | null;
  has_local_data: boolean;
};

export type SiteEpochMetric = {
  job_id: number;
  epoch_time: string;
  solution_status: string;
  pdop: number | null;
  hdop: number | null;
  vdop: number | null;
  nsat_used: number | null;
  sigma0: number | null;
};

export type SatelliteHistoryItem = {
  job_id: number;
  epoch_time: string;
  satellite_system: string;
  satellite_prn: string;
  elevation_deg: number | null;
  azimuth_deg: number | null;
  snr: number | null;
  used_in_solution: boolean;
  health_status: string;
  cycle_slip_detected: boolean;
  residual_code: number | null;
  residual_phase: number | null;
};

export type NpiSyncPreview = {
  summary: {
    remote_network_count: number;
    remote_site_count: number;
    added_networks: number;
    updated_networks: number;
    removed_networks: number;
    added_sites: number;
    updated_sites: number;
    removed_sites: number;
  };
  samples: {
    added_networks: Array<Record<string, unknown>>;
    updated_networks: Array<Record<string, unknown>>;
    removed_networks: Array<Record<string, unknown>>;
    added_sites: Array<Record<string, unknown>>;
    updated_sites: Array<Record<string, unknown>>;
    removed_sites: Array<Record<string, unknown>>;
  };
};
