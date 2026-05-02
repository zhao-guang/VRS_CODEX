import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { PageSection } from '../components/PageSection';
import { SiteLeafletMap } from '../components/SiteLeafletMap';
import { StatusTag } from '../components/StatusTag';
import { useFilterStore } from '../store';
import type { PageResponse, RinexFile, RinexRemoteFile, Site, SolveJob, SppPrecheck, SolutionEpoch } from '../types';

const SITE_MAP_PAGE_SIZE = 200;

type FormValues = {
  name?: string;
  fourCharId?: string;
  domesNumber?: string;
  siteStatus?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  ellipsoidalHeight?: number;
  monumentDescription?: string;
  monumentFoundation?: string;
  markerDescription?: string;
  monumentHeight?: string;
};

type SppSiteFormValues = {
  observationFileId: number;
  navigationFileIds: number[];
  epochTime: Dayjs;
  constellations: string[];
  elevationMaskDeg: number;
};

type SiteObservationQueryValues = {
  dateRange: [Dayjs, Dayjs];
  filePeriod: string[];
  fileType: string[];
  rinexVersion: string[];
  metadataStatus: string;
  decompress: boolean;
};

async function getAllSiteMapSites(): Promise<PageResponse<Site>> {
  const firstPage = await api.getSites(new URLSearchParams({ page: '1', page_size: String(SITE_MAP_PAGE_SIZE) }));
  const totalPages = Math.ceil(firstPage.total / SITE_MAP_PAGE_SIZE);

  if (totalPages <= 1) {
    return firstPage;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      api.getSites(
        new URLSearchParams({
          page: String(index + 2),
          page_size: String(SITE_MAP_PAGE_SIZE),
        }),
      ),
    ),
  );

  return {
    ...firstPage,
    items: [firstPage, ...remainingPages].flatMap((page) => page.items),
  };
}

function toSitePayload(values: FormValues) {
  return {
    name: values.name,
    fourCharId: values.fourCharId,
    domesNumber: values.domesNumber,
    siteStatus: values.siteStatus,
    description: values.description,
    approximatePosition: {
      latitude: values.latitude,
      longitude: values.longitude,
      ellipsoidalHeight: values.ellipsoidalHeight,
    },
    monument: {
      description: values.monumentDescription,
      foundation: values.monumentFoundation,
      markerDescription: values.markerDescription,
      height: values.monumentHeight,
    },
  };
}

function detailText(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

function detailDate(value: string | null | undefined) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-';
}

function rinexOptionLabel(file: RinexFile) {
  const station = file.four_char_id ?? file.station_id ?? '----';
  const timeRange = file.start_time ? ` / ${dayjs(file.start_time).format('MM-DD HH:mm')}` : '';
  return `${station} / ${file.filename}${timeRange}`;
}

function coordinateErrorAnalysis(site: Site | undefined, epoch: SolutionEpoch | undefined) {
  if (
    !site ||
    !epoch ||
    site.latitude === null ||
    site.longitude === null ||
    site.ellipsoidal_height === null ||
    epoch.latitude === null ||
    epoch.longitude === null ||
    epoch.height === null
  ) {
    return null;
  }

  const latitudeScale = 111_320;
  const longitudeScale = 111_320 * Math.cos((site.latitude * Math.PI) / 180);
  const northError = (epoch.latitude - site.latitude) * latitudeScale;
  const eastError = (epoch.longitude - site.longitude) * longitudeScale;
  const heightError = epoch.height - site.ellipsoidal_height;
  const horizontalError = Math.sqrt(eastError ** 2 + northError ** 2);
  const spatialError = Math.sqrt(horizontalError ** 2 + heightError ** 2);

  return {
    eastError,
    northError,
    heightError,
    horizontalError,
    spatialError,
  };
}

function formatMeters(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-';
  }

  return `${value.toFixed(3)} m`;
}

export function SitesPage() {
  const queryClient = useQueryClient();
  const { siteKeyword, setSiteKeyword } = useFilterStore();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FormValues>();
  const [solveForm] = Form.useForm<SppSiteFormValues>();
  const [observationForm] = Form.useForm<SiteObservationQueryValues>();
  const [editing, setEditing] = useState<Site | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<number | null>(null);
  const [sitePrecheckResult, setSitePrecheckResult] = useState<SppPrecheck | null>(null);
  const [submittedSolveJob, setSubmittedSolveJob] = useState<SolveJob | null>(null);
  const [submittedSolveJobId, setSubmittedSolveJobId] = useState<number | null>(null);
  const [siteRemoteResults, setSiteRemoteResults] = useState<RinexRemoteFile[]>([]);
  const [selectedSiteRemoteKeys, setSelectedSiteRemoteKeys] = useState<string[]>([]);
  const [activeRinexFileId, setActiveRinexFileId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const params = useMemo(() => {
    const searchParams = new URLSearchParams({ page: '1', page_size: '50' });
    if (siteKeyword) {
      searchParams.set('keyword', siteKeyword);
    }
    return searchParams;
  }, [siteKeyword]);

  const { data, isLoading } = useQuery({
    queryKey: ['sites', params.toString()],
    queryFn: () => api.getSites(params),
  });
  const { data: mapSites } = useQuery({
    queryKey: ['sites', 'map', 'all'],
    queryFn: getAllSiteMapSites,
  });
  const { data: activeSite, isLoading: activeSiteLoading } = useQuery({
    queryKey: ['site-detail', activeSiteId],
    queryFn: () => api.getSite(activeSiteId as number),
    enabled: activeSiteId !== null,
  });
  const { data: siteLocalFiles, isLoading: siteLocalFilesLoading } = useQuery({
    queryKey: ['rinex-files', 'site-detail', activeSiteId],
    queryFn: () =>
      api.getRinexFiles(
        new URLSearchParams({
          page: '1',
          page_size: '200',
          site_id: String(activeSiteId),
        }),
      ),
    enabled: activeSiteId !== null,
  });
  const { data: siteObservationFiles, isLoading: observationFilesLoading } = useQuery({
    queryKey: ['rinex-files', 'site-detail-solve', 'obs', activeSiteId],
    queryFn: () =>
      api.getRinexFiles(
        new URLSearchParams({
          page: '1',
          page_size: '200',
          file_type: 'obs',
          site_id: String(activeSiteId),
        }),
      ),
    enabled: activeSiteId !== null,
  });
  const { data: navigationFiles, isLoading: navigationFilesLoading } = useQuery({
    queryKey: ['rinex-files', 'site-detail-solve', 'nav'],
    queryFn: () => api.getRinexFiles(new URLSearchParams({ page: '1', page_size: '200', file_type: 'nav' })),
    enabled: activeSiteId !== null,
  });
  const { data: activeRinexFile } = useQuery({
    queryKey: ['rinex-file', activeRinexFileId],
    queryFn: () => api.getRinexFile(activeRinexFileId as number),
    enabled: activeRinexFileId !== null,
  });
  const { data: activeRinexHeader } = useQuery({
    queryKey: ['rinex-file-header', activeRinexFileId],
    queryFn: () => api.getRinexFileHeader(activeRinexFileId as number),
    enabled: activeRinexFileId !== null,
  });
  const { data: activeRinexEpochs } = useQuery({
    queryKey: ['rinex-file-epochs', activeRinexFileId],
    queryFn: () => api.getRinexFileEpochs(activeRinexFileId as number),
    enabled: activeRinexFileId !== null,
  });
  const { data: submittedSolveEpochs } = useQuery({
    queryKey: ['solve-epochs', submittedSolveJobId],
    queryFn: () => api.getSolveEpochs(submittedSolveJobId as number),
    enabled: submittedSolveJobId !== null,
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => api.createSite(toSitePayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      messageApi.success('站点已创建');
      setOpen(false);
      form.resetFields();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: FormValues }) => api.updateSite(id, toSitePayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      messageApi.success('站点已更新');
      setOpen(false);
      setEditing(null);
      form.resetFields();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteSite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      messageApi.success('站点已删除');
    },
  });
  const sitePrecheckMutation = useMutation({
    mutationFn: api.precheckSppSolveJob,
    onSuccess: (result) => {
      setSitePrecheckResult(result);
      if (result.status === 'ready') {
        messageApi.success('站点解算预检通过');
      } else if (result.status === 'risky') {
        messageApi.warning('预检存在风险，可查看候选历元后再提交');
      } else {
        messageApi.warning('当前站点解算配置不可用');
      }
    },
    onError: (error) => {
      setSitePrecheckResult(null);
      messageApi.error(error instanceof Error ? error.message : '站点解算预检失败');
    },
  });
  const siteSolveMutation = useMutation({
    mutationFn: api.createSppSolveJob,
    onSuccess: (job) => {
      setSubmittedSolveJob(job);
      setSubmittedSolveJobId(job.id);
      queryClient.invalidateQueries({ queryKey: ['solve-jobs'] });
      if (job.status === 'succeeded') {
        messageApi.success(`SPP 解算已完成，任务号 ${job.id}`);
      } else {
        messageApi.warning(`SPP 解算已返回 ${job.status}，任务号 ${job.id}`);
      }
    },
    onError: (error) => {
      setSubmittedSolveJob(null);
      setSubmittedSolveJobId(null);
      messageApi.error(error instanceof Error ? error.message : 'SPP 解算提交失败');
    },
  });
  const siteRemoteQueryMutation = useMutation({
    mutationFn: api.queryRemoteRinexFiles,
    onSuccess: (items) => {
      setSiteRemoteResults(items);
      setSelectedSiteRemoteKeys([]);
      messageApi.success(`远端查询完成，返回 ${items.length} 个文件`);
    },
    onError: (error) => {
      setSiteRemoteResults([]);
      setSelectedSiteRemoteKeys([]);
      messageApi.error(error instanceof Error ? error.message : '远端 RINEX 查询失败');
    },
  });
  const siteDownloadMutation = useMutation({
    mutationFn: api.downloadRinexFiles,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['rinex-files'] });
      messageApi.success(`下载完成：${result.items.length} 个文件`);
    },
    onError: (error) => {
      messageApi.error(error instanceof Error ? error.message : 'RINEX 下载失败');
    },
  });
  const siteReindexMutation = useMutation({
    mutationFn: api.reindexRinexFiles,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rinex-files'] });
      if (activeRinexFileId) {
        queryClient.invalidateQueries({ queryKey: ['rinex-file', activeRinexFileId] });
        queryClient.invalidateQueries({ queryKey: ['rinex-file-header', activeRinexFileId] });
        queryClient.invalidateQueries({ queryKey: ['rinex-file-epochs', activeRinexFileId] });
      }
      messageApi.success('文件已重新索引');
    },
    onError: (error) => {
      messageApi.error(error instanceof Error ? error.message : '文件重索引失败');
    },
  });
  const siteDeleteRinexMutation = useMutation({
    mutationFn: api.deleteRinexFile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rinex-files'] });
      setActiveRinexFileId(null);
      messageApi.success('本地文件已删除');
    },
    onError: (error) => {
      messageApi.error(error instanceof Error ? error.message : '本地文件删除失败');
    },
  });

  useEffect(() => {
    if (activeSiteId === null) {
      solveForm.resetFields();
      observationForm.resetFields();
      return;
    }

    solveForm.setFieldsValue({
      navigationFileIds: [],
      constellations: ['GPS'],
      elevationMaskDeg: 10,
      epochTime: dayjs(),
    });
    observationForm.setFieldsValue({
      filePeriod: ['01D'],
      fileType: ['obs'],
      rinexVersion: ['3'],
      metadataStatus: 'valid',
      decompress: true,
      dateRange: [dayjs().subtract(7, 'day'), dayjs()],
    });
  }, [activeSiteId, observationForm, solveForm]);

  useEffect(() => {
    if (activeSiteId === null) {
      return;
    }

    const values = solveForm.getFieldsValue();
    const firstObservation = siteObservationFiles?.items[0];
    const sortedNavigationFiles = [...(navigationFiles?.items ?? [])].sort((first, second) => {
      const firstSameSite = first.site_id === activeSiteId ? 0 : 1;
      const secondSameSite = second.site_id === activeSiteId ? 0 : 1;
      return firstSameSite - secondSameSite;
    });
    const nextValues: Partial<SppSiteFormValues> = {};

    if (!values.observationFileId && firstObservation) {
      nextValues.observationFileId = firstObservation.id;
      if (firstObservation.start_time) {
        nextValues.epochTime = dayjs(firstObservation.start_time);
      }
    }

    if ((!values.navigationFileIds || values.navigationFileIds.length === 0) && sortedNavigationFiles[0]) {
      nextValues.navigationFileIds = [sortedNavigationFiles[0].id];
    }

    if (Object.keys(nextValues).length > 0) {
      solveForm.setFieldsValue(nextValues);
    }
  }, [activeSiteId, navigationFiles, siteObservationFiles, solveForm]);

  const observationOptions = useMemo(() => {
    return (siteObservationFiles?.items ?? []).map((file) => ({
      value: file.id,
      label: rinexOptionLabel(file),
    }));
  }, [siteObservationFiles]);

  const navigationOptions = useMemo(() => {
    return [...(navigationFiles?.items ?? [])]
      .sort((first, second) => {
        const firstSameSite = first.site_id === activeSiteId ? 0 : 1;
        const secondSameSite = second.site_id === activeSiteId ? 0 : 1;
        return firstSameSite - secondSameSite;
      })
      .map((file) => ({
        value: file.id,
        label: `${file.site_id === activeSiteId ? '本站' : '可用'} / ${rinexOptionLabel(file)}`,
      }));
  }, [activeSiteId, navigationFiles]);

  const coordinateAnalysis = coordinateErrorAnalysis(activeSite, submittedSolveEpochs?.[0]);

  const openSiteDetail = useCallback(
    (siteId: number) => {
      solveForm.resetFields();
      observationForm.resetFields();
      setSitePrecheckResult(null);
      setSubmittedSolveJob(null);
      setSubmittedSolveJobId(null);
      setSiteRemoteResults([]);
      setSelectedSiteRemoteKeys([]);
      setActiveRinexFileId(null);
      setActiveSiteId(siteId);
    },
    [observationForm, solveForm],
  );

  const siteLocalFileColumns = [
    {
      title: '文件名',
      key: 'filename',
      render: (_: unknown, record: RinexFile) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.filename}</Typography.Text>
          <Typography.Text type="secondary">
            {record.four_char_id ?? record.station_id ?? '-'} / {record.file_period ?? '-'}
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
      title: 'RINEX',
      dataIndex: 'rinex_version',
      key: 'rinex_version',
      render: (value: string | null) => value || '-',
    },
    {
      title: '时间覆盖',
      key: 'time',
      render: (_: unknown, record: RinexFile) => (
        <Typography.Text type="secondary">
          {record.start_time ? dayjs(record.start_time).format('MM-DD HH:mm') : '-'} ~{' '}
          {record.end_time ? dayjs(record.end_time).format('MM-DD HH:mm') : '-'}
        </Typography.Text>
      ),
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
          <Button size="small" onClick={() => setActiveRinexFileId(record.id)}>
            详情
          </Button>
          <Button size="small" loading={siteReindexMutation.isPending} onClick={() => siteReindexMutation.mutate([record.id])}>
            重索引
          </Button>
          <Popconfirm title="确认删除本地文件吗？" onConfirm={() => siteDeleteRinexMutation.mutate(record.id)}>
            <Button size="small" danger loading={siteDeleteRinexMutation.isPending}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const siteRemoteColumns = [
    {
      title: '文件名',
      key: 'filename',
      render: (_: unknown, record: RinexRemoteFile) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.filename}</Typography.Text>
          <Typography.Text type="secondary">
            {record.siteId} / {record.filePeriod} / {record.rinexVersion}
          </Typography.Text>
        </Space>
      ),
    },
    { title: '类型', dataIndex: 'fileType', key: 'fileType' },
    {
      title: '起始时间',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '元数据',
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
      title: '错误',
      key: 'metadataErrors',
      render: (_: unknown, record: RinexRemoteFile) =>
        record.metadataErrors.length > 0 ? <Tag color="red">{record.metadataErrors.length}</Tag> : <Tag>0</Tag>,
    },
  ];

  const columns = [
    {
      title: '站点',
      key: 'site',
      render: (_: unknown, record: Site) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.four_char_id || `SITE-${record.id}`}</Typography.Text>
          <Typography.Text type="secondary">{record.name || '未命名站点'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'DOMES',
      dataIndex: 'domes_number',
      key: 'domes_number',
    },
    {
      title: '位置',
      key: 'position',
      render: (_: unknown, record: Site) => (
        <Typography.Text type="secondary">
          {record.latitude?.toFixed(3) ?? '-'}, {record.longitude?.toFixed(3) ?? '-'}
        </Typography.Text>
      ),
    },
    {
      title: '所属子网',
      key: 'networks',
      render: (_: unknown, record: Site) => (
        <Typography.Text>{record.networks.map((network) => network.name).join(', ') || '-'}</Typography.Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'site_status',
      key: 'site_status',
      render: (value: string) => <StatusTag value={value} />,
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: Site) => (
        <Space>
          <Button
            size="small"
            onClick={() => openSiteDetail(record.id)}
          >
            详情
          </Button>
          <Button
            size="small"
            onClick={() => {
              setEditing(record);
              form.setFieldsValue({
                name: record.name ?? undefined,
                fourCharId: record.four_char_id ?? undefined,
                domesNumber: record.domes_number ?? undefined,
                siteStatus: record.site_status ?? undefined,
                description: record.description ?? undefined,
                latitude: record.latitude ?? undefined,
                longitude: record.longitude ?? undefined,
                ellipsoidalHeight: record.ellipsoidal_height ?? undefined,
                monumentDescription: record.monument_description ?? undefined,
                monumentFoundation: record.monument_foundation ?? undefined,
                markerDescription: record.marker_description ?? undefined,
                monumentHeight: record.monument_height ?? undefined,
              });
              setOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="确认删除这个站点吗？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      updateMutation.mutate({ id: editing.id, values });
      return;
    }
    createMutation.mutate(values);
  };

  const buildSiteSolvePayload = async () => {
    const values = await solveForm.validateFields();
    return {
      siteId: activeSiteId,
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
    };
  };

  const handleSitePrecheck = async () => {
    const payload = await buildSiteSolvePayload();
    sitePrecheckMutation.mutate({
      ...payload,
      searchWindowMinutes: 60,
      maxCandidateEpochs: 8,
    });
  };

  const handleSiteSolveSubmit = async () => {
    const payload = await buildSiteSolvePayload();
    siteSolveMutation.mutate(payload);
  };

  const handleApplyCandidateEpoch = (epochTime: string) => {
    solveForm.setFieldsValue({ epochTime: dayjs(epochTime) });
    messageApi.success(`已回填候选历元 ${dayjs(epochTime).format('YYYY-MM-DD HH:mm:ss')}`);
  };

  const handleSiteRemoteQuery = async () => {
    if (activeSiteId === null) {
      return;
    }

    const values = await observationForm.validateFields();
    siteRemoteQueryMutation.mutate({
      siteIds: [activeSiteId],
      startDate: values.dateRange[0].startOf('day').toISOString(),
      endDate: values.dateRange[1].endOf('day').toISOString(),
      filePeriod: values.filePeriod,
      fileType: values.fileType,
      rinexVersion: values.rinexVersion,
      metadataStatus: values.metadataStatus,
      decompress: values.decompress,
    });
  };

  const handleDownloadSelectedRemoteFiles = () => {
    const selectedItems = siteRemoteResults.filter((item) => selectedSiteRemoteKeys.includes(item.fileId));

    if (selectedItems.length === 0) {
      messageApi.warning('请先选择要下载的远端文件');
      return;
    }

    siteDownloadMutation.mutate({
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

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }} className="page-stack">
      {contextHolder}
      <div className="page-hero">
        <div className="page-hero-kicker">站点管理</div>
        <h1 className="page-hero-title">维护站点元数据、状态与所属子网关系。</h1>
        <div className="page-hero-meta">
          <span>{data?.total ?? 0} 个站点节点</span>
          <span className="page-hero-meta-dot" />
          <span>元数据可编辑</span>
        </div>
      </div>

      <div className="map-panel">
        <div className="map-panel-head">
          <div>
            <h2 className="map-panel-title">Global Site Distribution</h2>
            <div className="map-panel-subtitle">站点管理地图视图</div>
          </div>
          <span className="mono-label">{mapSites?.items.length ?? 0} 个可定位站点</span>
        </div>
        <SiteLeafletMap sites={mapSites?.items ?? []} onSiteSelect={openSiteDetail} />
      </div>

      <PageSection
        title="站点管理"
        kicker="站点列表"
        extra={
          <Space>
            <Input.Search
              className="page-input"
              placeholder="搜索站点名称、四字符码或 DOMES"
              allowClear
              onSearch={setSiteKeyword}
              onChange={(event) => setSiteKeyword(event.target.value)}
              value={siteKeyword}
              style={{ width: 280 }}
            />
            <Button
              className="page-button"
              type="primary"
              onClick={() => {
                setEditing(null);
                form.resetFields();
                form.setFieldValue('siteStatus', 'PUBLIC');
                setOpen(true);
              }}
            >
              新增站点
            </Button>
          </Space>
        }
      >
        <Table
          className="soft-table"
          rowKey="id"
          loading={isLoading}
          dataSource={data?.items ?? []}
          columns={columns}
          pagination={false}
        />
      </PageSection>

      <Modal
        open={open}
        title={editing ? '编辑站点' : '新增站点'}
        width={760}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onOk={handleSubmit}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <div className="grid-form">
            <Form.Item label="站点名称" name="name">
              <Input />
            </Form.Item>
            <Form.Item label="四字符码" name="fourCharId">
              <Input />
            </Form.Item>
            <Form.Item label="DOMES" name="domesNumber">
              <Input />
            </Form.Item>
            <Form.Item label="状态" name="siteStatus">
              <Input />
            </Form.Item>
            <Form.Item label="纬度" name="latitude">
              <Input type="number" />
            </Form.Item>
            <Form.Item label="经度" name="longitude">
              <Input type="number" />
            </Form.Item>
            <Form.Item label="椭球高" name="ellipsoidalHeight">
              <Input type="number" />
            </Form.Item>
            <Form.Item label="Monument 高度" name="monumentHeight">
              <Input />
            </Form.Item>
          </div>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <div className="grid-form">
            <Form.Item label="Monument 描述" name="monumentDescription">
              <Input />
            </Form.Item>
            <Form.Item label="Foundation" name="monumentFoundation">
              <Input />
            </Form.Item>
            <Form.Item label="Marker 描述" name="markerDescription">
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Drawer
        width={760}
        open={activeSiteId !== null}
        title={activeSite ? `${activeSite.four_char_id || `SITE-${activeSite.id}`} 站点详情` : '站点详情'}
        loading={activeSiteLoading}
        onClose={() => {
          setActiveSiteId(null);
          setSitePrecheckResult(null);
          setSubmittedSolveJob(null);
          setSubmittedSolveJobId(null);
          setSiteRemoteResults([]);
          setSelectedSiteRemoteKeys([]);
          setActiveRinexFileId(null);
          solveForm.resetFields();
          observationForm.resetFields();
        }}
      >
        {activeSite ? (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <div className="detail-hero">
              <div>
                <div className="detail-kicker">Station Profile</div>
                <h2 className="detail-title">{activeSite.four_char_id || `SITE-${activeSite.id}`}</h2>
                <div className="detail-subtitle">{activeSite.name || '未命名站点'}</div>
              </div>
              <StatusTag value={activeSite.site_status} />
            </div>

            <Tabs
              className="detail-tabs"
              items={[
                {
                  key: 'basic',
                  label: '基本信息',
                  children: (
                    <Space direction="vertical" size={20} style={{ width: '100%' }}>
                      <div className="detail-stat-grid">
                        <div className="detail-stat">
                          <span>纬度</span>
                          <strong>{activeSite.latitude?.toFixed(6) ?? '-'}</strong>
                        </div>
                        <div className="detail-stat">
                          <span>经度</span>
                          <strong>{activeSite.longitude?.toFixed(6) ?? '-'}</strong>
                        </div>
                        <div className="detail-stat">
                          <span>椭球高</span>
                          <strong>{activeSite.ellipsoidal_height?.toFixed(3) ?? '-'}</strong>
                        </div>
                      </div>

                      <Descriptions bordered column={2}>
                        <Descriptions.Item label="DOMES">{detailText(activeSite.domes_number)}</Descriptions.Item>
                        <Descriptions.Item label="来源">{detailText(activeSite.source_type)}</Descriptions.Item>
                        <Descriptions.Item label="外部 ID">{detailText(activeSite.external_id)}</Descriptions.Item>
                        <Descriptions.Item label="安装日期">{detailDate(activeSite.date_installed)}</Descriptions.Item>
                        <Descriptions.Item label="创建时间">{detailDate(activeSite.created_at)}</Descriptions.Item>
                        <Descriptions.Item label="更新时间">{detailDate(activeSite.updated_at)}</Descriptions.Item>
                        <Descriptions.Item label="描述" span={2}>
                          {detailText(activeSite.description)}
                        </Descriptions.Item>
                      </Descriptions>

                      <Descriptions bordered column={1}>
                        <Descriptions.Item label="Monument 描述">{detailText(activeSite.monument_description)}</Descriptions.Item>
                        <Descriptions.Item label="Foundation">{detailText(activeSite.monument_foundation)}</Descriptions.Item>
                        <Descriptions.Item label="Marker 描述">{detailText(activeSite.marker_description)}</Descriptions.Item>
                        <Descriptions.Item label="Monument 高度">{detailText(activeSite.monument_height)}</Descriptions.Item>
                        <Descriptions.Item label="地质特征">{detailText(activeSite.geologic_characteristic)}</Descriptions.Item>
                        <Descriptions.Item label="基岩类型">{detailText(activeSite.bedrock_type)}</Descriptions.Item>
                      </Descriptions>
                    </Space>
                  ),
                },
                {
                  key: 'networks',
                  label: '子网信息',
                  children: (
                    <div className="detail-section">
                      <div className="detail-section-head">
                        <div>
                          <div className="detail-kicker">Network Membership</div>
                          <h3 className="detail-section-title">所属子网</h3>
                        </div>
                        <span className="mono-label">{activeSite.networks.length} 个子网</span>
                      </div>
                      <div className="detail-chip-list">
                        {activeSite.networks.length > 0
                          ? activeSite.networks.map((network) => (
                              <span className="detail-chip" key={network.id}>
                                {network.name}
                                <StatusTag value={network.status} />
                              </span>
                            ))
                          : <Typography.Text type="secondary">暂无子网绑定</Typography.Text>}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'solve',
                  label: '解算',
                  children: (
                    <Space direction="vertical" size={20} style={{ width: '100%' }}>
                      <div className="detail-section">
                        <div className="detail-section-head">
                          <div>
                            <div className="detail-kicker">Observation Data</div>
                            <h3 className="detail-section-title">观测数据</h3>
                          </div>
                          <Space>
                            <Button loading={siteRemoteQueryMutation.isPending} onClick={handleSiteRemoteQuery}>
                              查询远端
                            </Button>
                            <Button type="primary" loading={siteDownloadMutation.isPending} onClick={handleDownloadSelectedRemoteFiles}>
                              下载选中
                            </Button>
                          </Space>
                        </div>
                        <div className="detail-solve-body">
                          <Form
                            form={observationForm}
                            layout="vertical"
                            initialValues={{
                              filePeriod: ['01D'],
                              fileType: ['obs'],
                              rinexVersion: ['3'],
                              metadataStatus: 'valid',
                              decompress: true,
                              dateRange: [dayjs().subtract(7, 'day'), dayjs()],
                            }}
                          >
                            <div className="grid-form grid-form-3">
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
                              <Form.Item label="下载前解压" name="decompress" valuePropName="checked">
                                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                              </Form.Item>
                            </div>
                          </Form>

                          <div className="detail-section compact">
                            <div className="detail-section-head">
                              <div>
                                <div className="detail-kicker">Remote Candidates</div>
                                <h3 className="detail-section-title">远端查询结果</h3>
                              </div>
                              <span className="mono-label">{siteRemoteResults.length} 个候选文件</span>
                            </div>
                            <Table
                              className="soft-table"
                              rowKey="fileId"
                              loading={siteRemoteQueryMutation.isPending}
                              dataSource={siteRemoteResults}
                              columns={siteRemoteColumns}
                              rowSelection={{
                                selectedRowKeys: selectedSiteRemoteKeys,
                                onChange: (keys) => setSelectedSiteRemoteKeys(keys.map(String)),
                              }}
                              pagination={{ pageSize: 5 }}
                            />
                          </div>

                          <div className="detail-section compact">
                            <div className="detail-section-head">
                              <div>
                                <div className="detail-kicker">Local Cache</div>
                                <h3 className="detail-section-title">本地已下载文件</h3>
                              </div>
                              <span className="mono-label">{siteLocalFiles?.total ?? 0} 个本地文件</span>
                            </div>
                            <Table
                              className="soft-table"
                              rowKey="id"
                              loading={siteLocalFilesLoading}
                              dataSource={siteLocalFiles?.items ?? []}
                              columns={siteLocalFileColumns}
                              pagination={{ pageSize: 5 }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="detail-section">
                        <div className="detail-section-head">
                          <div>
                            <div className="detail-kicker">SPP Solver</div>
                            <h3 className="detail-section-title">执行解算</h3>
                          </div>
                          <Space>
                            <Button loading={sitePrecheckMutation.isPending} onClick={handleSitePrecheck}>
                              执行预检
                            </Button>
                            <Button type="primary" loading={siteSolveMutation.isPending} onClick={handleSiteSolveSubmit}>
                              提交 SPP 任务
                            </Button>
                          </Space>
                        </div>
                        <div className="detail-solve-body">
                          <Form
                            form={solveForm}
                            layout="vertical"
                            initialValues={{
                              navigationFileIds: [],
                              constellations: ['GPS'],
                              elevationMaskDeg: 10,
                              epochTime: dayjs(),
                            }}
                          >
                            <div className="grid-form grid-form-3">
                              <Form.Item
                                label="观测文件"
                                name="observationFileId"
                                rules={[{ required: true, message: '请选择本站本地观测文件' }]}
                              >
                                <Select
                                  className="page-select"
                                  showSearch
                                  loading={observationFilesLoading}
                                  options={observationOptions}
                                  optionFilterProp="label"
                                  placeholder="选择观测 RINEX"
                                />
                              </Form.Item>
                              <Form.Item
                                label="导航文件"
                                name="navigationFileIds"
                                rules={[{ required: true, message: '请选择至少一个本地导航文件' }]}
                              >
                                <Select
                                  className="page-select"
                                  mode="multiple"
                                  showSearch
                                  loading={navigationFilesLoading}
                                  options={navigationOptions}
                                  optionFilterProp="label"
                                  placeholder="选择导航 RINEX"
                                />
                              </Form.Item>
                              <Form.Item label="解算时刻" name="epochTime" rules={[{ required: true, message: '请选择解算时刻' }]}>
                                <DatePicker className="page-picker" showTime style={{ width: '100%' }} />
                              </Form.Item>
                              <Form.Item label="星座" name="constellations" rules={[{ required: true, message: '请选择星座' }]}>
                                <Select
                                  className="page-select"
                                  mode="multiple"
                                  options={[
                                    { value: 'GPS' },
                                    { value: 'GAL' },
                                    { value: 'BDS', disabled: true },
                                    { value: 'GLO', disabled: true },
                                  ]}
                                />
                              </Form.Item>
                              <Form.Item label="截止高度角" name="elevationMaskDeg">
                                <Select className="page-select" options={[{ value: 5 }, { value: 10 }, { value: 15 }, { value: 20 }]} />
                              </Form.Item>
                            </div>
                          </Form>

                          {observationOptions.length === 0 ? (
                            <Alert type="warning" showIcon message="当前站点暂无本地观测文件，需先在本页下载并索引 RINEX。" />
                          ) : null}
                          {navigationOptions.length === 0 ? (
                            <Alert type="warning" showIcon message="暂无可用本地导航文件，需先下载导航 RINEX 后才能提交真实 SPP 解算。" />
                          ) : null}

                          {sitePrecheckResult ? (
                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                              <Alert
                                type={
                                  sitePrecheckResult.status === 'ready'
                                    ? 'success'
                                    : sitePrecheckResult.status === 'risky'
                                      ? 'warning'
                                      : 'error'
                                }
                                showIcon
                                message={`预检结论：${sitePrecheckResult.recommendation}`}
                                action={
                                  sitePrecheckResult.nearestCandidateEpochTime ? (
                                    <Button size="small" type="primary" onClick={() => handleApplyCandidateEpoch(sitePrecheckResult.nearestCandidateEpochTime!)}>
                                      回填最近历元
                                    </Button>
                                  ) : undefined
                                }
                              />
                              {sitePrecheckResult.reasons.length > 0 ? (
                                <Alert type="info" showIcon message={sitePrecheckResult.reasons.join(' ')} />
                              ) : null}
                              <Table
                                className="soft-table"
                                rowKey={(row) => row.epochTime}
                                dataSource={sitePrecheckResult.candidateEpochs}
                                pagination={{ pageSize: 4 }}
                                columns={[
                                  { title: '候选历元', dataIndex: 'epochTime', key: 'epochTime' },
                                  { title: '偏差(秒)', dataIndex: 'offsetSeconds', key: 'offsetSeconds' },
                                  { title: '总卫星数', dataIndex: 'totalSatellites', key: 'totalSatellites' },
                                  {
                                    title: '分系统',
                                    key: 'perSystemCounts',
                                    render: (_: unknown, row: SppPrecheck['candidateEpochs'][number]) =>
                                      Object.entries(row.perSystemCounts)
                                        .map(([system, count]) => `${system}:${count}`)
                                        .join(' / '),
                                  },
                                  {
                                    title: '操作',
                                    key: 'action',
                                    render: (_: unknown, row: SppPrecheck['candidateEpochs'][number]) => (
                                      <Button size="small" onClick={() => handleApplyCandidateEpoch(row.epochTime)}>
                                        回填
                                      </Button>
                                    ),
                                  },
                                ]}
                              />
                            </Space>
                          ) : null}

                          {submittedSolveJob ? (
                            <Alert
                              type={submittedSolveJob.status === 'succeeded' ? 'success' : 'warning'}
                              showIcon
                              message={`SPP 任务 #${submittedSolveJob.id}：${submittedSolveJob.status}`}
                              description={
                                submittedSolveJob.error_message ??
                                `引擎：${submittedSolveJob.engine ?? '-'}，卫星数：${String(submittedSolveJob.summary?.nsatUsed ?? '-')}`
                              }
                            />
                          ) : null}

                          {coordinateAnalysis ? (
                            <div className="detail-section compact">
                              <div className="detail-section-head">
                                <div>
                                  <div className="detail-kicker">Coordinate QA</div>
                                  <h3 className="detail-section-title">坐标误差分析</h3>
                                </div>
                                <StatusTag value={coordinateAnalysis.horizontalError <= 5 ? 'succeeded' : 'running'} />
                              </div>
                              <div className="detail-solve-body">
                                <div className="detail-stat-grid">
                                  <div className="detail-stat">
                                    <span>东向误差</span>
                                    <strong>{formatMeters(coordinateAnalysis.eastError)}</strong>
                                  </div>
                                  <div className="detail-stat">
                                    <span>北向误差</span>
                                    <strong>{formatMeters(coordinateAnalysis.northError)}</strong>
                                  </div>
                                  <div className="detail-stat">
                                    <span>高程误差</span>
                                    <strong>{formatMeters(coordinateAnalysis.heightError)}</strong>
                                  </div>
                                </div>
                                <Descriptions bordered column={2}>
                                  <Descriptions.Item label="平面误差">{formatMeters(coordinateAnalysis.horizontalError)}</Descriptions.Item>
                                  <Descriptions.Item label="三维误差">{formatMeters(coordinateAnalysis.spatialError)}</Descriptions.Item>
                                  <Descriptions.Item label="元数据坐标" span={2}>
                                    {activeSite.latitude?.toFixed(8) ?? '-'}, {activeSite.longitude?.toFixed(8) ?? '-'}, {activeSite.ellipsoidal_height?.toFixed(3) ?? '-'}
                                  </Descriptions.Item>
                                  <Descriptions.Item label="解算坐标" span={2}>
                                    {submittedSolveEpochs?.[0]?.latitude?.toFixed(8) ?? '-'}, {submittedSolveEpochs?.[0]?.longitude?.toFixed(8) ?? '-'}, {submittedSolveEpochs?.[0]?.height?.toFixed(3) ?? '-'}
                                  </Descriptions.Item>
                                </Descriptions>
                              </div>
                            </div>
                          ) : submittedSolveJob ? (
                            <Alert type="info" showIcon message="当前结果或站点元数据缺少经纬高，暂不能生成坐标误差分析。" />
                          ) : null}
                        </div>
                      </div>
                    </Space>
                  ),
                },
              ]}
            />
          </Space>
        ) : null}
      </Drawer>

      <Drawer
        width={720}
        open={activeRinexFileId !== null}
        title={activeRinexFile?.filename ?? 'RINEX 文件详情'}
        onClose={() => setActiveRinexFileId(null)}
      >
        {activeRinexFile ? (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Descriptions bordered column={1}>
              <Descriptions.Item label="站点">
                {activeRinexFile.four_char_id ?? activeRinexFile.station_id ?? '-'} / {activeRinexFile.site_name ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="本地路径">{activeRinexFile.local_path ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="文件类型">{activeRinexFile.file_type ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="文件周期">{activeRinexFile.file_period ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="RINEX 版本">{activeRinexFile.rinex_version ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="压缩类型">{activeRinexFile.compression_type ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="采样间隔">
                {activeRinexEpochs?.sample_interval_seconds ?? activeRinexFile.sample_interval_seconds ?? '-'}
              </Descriptions.Item>
              <Descriptions.Item label="时间覆盖">
                {(activeRinexEpochs?.start_time || activeRinexFile.start_time || '-') +
                  ' ~ ' +
                  (activeRinexEpochs?.end_time || activeRinexFile.end_time || '-')}
              </Descriptions.Item>
              <Descriptions.Item label="星座">
                {(activeRinexFile.constellations_json ?? []).join(', ') || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="索引状态">
                <StatusTag value={activeRinexFile.index_status} />
              </Descriptions.Item>
              <Descriptions.Item label="错误信息">{activeRinexFile.last_error ?? '-'}</Descriptions.Item>
            </Descriptions>

            <PageSection title="头部摘要">
              <Typography.Paragraph>
                观测类型系统数：{Object.keys(activeRinexHeader?.header?.observation_types ?? {}).length}
              </Typography.Paragraph>
              <Typography.Text type="secondary">头部前 120 行：</Typography.Text>
              <pre className="header-preview">
                {(activeRinexHeader?.header?.header_lines ?? []).join('\n') || '暂无头部信息'}
              </pre>
            </PageSection>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
