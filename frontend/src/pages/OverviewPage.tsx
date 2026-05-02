import { useQuery } from '@tanstack/react-query';
import {
  AimOutlined,
  ArrowRightOutlined,
  DatabaseFilled,
  DownloadOutlined,
  HddFilled,
  ReloadOutlined,
  SaveFilled,
  ShareAltOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { Alert, Button, Progress, Space, Table, Typography } from 'antd';
import dayjs from 'dayjs';

import { api } from '../api';
import { StatusTag } from '../components/StatusTag';
import type { HealthStatus, SolveJob, SystemStatus } from '../types';

function metricNote(value: number | undefined, suffix = '') {
  if (value === undefined || Number.isNaN(value)) {
    return '-';
  }
  return `${value.toLocaleString()}${suffix}`;
}

function bootstrapProgressPercent(completed: number, total: number) {
  if (total <= 0) {
    return completed > 0 ? 100 : 0;
  }

  return Math.min(100, Math.round((completed / total) * 100));
}

type BootstrapProgressItem = {
  completed: number;
  total: number;
  remaining: number;
};

function normalizeBootstrapProgressItem(
  item: BootstrapProgressItem | undefined,
  fallbackCompleted = 0,
  fallbackTotal = 0,
) {
  const completed = Math.max(0, item?.completed ?? fallbackCompleted);
  const rawTotal = Math.max(0, item?.total ?? fallbackTotal);
  const total = Math.max(rawTotal, completed);
  const derivedRemaining = Math.max(0, total - completed);
  const reportedRemaining = Math.max(0, item?.remaining ?? derivedRemaining);

  return {
    completed,
    total,
    remaining: Math.max(derivedRemaining, reportedRemaining),
  };
}

function normalizeBootstrapProgress(status: SystemStatus | undefined) {
  return {
    networks: normalizeBootstrapProgressItem(
      status?.progress?.networks,
      status?.counts.networks,
      status?.latest_batch?.total_networks,
    ),
    sites: normalizeBootstrapProgressItem(
      status?.progress?.sites,
      status?.counts.sites,
      status?.latest_batch?.total_sites,
    ),
  };
}

function healthRows(health?: HealthStatus) {
  return [
    {
      key: 'backend',
      name: 'Backend Core',
      meta: health?.backend.version ?? 'API 服务',
      status: health?.backend.status ?? 'unknown',
      icon: <HddFilled />,
      detail: '42ms ping',
    },
    {
      key: 'database',
      name: 'Database',
      meta: health?.database.path ?? 'Primary storage',
      status: health?.database.status ?? 'unknown',
      icon: <DatabaseFilled />,
      detail: 'Load: normal',
    },
    {
      key: 'solver',
      name: 'Solver Engine',
      meta: health?.solver.base_url ?? 'SPP / RTK queue',
      status: health?.solver.status ?? 'unknown',
      icon: <TableOutlined />,
      detail: health?.solver.status === 'ok' ? 'Ready' : 'Check queue',
    },
    {
      key: 'storage',
      name: 'File Storage',
      meta: health?.storage.data_dir ?? 'RINEX cache',
      status: health?.storage.status ?? 'unknown',
      icon: <SaveFilled />,
      detail: 'Cache online',
    },
  ];
}

export function OverviewPage() {
  const { data: bootstrapStatus } = useQuery({ queryKey: ['bootstrap-status'], queryFn: api.getBootstrapStatus });
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.getHealth });
  const { data: jobs, isLoading: jobsLoading } = useQuery({ queryKey: ['solve-jobs-overview'], queryFn: api.getSolveJobs });
  const { data: analytics } = useQuery({ queryKey: ['analytics-overview'], queryFn: api.getAnalyticsOverview });

  const successRate = (((analytics?.recent_success_rate ?? 0) * 100) || 0).toFixed(1);
  const bootstrapProgress = normalizeBootstrapProgress(bootstrapStatus);
  const completedTotal = bootstrapProgress.networks.completed + bootstrapProgress.sites.completed;
  const expectedTotal = bootstrapProgress.networks.total + bootstrapProgress.sites.total;
  const remainingTotal = bootstrapProgress.networks.remaining + bootstrapProgress.sites.remaining;
  const shouldShowBootstrapAlert =
    bootstrapStatus && !bootstrapStatus.bootstrapped && (remainingTotal > 0 || completedTotal === 0);

  const jobColumns = [
    {
      title: 'JOB NAME',
      key: 'job',
      render: (_: unknown, record: SolveJob) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{`SOL-${record.job_type.toUpperCase()}-${record.id}`}</Typography.Text>
          <span className="mono-label">ID: {record.solver_job_id ?? record.id}</span>
        </Space>
      ),
    },
    {
      title: 'MODE',
      dataIndex: 'job_type',
      key: 'job_type',
      render: (value: string) => <span className="mono-label">{value.toUpperCase()}</span>,
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <StatusTag value={value} />,
    },
    {
      title: 'CREATED / DURATION',
      key: 'created_at',
      render: (_: unknown, record: SolveJob) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{dayjs(record.created_at).format('HH:mm')}</Typography.Text>
          <Typography.Text type="secondary">
            {record.finished_at && record.started_at
              ? `${dayjs(record.finished_at).diff(dayjs(record.started_at), 'second')}s`
              : record.status === 'running'
                ? 'In progress...'
                : '-'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      align: 'right' as const,
      render: () => (
        <Button type="text" shape="circle" icon={<DownloadOutlined />} aria-label="下载结果" />
      ),
    },
  ];

  return (
    <Space
      direction="vertical"
      size={20}
      style={{ width: '100%' }}
      className="page-stack overview-page"
    >
      {shouldShowBootstrapAlert ? (
        <Alert
          type="warning"
          showIcon
          message="系统尚未完成初始化"
          description={
            <div className="bootstrap-alert-content">
              <div>
                已完成 {completedTotal.toLocaleString()} / {expectedTotal.toLocaleString()} 项，剩余{' '}
                {remainingTotal.toLocaleString()} 项。
              </div>
              <div className="bootstrap-progress-grid">
                <div>
                  <div className="bootstrap-progress-label">
                    子网 {bootstrapProgress.networks.completed.toLocaleString()} /{' '}
                    {bootstrapProgress.networks.total.toLocaleString()}，剩余{' '}
                    {bootstrapProgress.networks.remaining.toLocaleString()}
                  </div>
                  <Progress
                    percent={bootstrapProgressPercent(bootstrapProgress.networks.completed, bootstrapProgress.networks.total)}
                    size="small"
                    showInfo={false}
                  />
                </div>
                <div>
                  <div className="bootstrap-progress-label">
                    站点 {bootstrapProgress.sites.completed.toLocaleString()} /{' '}
                    {bootstrapProgress.sites.total.toLocaleString()}，剩余{' '}
                    {bootstrapProgress.sites.remaining.toLocaleString()}
                  </div>
                  <Progress
                    percent={bootstrapProgressPercent(bootstrapProgress.sites.completed, bootstrapProgress.sites.total)}
                    size="small"
                    showInfo={false}
                  />
                </div>
              </div>
            </div>
          }
        />
      ) : null}

      <div className="metric-grid">
        <div className="metric-tile">
          <div className="metric-tile-head">
            <div className="metric-tile-kicker">Subnetworks</div>
            <span className="metric-icon"><ShareAltOutlined /></span>
          </div>
          <div className="metric-tile-value">{metricNote(bootstrapStatus?.counts.networks)}</div>
          <div className="metric-tile-note">本地持久化子网</div>
        </div>
        <div className="metric-tile">
          <div className="metric-tile-head">
            <div className="metric-tile-kicker">Total Sites</div>
            <span className="metric-icon warning"><AimOutlined /></span>
          </div>
          <div className="metric-tile-value">{metricNote(bootstrapStatus?.counts.sites)}</div>
          <div className="metric-tile-note">NPI 初始化站点</div>
        </div>
        <div className="metric-tile">
          <div className="metric-tile-head">
            <div className="metric-tile-kicker">RINEX Files</div>
            <span className="metric-icon muted"><SaveFilled /></span>
          </div>
          <div className="metric-tile-value">{metricNote(analytics?.totals.rinex_files)}</div>
          <div className="metric-tile-note">本地文件资产</div>
        </div>
        <div className="metric-tile">
          <div className="metric-tile-head">
            <div className="metric-tile-kicker">Recent Jobs</div>
            <span className="metric-icon"><TableOutlined /></span>
          </div>
          <div className="metric-tile-value">{metricNote(analytics?.solve_jobs)}</div>
          <div className="metric-tile-note">{successRate}% 近期成功率</div>
        </div>
      </div>

      <div className="page-section ant-card">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">System Health</h2>
            <div className="panel-subtitle">服务健康矩阵</div>
          </div>
          <Button type="text" shape="circle" icon={<ReloadOutlined />} aria-label="刷新系统健康" />
        </div>
        <div className="health-list health-list-horizontal">
          {healthRows(health).map((row) => (
            <div className={`health-row ${row.status === 'running' ? 'warn' : ''}`} key={row.key}>
              <div className="health-identity">
                <span className="health-icon">{row.icon}</span>
                <div>
                  <div className="health-name">{row.name}</div>
                  <div className="health-meta">{row.meta}</div>
                </div>
              </div>
              <Space direction="vertical" size={2} align="end">
                <StatusTag value={row.status} />
                <span className="mono-label">{row.detail}</span>
              </Space>
            </div>
          ))}
        </div>
      </div>

      <div className="page-section ant-card">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Recent Resolution Jobs</h2>
            <div className="panel-subtitle">最近任务执行状态</div>
          </div>
          <Button type="link">
            查看全部 <ArrowRightOutlined />
          </Button>
        </div>
        <div style={{ padding: 24 }}>
          <Table
            className="soft-table"
            rowKey="id"
            loading={jobsLoading}
            dataSource={(jobs?.items ?? []).slice(0, 5)}
            columns={jobColumns}
            pagination={false}
          />
        </div>
      </div>
    </Space>
  );
}
