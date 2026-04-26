import { useQuery } from '@tanstack/react-query';
import { Alert, Col, List, Row, Space, Statistic, Typography } from 'antd';

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
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {bootstrapStatus && !bootstrapStatus.bootstrapped ? (
        <Alert
          type="warning"
          showIcon
          message="系统尚未完成初始化"
          description="后台启动时会自动拉取 NPI 数据；如果初始化失败，请在系统状态页手动重试。"
        />
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <PageSection title="站网规模">
            <Statistic title="子网总数" value={bootstrapStatus?.counts.networks ?? 0} />
          </PageSection>
        </Col>
        <Col xs={24} md={8}>
          <PageSection title="站点规模">
            <Statistic title="站点总数" value={bootstrapStatus?.counts.sites ?? 0} />
          </PageSection>
        </Col>
        <Col xs={24} md={8}>
          <PageSection title="任务概览">
            <Statistic title="已记录解算任务" value={analytics?.solve_jobs ?? 0} />
          </PageSection>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <PageSection title="系统状态">
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
          <PageSection title="最近子网">
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

      <PageSection title="站点样例">
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
