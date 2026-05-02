import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';

import { api } from '../api';
import { PageSection } from '../components/PageSection';
import { StatusTag } from '../components/StatusTag';
import type { RinexFile, Site, SolutionEpoch, SolveJob, SppPrecheck } from '../types';

type SppFormValues = {
  siteId: number;
  observationFileId: number;
  navigationFileIds: number[];
  epochTime: Dayjs;
  constellations: string[];
  elevationMaskDeg: number;
};

export function SolveJobsPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<SppFormValues>();
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [precheckResult, setPrecheckResult] = useState<SppPrecheck | null>(null);

  const { data: sites } = useQuery({
    queryKey: ['sites', 'solve-form'],
    queryFn: () => api.getSites(new URLSearchParams({ page: '1', page_size: '200' })),
  });
  const { data: rinexFiles } = useQuery({
    queryKey: ['rinex-files', 'solve-form'],
    queryFn: () => api.getRinexFiles(new URLSearchParams({ page: '1', page_size: '200', file_type: 'obs' })),
  });
  const { data: navFiles } = useQuery({
    queryKey: ['rinex-files', 'solve-form', 'nav'],
    queryFn: () => api.getRinexFiles(new URLSearchParams({ page: '1', page_size: '200', file_type: 'nav' })),
  });
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['solve-jobs'],
    queryFn: api.getSolveJobs,
  });
  const { data: activeJob } = useQuery({
    queryKey: ['solve-job', activeJobId],
    queryFn: () => api.getSolveJob(activeJobId!),
    enabled: activeJobId !== null,
  });
  const { data: activeResult } = useQuery({
    queryKey: ['solve-result', activeJobId],
    queryFn: () => api.getSolveResult(activeJobId!),
    enabled: activeJobId !== null,
  });
  const { data: activeEpochs } = useQuery({
    queryKey: ['solve-epochs', activeJobId],
    queryFn: () => api.getSolveEpochs(activeJobId!),
    enabled: activeJobId !== null,
  });
  const { data: activeSatellites } = useQuery({
    queryKey: ['solve-satellites', activeJobId],
    queryFn: () => api.getSolveSatellites(activeJobId!),
    enabled: activeJobId !== null,
  });

  const createMutation = useMutation({
    mutationFn: api.createSppSolveJob,
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ['solve-jobs'] });
      setActiveJobId(job.id);
      if (job.status === 'succeeded') {
        messageApi.success(`SPP 任务已完成，任务号 ${job.id}`);
      } else {
        messageApi.warning(`SPP 任务已返回失败结果，任务号 ${job.id}`);
      }
    },
    onError: (error) => {
      messageApi.error(error instanceof Error ? error.message : 'SPP 任务提交失败');
    },
  });
  const precheckMutation = useMutation({
    mutationFn: api.precheckSppSolveJob,
    onSuccess: (result) => {
      setPrecheckResult(result);
      if (result.status === 'ready') {
        messageApi.success('预检通过，可以提交解算');
      } else if (result.status === 'risky') {
        messageApi.warning('预检提示存在风险，建议先查看候选历元');
      } else {
        messageApi.warning('预检显示当前配置不可用');
      }
    },
    onError: (error) => {
      setPrecheckResult(null);
      messageApi.error(error instanceof Error ? error.message : '预检失败');
    },
  });

  const selectedSiteId = Form.useWatch('siteId', form);

  const siteOptions =
    sites?.items.map((site: Site) => ({
      value: site.id,
      label: `${site.four_char_id ?? '----'} ${site.name ?? ''}`.trim(),
    })) ?? [];

  const observationOptions = useMemo(() => {
    return (rinexFiles?.items ?? [])
      .filter((file) => !selectedSiteId || file.site_id === selectedSiteId)
      .map((file: RinexFile) => ({
        value: file.id,
        label: `${file.four_char_id ?? file.station_id ?? '----'} / ${file.filename}`,
      }));
  }, [rinexFiles, selectedSiteId]);

  const navigationOptions = useMemo(() => {
    return (navFiles?.items ?? [])
      .filter((file) => !selectedSiteId || file.site_id === selectedSiteId)
      .map((file: RinexFile) => ({
        value: file.id,
        label: `${file.four_char_id ?? file.station_id ?? '----'} / ${file.filename}`,
      }));
  }, [navFiles, selectedSiteId]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    createMutation.mutate({
      siteId: values.siteId,
      observationFileId: values.observationFileId,
      navigationFileIds: values.navigationFileIds,
      epochTime: values.epochTime.toISOString(),
      constellations: values.constellations,
      elevationMaskDeg: Number(values.elevationMaskDeg),
      models: {
        ionosphere: 'broadcast',
        troposphere: 'saastamoinen',
        earthRotation: true,
        relativity: true,
      },
    });
  };

  const handlePrecheck = async () => {
    const values = await form.validateFields();
    precheckMutation.mutate({
      siteId: values.siteId,
      observationFileId: values.observationFileId,
      navigationFileIds: values.navigationFileIds,
      epochTime: values.epochTime.toISOString(),
      constellations: values.constellations,
      elevationMaskDeg: Number(values.elevationMaskDeg),
      searchWindowMinutes: 60,
      maxCandidateEpochs: 8,
      models: {
        ionosphere: 'broadcast',
        troposphere: 'saastamoinen',
        earthRotation: true,
        relativity: true,
      },
    });
  };

  const handleApplyCandidateEpoch = (epochTime: string) => {
    form.setFieldsValue({
      epochTime: dayjs(epochTime),
    });
    messageApi.success(`已回填候选历元 ${dayjs(epochTime).format('YYYY-MM-DD HH:mm:ss')}`);
  };

  const columns = [
    {
      title: '任务号',
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: '类型',
      dataIndex: 'job_type',
      key: 'job_type',
      render: (value: string) => <Tag color="blue">{value.toUpperCase()}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <StatusTag value={value} />,
    },
    {
      title: '引擎',
      dataIndex: 'engine',
      key: 'engine',
      render: (value: string | null) => value ?? '-',
    },
    {
      title: '摘要',
      key: 'summary',
      render: (_: unknown, record: SolveJob) => {
        const summary = record.summary ?? {};
        return (
          <Space direction="vertical" size={0}>
            <Typography.Text type="secondary">
              站点: {(summary.stationId as string | undefined) ?? '-'}
            </Typography.Text>
            <Typography.Text type="secondary">
              卫星数: {(summary.nsatUsed as number | undefined) ?? '-'}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: SolveJob) => (
        <Button size="small" onClick={() => setActiveJobId(record.id)}>
          查看结果
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }} className="page-stack">
      {contextHolder}
      <div className="page-hero">
        <div className="page-hero-kicker">解算任务</div>
        <h1 className="page-hero-title">先预检，再提交单点定位解算任务。</h1>
        <div className="page-hero-meta">
          <span>{jobs?.total ?? 0} 个任务已记录</span>
          <span className="page-hero-meta-dot" />
          <span>{navFiles?.total ?? 0} 个导航文件可用</span>
        </div>
      </div>
      <PageSection
        title="SPP 单点定位"
        kicker="创建任务"
        extra={
          <Space>
            <Button className="page-button" loading={precheckMutation.isPending} onClick={handlePrecheck}>
              执行预检
            </Button>
            <Button className="page-button" type="primary" loading={createMutation.isPending} onClick={handleSubmit}>
              提交 SPP 任务
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            navigationFileIds: [],
            constellations: ['GPS'],
            elevationMaskDeg: 10,
            epochTime: dayjs(),
          }}
        >
          <div className="grid-form grid-form-3">
            <Form.Item label="站点" name="siteId" rules={[{ required: true, message: '请选择站点' }]}>
              <Select className="page-select" showSearch options={siteOptions} optionFilterProp="label" />
            </Form.Item>
            <Form.Item
              label="观测文件"
              name="observationFileId"
              rules={[{ required: true, message: '请选择本地观测文件' }]}
            >
              <Select className="page-select" showSearch options={observationOptions} optionFilterProp="label" />
            </Form.Item>
            <Form.Item
              label="导航文件"
              name="navigationFileIds"
              rules={[{ required: true, message: '请选择至少一个本地导航文件' }]}
              extra="默认推荐先用 GPS。Galileo 已接入实验性求解链路，可手动开启联调。"
            >
              <Select className="page-select" mode="multiple" showSearch options={navigationOptions} optionFilterProp="label" />
            </Form.Item>
            <Form.Item label="解算时刻" name="epochTime" rules={[{ required: true, message: '请选择时刻' }]}>
              <DatePicker className="page-picker" showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="星座" name="constellations">
              <Select className="page-select" mode="multiple" options={[{ value: 'GPS' }, { value: 'GAL' }, { value: 'BDS', disabled: true }, { value: 'GLO', disabled: true }]} />
            </Form.Item>
            <Form.Item label="截止高度角" name="elevationMaskDeg">
              <Select className="page-select" options={[{ value: 5 }, { value: 10 }, { value: 15 }, { value: 20 }]} />
            </Form.Item>
          </div>
        </Form>

        {precheckResult ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type={
                precheckResult.status === 'ready'
                  ? 'success'
                  : precheckResult.status === 'risky'
                    ? 'warning'
                    : 'error'
              }
              message={`预检结论：${precheckResult.recommendation}`}
              action={
                precheckResult.nearestCandidateEpochTime ? (
                  <Button size="small" type="primary" onClick={() => handleApplyCandidateEpoch(precheckResult.nearestCandidateEpochTime!)}>
                    回填最近候选历元
                  </Button>
                ) : undefined
              }
              showIcon
            />
            <Descriptions bordered column={2}>
              <Descriptions.Item label="预检状态">
                <StatusTag value={precheckResult.status} />
              </Descriptions.Item>
              <Descriptions.Item label="搜索窗口">
                {precheckResult.searchWindowMinutes} 分钟
              </Descriptions.Item>
              <Descriptions.Item label="最近候选历元">
                {precheckResult.nearestCandidateEpochTime ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="距请求时刻偏差">
                {precheckResult.nearestCandidateOffsetSeconds ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="候选历元数">
                {precheckResult.candidateEpochCount}
              </Descriptions.Item>
              <Descriptions.Item label="导航覆盖星座">
                {precheckResult.availableNavSystems.join(', ') || '-'}
              </Descriptions.Item>
            </Descriptions>
            {precheckResult.reasons.length > 0 ? (
              <Alert
                type="info"
                showIcon
                message={precheckResult.reasons.join(' ')}
              />
            ) : null}
            <Table
              className="soft-table"
              rowKey={(row) => row.epochTime}
              dataSource={precheckResult.candidateEpochs}
              pagination={{ pageSize: 5 }}
              columns={[
                {
                  title: '候选历元',
                  dataIndex: 'epochTime',
                  key: 'epochTime',
                },
                {
                  title: '偏差(秒)',
                  dataIndex: 'offsetSeconds',
                  key: 'offsetSeconds',
                },
                {
                  title: '总卫星数',
                  dataIndex: 'totalSatellites',
                  key: 'totalSatellites',
                },
                {
                  title: '分系统',
                  key: 'perSystemCounts',
                  render: (_: unknown, row: SppPrecheck['candidateEpochs'][number]) =>
                    Object.entries(row.perSystemCounts)
                      .map(([system, count]) => `${system}:${count}`)
                      .join(' / '),
                },
                {
                  title: '卫星样本',
                  key: 'satellites',
                  render: (_: unknown, row: SppPrecheck['candidateEpochs'][number]) =>
                    row.satellites.join(', '),
                },
                {
                  title: '操作',
                  key: 'actions',
                  render: (_: unknown, row: SppPrecheck['candidateEpochs'][number]) => (
                    <Button size="small" onClick={() => handleApplyCandidateEpoch(row.epochTime)}>
                      回填时刻
                    </Button>
                  ),
                },
              ]}
            />
          </Space>
        ) : null}
      </PageSection>

      <PageSection title="解算任务列表" kicker="任务列表">
        <Table className="soft-table" rowKey="id" loading={jobsLoading} dataSource={jobs?.items ?? []} columns={columns} pagination={false} />
      </PageSection>

      <Drawer
        width={840}
        open={activeJobId !== null}
        title={activeJob ? `任务 #${activeJob.id} 结果` : '解算结果'}
        onClose={() => setActiveJobId(null)}
      >
        {activeJob && activeResult ? (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="任务状态">
                <StatusTag value={activeJob.status} />
              </Descriptions.Item>
              <Descriptions.Item label="引擎">{activeResult.engine}</Descriptions.Item>
              <Descriptions.Item label="错误信息">
                {activeJob.error_message ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="解算模式">
                {(activeResult.summary.mode as string | undefined)?.toUpperCase() ?? 'SPP'}
              </Descriptions.Item>
              <Descriptions.Item label="站点">
                {(activeResult.summary.stationId as string | undefined) ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="解状态">
                <StatusTag value={(activeResult.summary.solutionStatus as string | undefined) ?? 'code'} />
              </Descriptions.Item>
              <Descriptions.Item label="使用卫星数">
                {(activeResult.summary.nsatUsed as number | undefined) ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="请求时刻">
                {(activeResult.summary.requestedEpochTime as string | undefined) ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="实际解算时刻">
                {(activeResult.summary.solvedEpochTime as string | undefined) ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="请求高度角">
                {String(activeResult.summary.requestedElevationMaskDeg ?? '-')}
              </Descriptions.Item>
              <Descriptions.Item label="实际高度角">
                {String(activeResult.summary.appliedElevationMaskDeg ?? '-')}
              </Descriptions.Item>
              <Descriptions.Item label="有效历元">
                {(activeResult.summary.validEpochCount as number | undefined) ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="观测文件">
                {(activeResult.summary.observationFilename as string | undefined) ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="PDOP">{String(activeResult.quality.pdop ?? '-')}</Descriptions.Item>
              <Descriptions.Item label="Sigma0">{String(activeResult.quality.sigma0 ?? '-')}</Descriptions.Item>
            </Descriptions>

            <PageSection title="历元结果" kicker="历元解">
              <Table
                className="soft-table"
                rowKey="id"
                dataSource={(activeEpochs ?? []) as SolutionEpoch[]}
                pagination={false}
                columns={[
                  {
                    title: '时刻',
                    dataIndex: 'epoch_time',
                    key: 'epoch_time',
                    render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
                  },
                  {
                    title: '解状态',
                    dataIndex: 'solution_status',
                    key: 'solution_status',
                    render: (value: string) => <StatusTag value={value} />,
                  },
                  {
                    title: '经纬高',
                    key: 'blh',
                    render: (_: unknown, row: SolutionEpoch) =>
                      `${row.latitude?.toFixed(6) ?? '-'}, ${row.longitude?.toFixed(6) ?? '-'}, ${row.height?.toFixed(3) ?? '-'}`,
                  },
                  {
                    title: 'ECEF XYZ',
                    key: 'xyz',
                    render: (_: unknown, row: SolutionEpoch) =>
                      `${row.x?.toFixed(3) ?? '-'}, ${row.y?.toFixed(3) ?? '-'}, ${row.z?.toFixed(3) ?? '-'}`,
                  },
                  {
                    title: 'DOP',
                    key: 'dop',
                    render: (_: unknown, row: SolutionEpoch) =>
                      `P:${row.pdop ?? '-'} / H:${row.hdop ?? '-'} / V:${row.vdop ?? '-'}`,
                  },
                  {
                    title: '卫星数',
                    dataIndex: 'nsat_used',
                    key: 'nsat_used',
                  },
                ]}
              />
            </PageSection>

            {Array.isArray(activeResult.summary.attemptDiagnostics) &&
            activeResult.summary.attemptDiagnostics.length > 0 ? (
              <PageSection title="失败诊断">
                <Table
                  className="soft-table"
                  rowKey={(row) => `${String(row.epochTime)}-${String(row.elevationMaskDeg)}`}
                  dataSource={activeResult.summary.attemptDiagnostics as Array<Record<string, unknown>>}
                  pagination={{ pageSize: 6 }}
                  columns={[
                    { title: '候选历元', dataIndex: 'epochTime', key: 'epochTime' },
                    { title: '高度角', dataIndex: 'elevationMaskDeg', key: 'elevationMaskDeg' },
                    { title: '已用卫星', dataIndex: 'usedSatellites', key: 'usedSatellites' },
                    { title: '失败原因', dataIndex: 'error', key: 'error' },
                  ]}
                />
              </PageSection>
            ) : null}

            <PageSection title="卫星状态" kicker="卫星状态">
              <Table
                className="soft-table"
                rowKey={(row) => `${row.job_id}-${row.epoch_time}-${row.satellite_prn}`}
                dataSource={activeSatellites ?? []}
                pagination={{ pageSize: 6 }}
                columns={[
                  { title: '时刻', dataIndex: 'epoch_time', key: 'epoch_time' },
                  { title: '星座', dataIndex: 'satellite_system', key: 'satellite_system' },
                  { title: 'PRN', dataIndex: 'satellite_prn', key: 'satellite_prn' },
                  { title: 'SNR', dataIndex: 'snr', key: 'snr' },
                  { title: '仰角', dataIndex: 'elevation_deg', key: 'elevation_deg' },
                  { title: '方位角', dataIndex: 'azimuth_deg', key: 'azimuth_deg' },
                  { title: '码残差', dataIndex: 'residual_code', key: 'residual_code' },
                  {
                    title: '健康状态',
                    dataIndex: 'health_status',
                    key: 'health_status',
                    render: (value: string) => <StatusTag value={value} />,
                  },
                ]}
              />
            </PageSection>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
