import { useQuery } from '@tanstack/react-query';
import { Alert, Col, List, Row, Space, Typography } from 'antd';

import { api } from '../api';
import { PageSection } from '../components/PageSection';
import { StatusTag } from '../components/StatusTag';

export function OverviewPage() {
  const { data: bootstrapStatus } = useQuery({ queryKey: ['bootstrap-status'], queryFn: api.getBootstrapStatus });
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.getHealth });
  const { data: networks } = useQuery({
    queryKey: ['networks-overview'],
    queryFn: () => api.getNetworks(new URLSearchParams({ page: '1', page_size: '5' })),
  });
  const { data: sites } = useQuery({
    queryKey: ['sites-overview'],
    queryFn: () => api.getSites(new URLSearchParams({ page: '1', page_size: '6' })),
  });
  const { data: analytics } = useQuery({ queryKey: ['analytics-overview'], queryFn: api.getAnalyticsOverview });

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }} className="page-stack">
      {bootstrapStatus && !bootstrapStatus.bootstrapped ? (
        <Alert
          type="warning"
          showIcon
          message="系统尚未完成初始化"
          description="后台启动时会自动拉取 NPI 数据；如果初始化失败，请在系统状态页手动重试。"
        />
      ) : null}

      <div className="page-hero">
        <div className="page-hero-kicker">总览</div>
        <h1 className="page-hero-title">站网运行概况与关键状态总览。</h1>
        <p className="page-hero-copy">
          当前前端已经接入真实的子网、站点、RINEX 与解算任务数据，这里优先展示系统健康、站网规模和近期节点状态。
        </p>
        <div className="page-hero-meta">
          <span>后台已接通</span>
          <span className="page-hero-meta-dot" />
          <span>本地缓存可用</span>
          <span className="page-hero-meta-dot" />
          <span>解算服务 {health?.solver.status ?? 'unknown'}</span>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-tile">
          <div className="metric-tile-kicker">子网数量</div>
          <div className="metric-tile-value">{bootstrapStatus?.counts.networks ?? 0}</div>
          <div className="metric-tile-note">本地持久化子网规模</div>
        </div>
        <div className="metric-tile">
          <div className="metric-tile-kicker">站点数量</div>
          <div className="metric-tile-value">{bootstrapStatus?.counts.sites ?? 0}</div>
          <div className="metric-tile-note">NPI 初始化后的站点总数</div>
        </div>
        <div className="metric-tile">
          <div className="metric-tile-kicker">任务数量</div>
          <div className="metric-tile-value">{analytics?.solve_jobs ?? 0}</div>
          <div className="metric-tile-note">已落库的解算任务</div>
        </div>
        <div className="metric-tile">
          <div className="metric-tile-kicker">成功率</div>
          <div className="metric-tile-value">
            {`${(((analytics?.recent_success_rate ?? 0) * 100) || 0).toFixed(1)}%`}
          </div>
          <div className="metric-tile-note">近期任务成功率</div>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <PageSection title="系统状态" kicker="健康矩阵">
            <List
              dataSource={[
                ['后台', health?.backend.status],
                ['数据库', health?.database.status],
                ['文件存储', health?.storage.status],
                ['解算服务', health?.solver.status],
              ]}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text>{item[0]}</Typography.Text>
                  <StatusTag value={item[1]} />
                </List.Item>
              )}
            />
          </PageSection>
        </Col>
        <Col xs={24} xl={12}>
          <PageSection title="最近子网" kicker="子网分组">
            <List
              dataSource={networks?.items ?? []}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta title={item.name} description={item.description || '无描述'} />
                  <Space>
                    <Typography.Text type="secondary">{item.site_count} 站点</Typography.Text>
                    <StatusTag value={item.status} />
                  </Space>
                </List.Item>
              )}
            />
          </PageSection>
        </Col>
      </Row>

      <PageSection title="站点样例" kicker="活动节点">
        <Row gutter={[16, 16]}>
          {(sites?.items ?? []).map((site) => (
            <Col xs={24} md={12} xl={8} key={site.id}>
              <div className="site-card">
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  {site.four_char_id || site.name || `SITE-${site.id}`}
                </Typography.Title>
                <Typography.Paragraph type="secondary">
                  {site.name || '未命名站点'}
                </Typography.Paragraph>
                <Space wrap>
                  <StatusTag value={site.site_status} />
                  <Typography.Text type="secondary">
                    {site.latitude?.toFixed(3) ?? '-'}, {site.longitude?.toFixed(3) ?? '-'}
                  </Typography.Text>
                </Space>
              </div>
            </Col>
          ))}
        </Row>
      </PageSection>
    </Space>
  );
}
