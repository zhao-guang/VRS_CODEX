import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';

import { api } from '../api';
import { PageSection } from '../components/PageSection';
import { StatusTag } from '../components/StatusTag';
import type { RinexFile, RinexRemoteFile, Site } from '../types';

type QueryFormValues = {
  siteIds: number[];
  dateRange: [Dayjs, Dayjs];
  filePeriod: string[];
  fileType: string[];
  rinexVersion: string[];
  metadataStatus: string;
  decompress: boolean;
};

export function ObservationsPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<QueryFormValues>();
  const [remoteResults, setRemoteResults] = useState<RinexRemoteFile[]>([]);
  const [selectedRemoteKeys, setSelectedRemoteKeys] = useState<React.Key[]>([]);
  const [activeFileId, setActiveFileId] = useState<number | null>(null);

  const { data: sites } = useQuery({
    queryKey: ['sites', 'observation-options'],
    queryFn: () => api.getSites(new URLSearchParams({ page: '1', page_size: '2000' })),
  });
  const { data: localFiles, isLoading: localLoading } = useQuery({
    queryKey: ['rinex-files'],
    queryFn: () => api.getRinexFiles(new URLSearchParams({ page: '1', page_size: '100' })),
  });
  const { data: activeFile } = useQuery({
    queryKey: ['rinex-file', activeFileId],
    queryFn: () => api.getRinexFile(activeFileId!),
    enabled: activeFileId !== null,
  });
  const { data: activeHeader } = useQuery({
    queryKey: ['rinex-file-header', activeFileId],
    queryFn: () => api.getRinexFileHeader(activeFileId!),
    enabled: activeFileId !== null,
  });
  const { data: activeEpochs } = useQuery({
    queryKey: ['rinex-file-epochs', activeFileId],
    queryFn: () => api.getRinexFileEpochs(activeFileId!),
    enabled: activeFileId !== null,
  });

  const remoteQueryMutation = useMutation({
    mutationFn: api.queryRemoteRinexFiles,
    onSuccess: (items) => {
      setRemoteResults(items);
      setSelectedRemoteKeys([]);
      messageApi.success(`远端查询完成，返回 ${items.length} 个文件`);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: api.downloadRinexFiles,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['rinex-files'] });
      messageApi.success(`下载完成：${result.items.length} 个文件`);
    },
  });

  const reindexMutation = useMutation({
    mutationFn: api.reindexRinexFiles,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rinex-files'] });
      if (activeFileId) {
        queryClient.invalidateQueries({ queryKey: ['rinex-file', activeFileId] });
        queryClient.invalidateQueries({ queryKey: ['rinex-file-header', activeFileId] });
        queryClient.invalidateQueries({ queryKey: ['rinex-file-epochs', activeFileId] });
      }
      messageApi.success('文件已重新索引');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteRinexFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rinex-files'] });
      messageApi.success('本地文件已删除');
      setActiveFileId(null);
    },
  });

  const handleRemoteQuery = async () => {
    const values = await form.validateFields();
    remoteQueryMutation.mutate({
      siteIds: values.siteIds,
      startDate: values.dateRange[0].startOf('day').toISOString(),
      endDate: values.dateRange[1].endOf('day').toISOString(),
      filePeriod: values.filePeriod,
      fileType: values.fileType,
      rinexVersion: values.rinexVersion,
      metadataStatus: values.metadataStatus,
      decompress: values.decompress,
    });
  };

  const handleDownloadSelected = () => {
    const selectedItems = remoteResults.filter((item) => selectedRemoteKeys.includes(item.fileId));
    if (selectedItems.length === 0) {
      messageApi.warning('请先选择要下载的远端文件');
      return;
    }
    downloadMutation.mutate({
      items: selectedItems.map((item) => ({
        stationId: item.siteId,
        remoteFileId: item.fileId,
        remoteUrl: item.fileLocation,
        filename: item.filename,
        fileType: item.fileType,
        filePeriod: item.filePeriod,
        rinexVersion: item.rinexVersion,
        metadataStatus: item.metadataStatus,
        startDate: item.startDate,
        fileSize: item.fileSize,
      })),
      overwrite: false,
      autoIndex: true,
    });
  };

  const siteOptions =
    sites?.items.map((site: Site) => ({
      value: site.id,
      label: `${site.four_char_id ?? '----'} ${site.name ?? ''}`.trim(),
    })) ?? [];

  const localColumns = [
    {
      title: '文件名',
      key: 'filename',
      render: (_: unknown, record: RinexFile) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.filename}</Typography.Text>
          <Typography.Text type="secondary">
            {record.four_char_id ?? record.station_id ?? '-'} / {record.site_name ?? '未绑定站点'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'file_type',
      key: 'file_type',
      render: (value: string | null) => value || '-',
    },
    {
      title: '周期',
      dataIndex: 'file_period',
      key: 'file_period',
    },
    {
      title: 'RINEX',
      dataIndex: 'rinex_version',
      key: 'rinex_version',
    },
    {
      title: '下载',
      dataIndex: 'download_status',
      key: 'download_status',
      render: (value: string) => <StatusTag value={value} />,
    },
    {
      title: '索引',
      dataIndex: 'index_status',
      key: 'index_status',
      render: (value: string) => <StatusTag value={value} />,
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: RinexFile) => (
        <Space>
          <Button size="small" onClick={() => setActiveFileId(record.id)}>
            详情
          </Button>
          <Button size="small" onClick={() => reindexMutation.mutate([record.id])}>
            重索引
          </Button>
          <Popconfirm title="确认删除本地文件吗？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const remoteColumns = [
    {
      title: '站点',
      key: 'siteId',
      render: (_: unknown, record: RinexRemoteFile) => <Typography.Text strong>{record.siteId}</Typography.Text>,
    },
    { title: '文件名', dataIndex: 'filename', key: 'filename' },
    { title: '类型', dataIndex: 'fileType', key: 'fileType' },
    { title: '周期', dataIndex: 'filePeriod', key: 'filePeriod' },
    { title: 'RINEX', dataIndex: 'rinexVersion', key: 'rinexVersion' },
    {
      title: '起始时间',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '元数据状态',
      dataIndex: 'metadataStatus',
      key: 'metadataStatus',
      render: (value: string) => <StatusTag value={value} />,
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'fileSize',
      render: (value: number | null) => (value ? `${(value / 1024).toFixed(1)} KB` : '-'),
    },
    {
      title: '错误数',
      key: 'metadataErrors',
      render: (_: unknown, record: RinexRemoteFile) =>
        record.metadataErrors.length > 0 ? <Tag color="red">{record.metadataErrors.length}</Tag> : <Tag>0</Tag>,
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }} className="page-stack">
      {contextHolder}
      <div className="page-hero">
        <div className="page-hero-kicker">观测数据</div>
        <h1 className="page-hero-title">统一查询、下载与检查观测文件资产。</h1>
        <p className="page-hero-copy">
          页面沿用现有 GA 查询、下载和本地索引闭环，但视觉结构已经参考设计稿统一成更偏任务台的布局。
        </p>
        <div className="page-hero-meta">
          <span>{localFiles?.total ?? 0} 个本地文件</span>
          <span className="page-hero-meta-dot" />
          <span>{remoteResults.length} 个远端候选文件</span>
        </div>
      </div>
      <PageSection
        title="远端 RINEX 查询"
        kicker="远端目录"
        extra={
          <Space>
            <Button className="page-button" onClick={handleRemoteQuery} loading={remoteQueryMutation.isPending} type="primary">
              查询远端
            </Button>
            <Button className="page-button" onClick={handleDownloadSelected} loading={downloadMutation.isPending}>
              下载选中文件
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            filePeriod: ['01D'],
            fileType: ['obs'],
            rinexVersion: ['3'],
            metadataStatus: 'valid',
            decompress: true,
            siteIds: [],
            dateRange: [dayjs().subtract(7, 'day'), dayjs()],
          }}
        >
          <div className="grid-form grid-form-3">
            <Form.Item label="站点" name="siteIds" rules={[{ required: true, message: '请选择至少一个站点' }]}>
              <Select className="page-select" mode="multiple" showSearch options={siteOptions} optionFilterProp="label" />
            </Form.Item>
            <Form.Item label="时间范围" name="dateRange" rules={[{ required: true, message: '请选择时间范围' }]}>
              <DatePicker.RangePicker className="page-picker" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="元数据状态" name="metadataStatus">
              <Select
                className="page-select"
                options={[
                  { value: 'valid', label: 'valid' },
                  { value: 'invalid', label: 'invalid' },
                  { value: 'unvalidated', label: 'unvalidated' },
                  { value: 'all', label: 'all' },
                ]}
              />
            </Form.Item>
            <Form.Item label="文件周期" name="filePeriod">
              <Select className="page-select" mode="multiple" options={[{ value: '01D' }, { value: '01H' }, { value: '15M' }]} />
            </Form.Item>
            <Form.Item label="文件类型" name="fileType">
              <Select className="page-select" mode="multiple" options={[{ value: 'obs' }, { value: 'nav' }, { value: 'met' }]} />
            </Form.Item>
            <Form.Item label="RINEX 版本" name="rinexVersion">
              <Select className="page-select" mode="multiple" options={[{ value: '2' }, { value: '3' }, { value: '4' }]} />
            </Form.Item>
            <Form.Item
              label="下载前解压"
              name="decompress"
              valuePropName="checked"
              extra="开启后优先获取可直接被 solver 读取的明文 RINEX 文件。"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
          </div>
        </Form>
      </PageSection>

      <PageSection title="远端查询结果" kicker="远端结果">
        <Table
          className="soft-table"
          rowKey="fileId"
          loading={remoteQueryMutation.isPending}
          dataSource={remoteResults}
          columns={remoteColumns}
          rowSelection={{
            selectedRowKeys: selectedRemoteKeys,
            onChange: setSelectedRemoteKeys,
          }}
          pagination={{ pageSize: 10 }}
        />
      </PageSection>

      <PageSection title="本地已下载文件" kicker="本地缓存">
        <Table
          className="soft-table"
          rowKey="id"
          loading={localLoading}
          dataSource={localFiles?.items ?? []}
          columns={localColumns}
          pagination={{ pageSize: 10 }}
        />
      </PageSection>

      <Drawer
        width={720}
        open={activeFileId !== null}
        title={activeFile?.filename ?? 'RINEX 文件详情'}
        onClose={() => setActiveFileId(null)}
      >
        {activeFile ? (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Descriptions bordered column={1}>
              <Descriptions.Item label="站点">
                {activeFile.four_char_id ?? activeFile.station_id ?? '-'} / {activeFile.site_name ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="本地路径">{activeFile.local_path ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="文件类型">{activeFile.file_type ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="文件周期">{activeFile.file_period ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="RINEX 版本">{activeFile.rinex_version ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="压缩类型">{activeFile.compression_type ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="采样间隔">
                {activeEpochs?.sample_interval_seconds ?? activeFile.sample_interval_seconds ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="时间覆盖">
                {(activeEpochs?.start_time || activeFile.start_time || '-') +
                  ' ~ ' +
                  (activeEpochs?.end_time || activeFile.end_time || '-')}
              </Descriptions.Item>
              <Descriptions.Item label="星座">
                {(activeFile.constellations_json ?? []).join(', ') || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="索引状态">
                <StatusTag value={activeFile.index_status} />
              </Descriptions.Item>
              <Descriptions.Item label="错误信息">{activeFile.last_error ?? '-'}</Descriptions.Item>
            </Descriptions>

            <PageSection title="头部摘要">
              <Typography.Paragraph>
                观测类型系统数：{Object.keys(activeHeader?.header?.observation_types ?? {}).length}
              </Typography.Paragraph>
              <Typography.Text type="secondary">头部前 120 行：</Typography.Text>
              <pre className="header-preview">
                {(activeHeader?.header?.header_lines ?? []).join('\n') || '暂无头部信息'}
              </pre>
            </PageSection>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
