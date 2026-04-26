import { useQuery } from '@tanstack/react-query';
import { Col, Form, Row, Select, Space, Statistic, Table, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';

import { api } from '../api';
import { PageSection } from '../components/PageSection';
import { StatusTag } from '../components/StatusTag';
import type { SatelliteHistoryItem, SiteAvailability, SiteEpochMetric } from '../types';

export function AnalyticsPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<number | undefined>(undefined);
  const [selectedSatelliteSystem, setSelectedSatelliteSystem] = useState<string | undefined>(undefined);
  const [selectedSatellitePrn, setSelectedSatellitePrn] = useState<string | undefined>(undefined);

  const { data: overview } = useQuery({ queryKey: ['analytics-overview'], queryFn: api.getAnalyticsOverview });
  const { data: siteAvailability } = useQuery({
    queryKey: ['analytics-site-availability'],
    queryFn: api.getSiteAvailability,
  });
  const { data: siteEpochs } = useQuery({
    queryKey: ['analytics-site-epochs', selectedSiteId],
    queryFn: () => api.getSiteEpochMetrics(selectedSiteId),
  });
  const { data: satelliteHistory } = useQuery({
    queryKey: ['analytics-satellite-history', selectedSatelliteSystem, selectedSatellitePrn],
    queryFn: () =>
      api.getSatelliteHistory({
        satellite_system: selectedSatelliteSystem,
        satellite_prn: selectedSatellitePrn,
      }),
  });

  const siteOptions = (siteAvailability ?? []).map((item) => ({
    value: item.site_id,
    label: `${item.four_char_id ?? '----'} ${item.site_name ?? ''}`.trim(),
  }));

  const satellitePrnOptions = Array.from(
    new Set((satelliteHistory ?? []).map((item) => item.satellite_prn).filter(Boolean)),
  ).map((value) => ({ value, label: value }));

  const epochChartOption = useMemo(() => {
    const points = siteEpochs ?? [];
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['PDOP', '卫星数', 'Sigma0'] },
      xAxis: {
        type: 'category',
        data: points.map((item) => item.epoch_time),
        axisLabel: { show: false },
      },
      yAxis: [{ type: 'value' }, { type: 'value' }],
      series: [
        { name: 'PDOP', type: 'line', data: points.map((item) => item.pdop) },
        { name: '卫星数', type: 'line', yAxisIndex: 1, data: points.map((item) => item.nsat_used) },
        { name: 'Sigma0', type: 'line', data: points.map((item) => item.sigma0) },
      ],
    };
  }, [siteEpochs]);

  const satelliteChartOption = useMemo(() => {
    const points = satelliteHistory ?? [];
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['SNR', '仰角', '码残差'] },
      xAxis: {
        type: 'category',
        data: points.map((item) => item.epoch_time),
        axisLabel: { show: false },
      },
      yAxis: [{ type: 'value' }, { type: 'value' }],
      series: [
        { name: 'SNR', type: 'line', data: points.map((item) => item.snr) },
        { name: '仰角', type: 'line', data: points.map((item) => item.elevation_deg) },
        { name: '码残差', type: 'line', yAxisIndex: 1, data: points.map((item) => item.residual_code) },
      ],
    };
  }, [satelliteHistory]);

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <PageSection title="站网统计">
            <Statistic title="子网总数" value={overview?.totals.networks ?? 0} />
          </PageSection>
        </Col>
        <Col xs={24} md={8}>
          <PageSection title="文件规模">
            <Statistic title="RINEX 文件数" value={overview?.totals.rinex_files ?? 0} />
          </PageSection>
        </Col>
        <Col xs={24} md={8}>
          <PageSection title="解算成功率">
            <Statistic
              title="最近成功率"
              value={overview?.recent_success_rate ? overview.recent_success_rate * 100 : 0}
              suffix="%"
              precision={2}
            />
          </PageSection>
        </Col>
      </Row>

      <PageSection title="站点可用率与质量概览">
        <Table
          rowKey="site_id"
          dataSource={siteAvailability ?? []}
          pagination={{ pageSize: 8 }}
          columns={[
            {
              title: '站点',
              key: 'site',
              render: (_: unknown, row: SiteAvailability) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{row.four_char_id ?? '----'}</Typography.Text>
                  <Typography.Text type="secondary">{row.site_name ?? '未命名'}</Typography.Text>
                </Space>
              ),
            },
            {
              title: '状态',
              dataIndex: 'site_status',
              key: 'site_status',
              render: (value: string | null) => <StatusTag value={value} />,
            },
            { title: '本地文件', dataIndex: 'rinex_file_count', key: 'rinex_file_count' },
            { title: '解算任务', dataIndex: 'solve_job_count', key: 'solve_job_count' },
            {
              title: '成功率',
              key: 'solve_success_rate',
              render: (_: unknown, row: SiteAvailability) =>
                row.solve_success_rate !== null ? `${(row.solve_success_rate * 100).toFixed(2)}%` : '-',
            },
          ]}
          onRow={(record) => ({
            onClick: () => setSelectedSiteId(record.site_id),
          })}
        />
      </PageSection>

      <PageSection title="站点历元质量趋势">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Form layout="inline">
            <Form.Item label="站点">
              <Select
                showSearch
                allowClear
                style={{ minWidth: 280 }}
                options={siteOptions}
                value={selectedSiteId}
                onChange={(value) => setSelectedSiteId(value)}
                optionFilterProp="label"
              />
            </Form.Item>
          </Form>
          <ReactECharts option={epochChartOption} style={{ height: 320 }} />
          <Table
            rowKey={(row: SiteEpochMetric) => `${row.job_id}-${row.epoch_time}`}
            dataSource={siteEpochs ?? []}
            pagination={{ pageSize: 6 }}
            columns={[
              {
                title: '时刻',
                dataIndex: 'epoch_time',
                key: 'epoch_time',
              },
              { title: '状态', dataIndex: 'solution_status', key: 'solution_status', render: (value: string) => <StatusTag value={value} /> },
              { title: 'PDOP', dataIndex: 'pdop', key: 'pdop' },
              { title: '卫星数', dataIndex: 'nsat_used', key: 'nsat_used' },
              { title: 'Sigma0', dataIndex: 'sigma0', key: 'sigma0' },
            ]}
          />
        </Space>
      </PageSection>

      <PageSection title="卫星历史状态">
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Form layout="inline">
            <Form.Item label="星座">
              <Select
                allowClear
                style={{ width: 160 }}
                value={selectedSatelliteSystem}
                onChange={(value) => setSelectedSatelliteSystem(value)}
                options={[{ value: 'GPS' }, { value: 'BDS' }, { value: 'GAL' }, { value: 'GLO' }]}
              />
            </Form.Item>
            <Form.Item label="卫星 PRN">
              <Select
                allowClear
                showSearch
                style={{ width: 180 }}
                value={selectedSatellitePrn}
                onChange={(value) => setSelectedSatellitePrn(value)}
                options={satellitePrnOptions}
              />
            </Form.Item>
          </Form>
          <ReactECharts option={satelliteChartOption} style={{ height: 320 }} />
          <Table
            rowKey={(row: SatelliteHistoryItem) => `${row.job_id}-${row.epoch_time}-${row.satellite_prn}`}
            dataSource={satelliteHistory ?? []}
            pagination={{ pageSize: 6 }}
            columns={[
              { title: '时刻', dataIndex: 'epoch_time', key: 'epoch_time' },
              { title: '星座', dataIndex: 'satellite_system', key: 'satellite_system' },
              { title: 'PRN', dataIndex: 'satellite_prn', key: 'satellite_prn' },
              { title: 'SNR', dataIndex: 'snr', key: 'snr' },
              { title: '仰角', dataIndex: 'elevation_deg', key: 'elevation_deg' },
              { title: '码残差', dataIndex: 'residual_code', key: 'residual_code' },
              { title: '状态', dataIndex: 'health_status', key: 'health_status', render: (value: string) => <StatusTag value={value} /> },
            ]}
          />
        </Space>
      </PageSection>
    </Space>
  );
}
